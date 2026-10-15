import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTextOnPath, normalizeTextPathBinding, flattenTextPath } from '../src/textOnPath.ts';

const path = {
  nodes: [{ x: 0, y: 10 }, { x: 100, y: 10 }], closed: false,
  fill: false, stroke: true, strokeWidth: 1, fillColor: '#000000', strokeColor: '#000000',
};

test('text path bindings normalize bounded offsets and fail closed', () => {
  assert.deepEqual(normalizeTextPathBinding({ pathLayerId: 'p', offset: 12, reverse: true }), { pathLayerId: 'p', offset: 12, reverse: true });
  assert.deepEqual(normalizeTextPathBinding({ pathLayerId: 'p', offset: 999999 }), { pathLayerId: 'p', offset: 100000, reverse: false });
  assert.equal(normalizeTextPathBinding({ pathLayerId: '' }), undefined);
});

test('text path layout is deterministic and follows a straight baseline', () => {
  const points = flattenTextPath(path);
  const context = { measureText: (value) => ({ width: value.length * 10 }) };
  const result = layoutTextOnPath(context, 'AB', points, { offset: 0, reverse: false });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(({ glyph, x, y }) => ({ glyph, x: Math.round(x), y: Math.round(y) })), [
    { glyph: 'A', x: 5, y: 10 }, { glyph: 'B', x: 15, y: 10 },
  ]);
  assert.equal(result[0].rotation, 0);
});

test('reverse text path layout reverses direction without mutating the path', () => {
  const points = flattenTextPath(path);
  const context = { measureText: () => ({ width: 10 }) };
  const result = layoutTextOnPath(context, 'AB', points, { offset: 0, reverse: true });
  assert.deepEqual(result.map(({ glyph, x }) => ({ glyph, x: Math.round(x) })), [
    { glyph: 'A', x: 95 }, { glyph: 'B', x: 85 },
  ]);
  assert.deepEqual(path.nodes, [{ x: 0, y: 10 }, { x: 100, y: 10 }]);
});
