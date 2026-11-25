import test from 'node:test';
import assert from 'node:assert/strict';
import { toolArgumentObject } from '../../shared/toolArguments.ts';

test('cloud native tool arguments accept an object or one JSON object string', () => {
  assert.deepEqual(toolArgumentObject({ quantity: 3 }), { quantity: 3 });
  assert.deepEqual(toolArgumentObject('{"quantity":3}'), { quantity: 3 });
});

test('cloud native tool arguments reject invalid JSON, primitives and arrays', () => {
  for (const input of [null, undefined, 3, [], 'null', '[]', '"text"', 'invalid JSON']) {
    assert.throws(() => toolArgumentObject(input));
  }
});
