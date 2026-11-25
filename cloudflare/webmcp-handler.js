// Generic inference endpoint: page tools are supplied by the extension.
// No page callback or business action is executed by this Worker.
async function handleWebMcp(request, env) {
  const reply = (body, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (!env.POC_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.POC_TOKEN}`) {
    return reply({ error: 'unauthorized' }, 401);
  }
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid_request' }, 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        return reply({ error: 'too_large' }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return reply({ error: 'invalid_json' }, 400);
  }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 64 ||
      body.messages.some((m) => !m || !['system', 'developer', 'user', 'assistant', 'tool'].includes(m.role)) ||
      (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 32 ||
        body.tools.some((t) => t?.type !== 'function' || typeof t.function?.name !== 'string'))) ||
      (body.stream !== undefined && typeof body.stream !== 'boolean')) {
    return reply({ error: 'invalid_request' }, 400);
  }
  const stream = body.stream === true;
  let modelId = env.MODEL_ID || WEBMCP_MODEL_CATALOG.defaultModel;
  if (env.ALLOW_MODEL_SELECTION) {
    // The old extension sent this placeholder; keep the submitted 1.1.0 working.
    modelId = body.model === undefined || body.model === 'worker-configured-model'
      ? WEBMCP_MODEL_CATALOG.defaultModel : body.model;
    if (!WEBMCP_MODEL_CATALOG.models.some(model => model.id === modelId)) return reply({ error: 'model_not_allowed' }, 400);
  }
  const buffered = modelId === '@cf/ibm-granite/granite-4.0-h-micro';
  try {
    const result = await env.AI.run(modelId, {
      // Granite's chat template rejects null assistant content on tool-call turns.
      // Preserve its native calls and results; only represent absent text as ''.
      messages: modelId === '@cf/ibm-granite/granite-4.0-h-micro'
        ? body.messages.map(message => message.role === 'assistant' && message.content === null ? { ...message, content: '' } : message)
        : body.messages,
      ...(body.tools?.length ? { tools: body.tools, ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}) } : {}),
      parallel_tool_calls: false,
      ...(modelId === '@cf/ibm-granite/granite-4.0-h-micro' ? { max_tokens: 2048 } : { reasoning_effort: 'low', max_completion_tokens: 2048 }),
      stream: buffered ? false : stream,
      ...(stream && !buffered ? { stream_options: { include_usage: true } } : {}),
    });
    // Granite currently rejects streaming requests with tool-result history.
    // Its native non-streamed completion still carries actual structured calls.
    if (stream && buffered) return nativeCompletionSse(result);
    if (stream) {
      return new Response(normalizeWebMcpSse(result), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return reply(result);
  } catch {
    return reply({ error: 'inference_failed' }, 502);
  }
}

function nativeCompletionSse(completion) {
  if (!Array.isArray(completion?.choices) || !completion.choices[0]?.message) throw Error('Expected native completion');
  const choice = completion.choices[0];
  const { tool_calls, ...message } = choice.message;
  const chunk = { id: completion.id, object: 'chat.completion.chunk', created: completion.created, model: completion.model,
    choices: [{ index: 0, delta: { ...message, ...(tool_calls?.length ? { tool_calls: tool_calls.map((call, index) => ({ ...call, index })) } : {}) }, finish_reason: choice.finish_reason }],
  };
  const usage = completion.usage ? `data: ${JSON.stringify({ id: completion.id, object: chunk.object, created: completion.created, model: completion.model, choices: [], usage: completion.usage })}\n\n` : '';
  return new Response(`data: ${JSON.stringify(chunk)}\n\n${usage}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// The AI binding appends {response:'', usage} after native OpenAI chunks.
// Convert only that usage trailer; native text and tool-call deltas pass through.
function normalizeWebMcpSse(source) {
  let pending = '';
  let metadata = {};
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  function emit(event, controller) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') {
      const payload = JSON.parse(data);
      if (Array.isArray(payload.choices)) {
        metadata = { id: payload.id, object: 'chat.completion.chunk', created: payload.created, model: payload.model };
      } else if (payload.response === '' && payload.usage && metadata.id) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...metadata, choices: [], usage: payload.usage })}\n\n`));
        return;
      } else if (!payload.error) {
        throw new Error('Expected native Chat Completions SSE');
      }
    }
    controller.enqueue(encoder.encode(event + '\n\n'));
  }
  function drain(controller, final = false) {
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(pending))) {
      const event = pending.slice(0, boundary.index);
      pending = pending.slice(boundary.index + boundary[0].length);
      if (event) emit(event, controller);
    }
    if (pending.length > 1048576) throw new Error('SSE event too large');
    if (final && pending.trim()) { emit(pending, controller); pending = ''; }
  }
  return source.pipeThrough(new TransformStream({
    transform(chunk, controller) { pending += decoder.decode(chunk, { stream: true }); drain(controller); },
    flush(controller) { pending += decoder.decode(); drain(controller, true); },
  }));
}
