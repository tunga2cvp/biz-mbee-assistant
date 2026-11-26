import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toolSuggestions } from '../../extension/sidepanel/services/toolSuggestions.js';

test('tool suggestions cover distinct tasks, deduplicate tools and never invent input values', () => {
  const suggestions = toolSuggestions([
    { name: 'getMenu', readOnlyHint: true }, { name: 'getDetails', readOnlyHint: true },
    { name: 'getMenu' }, { name: 'searchOrders' }, { name: 'orderPizza' },
  ]);
  assert.equal(suggestions.length, 3);
  assert.deepEqual(suggestions.map(item => item.toolName), ['getMenu', 'searchOrders', 'orderPizza']);
  for (const item of suggestions) assert.match(item.prompt, /Hãy hỏi tôi những thông tin còn thiếu/);
  assert.deepEqual(toolSuggestions([]), []);
});
test('hosted UI renders Vietnamese onboarding, permissions and accessible controls', async (t) => {
  const original = process.env.WEBMCP_CLOUD_URL;
  process.env.WEBMCP_CLOUD_URL = 'https://worker.test';
  t.after(() => { if (original === undefined) delete process.env.WEBMCP_CLOUD_URL; else process.env.WEBMCP_CLOUD_URL = original; });
  const { ConsentScreen } = await import('../../extension/sidepanel/screens/ConsentScreen.js');
  const { AllowToolPermissionCard } = await import('../../extension/sidepanel/components/AllowToolPermissionCard.js');
  const { ToolCheckpointCard } = await import('../../extension/sidepanel/components/ToolCheckpointCard.js');
  const { Toolbar } = await import('../../extension/sidepanel/components/Toolbar.js');
  const consent = renderToStaticMarkup(React.createElement(ConsentScreen));
  assert.match(consent, /Xin chào!/);
  assert.match(consent, /Đã hiểu/);
  assert.ok(!consent.includes('Reach your goals'));
  const permission = renderToStaticMarkup(React.createElement(AllowToolPermissionCard, { toolName: 'submit', consequential: true, onAllow() {}, onDeny() {} }));
  assert.match(permission, /Thao tác có thể không hoàn tác được/);
  assert.match(permission, /Cho phép/);
  const checkpoint = renderToStaticMarkup(React.createElement(ToolCheckpointCard, { roundsUsed: 8, maxRounds: 16, onAllow() {}, onDeny() {} }));
  assert.match(checkpoint, /Đã gọi công cụ 8 lượt/);
  const toolbar = renderToStaticMarkup(React.createElement(Toolbar, { actionVariant: 'send', onSettingsClick() {} }));
  assert.match(toolbar, /aria-label="Cài đặt"/);
  assert.match(toolbar, /aria-label="Gửi yêu cầu"/);
});
