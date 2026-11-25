import fs from 'node:fs/promises';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, jsonSchema } from 'ai';
import catalog from '../shared/cloudModels.json' with { type: 'json' };
import { toolArgumentObject } from '../shared/toolArguments.ts';

const credentials = JSON.parse(await fs.readFile(new URL('../../cloudflare/private/test-login.json', import.meta.url), 'utf8'));
const endpoint = 'https://biz.thanhtunga2cvp.workers.dev';
const login = await fetch(`${endpoint}/extension/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
if (!login.ok) throw Error(`Login HTTP ${login.status}`);
const session = await login.json();
const client = createOpenAI({ baseURL: `${endpoint}/extension/v1`, apiKey: session.token });
const tools = { calculate_demo_total: tool({ description: 'Calculate a total using supplied quantity and unitPrice. Use this tool for multiplication.', inputSchema: jsonSchema({ type: 'object', properties: { quantity: { type: 'integer' }, unitPrice: { type: 'integer' } }, required: ['quantity', 'unitPrice'], additionalProperties: false }) }) };
const results = [];
for (const entry of catalog.models) {
  try {
    const messages = [{ role: 'user', content: 'Use calculate_demo_total with quantity 3 and unitPrice 12000. Do not calculate yourself.' }];
    const first = streamText({ model: client.chat(entry.id), messages, tools, maxRetries: 0, abortSignal: AbortSignal.timeout(120000) });
    for await (const part of first.fullStream) { if (part.type === 'error') throw part.error; }
    const calls = await first.toolCalls;
    for (const call of calls) call.input = toolArgumentObject(call.input);
    if (calls.length !== 1 || calls[0].toolName !== 'calculate_demo_total' || calls[0].input.quantity !== 3 || calls[0].input.unitPrice !== 12000) throw Error(`Invalid native tool calls: ${JSON.stringify(calls)}`);
    const response = await first.response;
    for (const message of response.messages) if (message.role === 'assistant' && Array.isArray(message.content)) for (const part of message.content) if (part.type === 'tool-call') part.input = toolArgumentObject(part.input);
    messages.push(...response.messages, { role: 'tool', content: [{ type: 'tool-result', toolCallId: calls[0].toolCallId, toolName: calls[0].toolName, output: { type: 'text', value: '36000' } }] });
    const next = streamText({ model: client.chat(entry.id), system: 'The tool already returned its answer. Answer the user in Vietnamese and do not call any tool again.', messages, tools, maxRetries: 0, abortSignal: AbortSignal.timeout(120000) });
    for await (const part of next.fullStream) { if (part.type === 'error') throw part.error; }
    const answer = await next.text;
    if (!/36[.,\s]?000/.test(answer)) throw Error('Tool result was not acknowledged');
    results.push({ model: entry.id, status: 'passed', arguments: calls[0].input, answer });
    console.log('PASS', entry.id);
  } catch (error) {
    if (error.requestBodyValues) await fs.writeFile(new URL('../../artifacts/model-selection/provider-failure-request.json', import.meta.url), JSON.stringify(error.requestBodyValues, null, 2));
    results.push({ model: entry.id, status: 'failed', error: String(error) });
    console.error('FAIL', entry.id, String(error));
    process.exitCode = 1;
  }
}
await fs.mkdir(new URL('../../artifacts/model-selection/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../../artifacts/model-selection/provider-results.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
