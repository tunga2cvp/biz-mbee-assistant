import test from 'node:test';
import assert from 'node:assert/strict';
import { QuotaStore, nextQuotaReset } from '../../extension/sidepanel/services/cloudQuota.js';

test('a quota result from a logged-out session cannot repopulate the panel', () => {
  const quota = new QuotaStore();
  const epoch = quota.start();
  quota.clear();
  quota.report('exhausted', '2026-11-27T00:00:00Z', epoch);
  assert.equal(quota.getSnapshot().status, 'unknown');
  assert.equal(quota.getSnapshot().checking, false);
});
test('quota exhaustion expires at UTC midnight; availability expires after five minutes', () => {
  const quota = new QuotaStore();
  quota.report('exhausted', '2026-11-27T00:00:00Z', quota.getEpoch(), '', '2026-11-26T15:00:00Z');
  quota.expire(Date.parse('2026-11-26T23:59:59Z'));
  assert.equal(quota.getSnapshot().status, 'exhausted');
  quota.expire(Date.parse('2026-11-27T00:00:00Z'));
  assert.equal(quota.getSnapshot().status, 'unknown');
  quota.report('available', '2026-11-28T00:00:00Z', quota.getEpoch(), '', '2026-11-27T12:00:00Z');
  quota.expire(Date.parse('2026-11-27T12:05:00Z'));
  assert.equal(quota.getSnapshot().status, 'unknown');
  assert.equal(nextQuotaReset(Date.parse('2026-11-27T00:00:00Z')), '2026-11-28T00:00:00.000Z');
});
test('a delayed probe cannot replace a newer quota failure from chat', () => {
  const quota = new QuotaStore();
  const epoch = quota.start();
  quota.report('exhausted', '2026-11-27T00:00:00Z', epoch, '', '2026-11-26T15:01:00Z');
  quota.report('available', '2026-11-27T00:00:00Z', epoch, '', '2026-11-26T15:00:00Z');
  assert.equal(quota.getSnapshot().status, 'exhausted');
});
