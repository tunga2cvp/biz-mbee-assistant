import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenUsageStore } from '../../extension/sidepanel/services/tokenUsage.ts';

test('usage includes each tool round and keeps both models when chats are switched', () => {
  const store = new TokenUsageStore();
  store.record('qwen', { inputTokens: 100, outputTokens: 20, totalTokens: 120, inputTokenDetails: { cacheReadTokens: 40 }, outputTokenDetails: { reasoningTokens: 5 } });
  store.record('qwen', { inputTokens: 150, outputTokens: 10, totalTokens: 160 });
  store.record('granite', { inputTokens: 80, outputTokens: 5 });
  const state = store.getSnapshot();
  assert.deepEqual(state.total, { requests: 3, missing: 0, input: 330, output: 35, total: 365, cached: 40, reasoning: 5 });
  assert.equal(state.models.qwen.requests, 2);
  assert.equal(state.models.granite.total, 85);
});

test('missing and invalid provider usage is marked incomplete rather than reported as zero use', () => {
  const store = new TokenUsageStore();
  store.record('qwen', undefined);
  assert.equal(store.getSnapshot().last?.total, null);
  store.record('qwen', { inputTokens: NaN, outputTokens: -1, totalTokens: Infinity });
  assert.equal(store.getSnapshot().total.missing, 2);
  assert.equal(store.getSnapshot().total.total, 0);
});

test('logout clears usage and rejects results from the old authentication epoch', () => {
  const store = new TokenUsageStore();
  const epoch = store.getEpoch();
  store.record('qwen', { inputTokens: 10, outputTokens: 5 });
  store.clear();
  store.record('qwen', { inputTokens: 100, outputTokens: 50 }, epoch);
  assert.equal(store.getSnapshot().total.requests, 0);
  assert.equal(store.getSnapshot().last, null);
});
