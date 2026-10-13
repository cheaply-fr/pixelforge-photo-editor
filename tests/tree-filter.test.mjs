import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels, effectiveFilterEffects, validFilterEffects } from '../src/filterEffects.ts';

const source = new Uint8ClampedArray(24 * 20 * 4);
for (let y = 0; y < 20; y += 1) for (let x = 0; x < 24; x += 1) {
  const o = (y * 24 + x) * 4;
  source[o] = 30 + x * 3; source[o + 1] = 40 + y * 4; source[o + 2] = 80; source[o + 3] = x === 0 && y === 0 ? 0 : 255;
}

test('Tree is deterministic, visibly seeded and source-safe', () => {
  const original = source.slice();
  const effect = { type: 'tree', amount: 100, radius: 8, centerX: 0.5, centerY: 0.95, seed: 17, tree: { branches: 5, leafiness: 80 } };
  const first = applyFilterEffectsPixels(source, 24, 20, effect);
  const second = applyFilterEffectsPixels(source, 24, 20, effect);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.deepEqual(source, original);
  for (let i = 3; i < first.length; i += 4) assert.equal(first[i], source[i]);
  assert.deepEqual(Array.from(first.slice(0, 3)), Array.from(source.slice(0, 3)));
});

test('Tree controls normalize, validate and round-trip within bounds', () => {
  const normalized = effectiveFilterEffects({ type: 'tree', amount: 120, radius: 90, tree: { branches: 99, leafiness: -4 } });
  assert.deepEqual(normalized.tree, { branches: 8, leafiness: 0 });
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(validFilterEffects({ ...normalized, tree: { branches: 1, leafiness: 55 } }), false);
  assert.equal(validFilterEffects({ ...normalized, tree: { branches: 5, leafiness: 101 } }), false);
});

test('Tree seed changes the deterministic canopy while alpha padding stays safe', () => {
  const a = applyFilterEffectsPixels(source, 24, 20, { type: 'tree', amount: 100, radius: 8, seed: 1, tree: { branches: 5, leafiness: 70 } });
  const b = applyFilterEffectsPixels(source, 24, 20, { type: 'tree', amount: 100, radius: 8, seed: 2, tree: { branches: 5, leafiness: 70 } });
  assert.notDeepEqual(a, b);
  assert.equal(a[3], 0); assert.equal(b[3], 0);
});
