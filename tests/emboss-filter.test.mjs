import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels, effectiveFilterEffects, validFilterEffects } from '../src/filterEffects.ts';

const source = new Uint8ClampedArray(12 * 8 * 4);
for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) {
  const o = (y * 12 + x) * 4;
  source[o] = x < 6 ? 20 : 220; source[o + 1] = y * 20; source[o + 2] = 90; source[o + 3] = x === 0 && y === 0 ? 0 : 255;
}

test('Emboss is deterministic, directional and source-safe', () => {
  const original = source.slice();
  const effect = { type: 'emboss', amount: 100, radius: 24, angle: 45 };
  const first = applyFilterEffectsPixels(source, 12, 8, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 12, 8, effect));
  assert.notDeepEqual(first, source);
  assert.deepEqual(source, original);
  for (let i = 3; i < first.length; i += 4) assert.equal(first[i], source[i]);
  assert.deepEqual(Array.from(first.slice(0, 3)), Array.from(source.slice(0, 3)));
});

test('Emboss amount and light angle are bounded and editable', () => {
  const a = applyFilterEffectsPixels(source, 12, 8, { type: 'emboss', amount: 100, radius: 24, angle: 0 });
  const b = applyFilterEffectsPixels(source, 12, 8, { type: 'emboss', amount: 100, radius: 24, angle: 90 });
  assert.notDeepEqual(a, b);
  const normalized = effectiveFilterEffects({ type: 'emboss', amount: 140, radius: 99, angle: 200 });
  assert.equal(normalized.amount, 100); assert.equal(normalized.radius, 64); assert.equal(normalized.angle, 180);
  assert.equal(validFilterEffects(normalized), true);
});
