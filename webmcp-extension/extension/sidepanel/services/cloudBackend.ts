import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type ModelMessage } from 'ai';
import { appendTurnMessages, buildTools, hasPendingToolCalls } from '../../../server/tools.js';
import { buildSystemInstruction } from '../../../shared/systemPrompt.js';
import { CLOUD_URL, clearAuthSession, readAuthSession } from './authClient.js';
import { getCloudModel } from './cloudModel.js';
import { toolArgumentObject } from '../../../shared/toolArguments.js';
import { tokenUsage } from './tokenUsage.js';
import { UserFacingError, type ChatTurnRequest, type ChatTurnResponse } from '../types/index.js';

const histories = new Map<string, ModelMessage[]>();
const controllers = new Map<string, AbortController>();
const chatModels = new Map<string, string>();
let generation = 0;

export function resetCloudChat(chatId?: string): void {
  if (chatId) { controllers.get(chatId)?.abort(); controllers.delete(chatId); histories.delete(chatId); chatModels.delete(chatId); }
  else { generation++; for (const controller of controllers.values()) controller.abort(); controllers.clear(); histories.clear(); chatModels.clear(); }
}

export async function sendCloudChat(request: ChatTurnRequest, options: { signal?: AbortSignal; onText?: (text: string) => void } = {}): Promise<ChatTurnResponse> {
  const session = await readAuthSession();
  if (!session) { await clearAuthSession(); throw new UserFacingError('Vui lòng đăng nhập để sử dụng trợ lý.'); }
  const chatId = request.chatId || crypto.randomUUID();
  const previous = histories.get(chatId);
  if (request.message === undefined && !hasPendingToolCalls(previous)) throw new UserFacingError('Hội thoại đã kết thúc. Vui lòng bắt đầu hội thoại mới.');
  if (controllers.has(chatId)) throw new UserFacingError('Hội thoại này đang xử lý một yêu cầu.');
  const messages = appendTurnMessages(previous || [], request);
  if (messages.length > 60) throw new UserFacingError('Hội thoại đã dài. Vui lòng bắt đầu hội thoại mới.');
  const controller = new AbortController();
  controllers.set(chatId, controller);
  const currentGeneration = generation;
  const usageEpoch = tokenUsage.getEpoch();
  let inferenceAccepted = false;
  let usageRecorded = false;
  const modelId = chatModels.get(chatId) || getCloudModel();
  chatModels.set(chatId, modelId);
  const model = createOpenAI({
    apiKey: session.token, baseURL: `${CLOUD_URL}/extension/v1`,
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      inferenceAccepted = response.ok;
      if (response.status === 401) { await clearAuthSession(); throw new UserFacingError('Phiên đăng nhập đã hết hạn.'); }
      if (response.status === 429) throw new UserFacingError('Đã đạt giới hạn yêu cầu. Vui lòng thử lại sau một phút.');
      if (response.status === 400) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error === 'model_not_allowed') throw new UserFacingError('Model này chưa được bật trên máy chủ. Vui lòng chọn Qwen.');
      }
      return response;
    },
  }).chat(modelId);
  let fullText = '';
  try {
    const result = streamText({
      model, system: buildSystemInstruction({ format: 'Base64-encoded', howToRead: 'Decode the base64 data' }),
      messages, tools: buildTools(request.tools), maxRetries: 0,
      abortSignal: AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : []), AbortSignal.timeout(120000)]),
    });
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') { fullText += part.text; options.onText?.(fullText); }
    }
    const [response, calls, usage] = await Promise.all([result.response, result.toolCalls, result.totalUsage]);
    tokenUsage.record(modelId, usage, usageEpoch);
    usageRecorded = true;
    const functionCalls = calls.map(call => ({ id: call.toolCallId, name: call.toolName, args: toolArgumentObject(call.input) }));
    // Some small models wrap a JSON object in a JSON string. Keep the normalized
    // arguments in the history too, so the next turn sends the same native call.
    for (const message of response.messages) {
      if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type === 'tool-call') part.input = toolArgumentObject(part.input);
      }
    }
    const activeSession = await readAuthSession();
    if (controller.signal.aborted || generation !== currentGeneration || activeSession?.token !== session.token) throw new DOMException('Session ended', 'AbortError');
    histories.delete(chatId);
    histories.set(chatId, [...messages, ...response.messages]);
    if (histories.size > 100) { const oldest = histories.keys().next().value!; histories.delete(oldest); chatModels.delete(oldest); }
    return { chatId, text: fullText, functionCalls };
  } finally {
    if (inferenceAccepted && !usageRecorded) tokenUsage.record(modelId, undefined, usageEpoch);
    if (controllers.get(chatId) === controller) controllers.delete(chatId);
    if (!histories.has(chatId)) chatModels.delete(chatId);
  }
}
