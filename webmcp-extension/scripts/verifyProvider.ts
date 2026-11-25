import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { streamText, type ModelMessage } from 'ai';
import { loadDotEnv } from '../server/security.ts';
import { loadProviders } from '../server/providers.ts';
import { buildTools, appendTurnMessages } from '../server/tools.ts';
import { buildSystemInstruction } from '../shared/systemPrompt.ts';

const config = loadProviders(loadDotEnv(fileURLToPath(new URL('../.env', import.meta.url))));
if (!config.model) throw Error(config.problem ?? 'No model');
const tools = buildTools([{
  name: 'integration_probe_total',
  description: 'Compute a total using the quantity and unit price explicitly supplied by the user. Ask for any missing values.',
  parameters: { type: 'object', properties: { quantity: { type: 'integer' }, unitPrice: { type: 'integer' } }, required: ['quantity', 'unitPrice'], additionalProperties: false },
}]);
const system = buildSystemInstruction({ format: 'Base64-encoded', howToRead: 'Decode the base64 data' });
const messages: ModelMessage[] = [{ role: 'user', content: 'Dùng công cụ tính giúp 3 sản phẩm, giá mỗi sản phẩm 12000.' }];
const first = streamText({ model: config.model, system, messages, tools, maxRetries: 0, abortSignal: AbortSignal.timeout(60000) });
const parts: string[] = [];
for await (const part of first.fullStream) {
  parts.push(part.type);
  if (part.type === 'error') throw part.error;
}
const calls = await first.toolCalls;
assert.equal(calls.length, 1, 'Expected an actual model tool call');
assert.equal(calls[0].toolName, 'integration_probe_total');
assert.deepEqual(calls[0].input, { quantity: 3, unitPrice: 12000 });
const history = [...messages, ...(await first.response).messages];
const continued = appendTurnMessages(history, { toolResponses: [{ functionResponse: {
  id: calls[0].toolCallId, name: calls[0].toolName, response: { result: { total: 36000 } },
} }] });
const second = streamText({ model: config.model, system, messages: continued, tools, maxRetries: 0, abortSignal: AbortSignal.timeout(60000) });
for await (const part of second.fullStream) if (part.type === 'error') throw part.error;
const answer = await second.text;
assert.match(answer.replace(/[.,\s]/g, ''), /36000/);
const evidence = { checkedAt: new Date().toISOString(), model: config.spec, streamEventTypes: [...new Set(parts)], toolCalls: calls.map(c => ({ name: c.toolName, input: c.input })), suppliedToolResult: { total: 36000 }, finalAnswer: answer, note: 'Real provider inference. Tool result supplied by integration test; browser callback is a separate acceptance check.' };
await fs.writeFile(new URL('../../provider-verification.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
