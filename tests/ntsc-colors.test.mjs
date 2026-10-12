import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels, effectiveFilterEffects, isNeutralFilterEffects, validFilterEffects } from '../src/filterEffects.ts';
import { appendActionStep, createActionSet, parseActionSets, serializeActionSets } from '../src/actions.ts';

const effect = { type: 'ntsc-colors', amount: 100, radius: 0 };
const envelope = ([r, g, b]) => {
  const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const c = Math.hypot(0.596 * r - 0.274 * g - 0.322 * b, 0.211 * r - 0.523 * g + 0.312 * b) / 255;
  return { y, c, low: y - c, high: y + c };
};
const run = (rgba, amount = 100) => applyFilterEffectsPixels(new Uint8ClampedArray(rgba), rgba.length / 4, 1, { ...effect, amount });

test('NTSC limiter reduces primary/secondary chroma and preserves luma within byte rounding', () => {
  for (const rgb of [[255,0,0], [0,255,0], [0,0,255], [255,255,0], [255,0,255], [0,255,255]]) {
    const source = [...rgb, 255];
    const result = Array.from(run(source));
    assert.notDeepEqual(result, source);
    const before = envelope(rgb), after = envelope(result);
    assert.ok(after.c < before.c * 0.9);
    assert.ok(after.low >= -1 / 255 && after.high <= 1 + 1 / 255);
    assert.ok(Math.abs(before.y - after.y) <= 0.5 / 255 + 1e-9);
    assert.equal(result[3], 255);
  }
});

test('NTSC limiter leaves safe colours and every neutral byte value exactly unchanged', () => {
  for (let value = 0; value <= 255; value++) {
    assert.deepEqual(Array.from(run([value, value, value, 255])), [value, value, value, 255]);
  }
  for (const rgb of [[48,76,72], [176,152,144], [100,40,80]]) {
    assert.ok(envelope(rgb).low >= 0 && envelope(rgb).high <= 1);
    assert.deepEqual(Array.from(run([...rgb, 128])), [...rgb, 128]);
  }
});

test('NTSC limiter has bounded output across the RGB cube and does not mutate source', () => {
  const values = [];
  for (let r = 0; r <= 255; r += 17)
    for (let g = 0; g <= 255; g += 17)
      for (let b = 0; b <= 255; b += 17) values.push(r, g, b, 255);
  const source = new Uint8ClampedArray(values), original = source.slice();
  const output = applyFilterEffectsPixels(source, 64, 64, effect);
  assert.notEqual(output, source);
  assert.deepEqual(source, original);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 64, 64, effect));
  for (let offset = 0; offset < output.length; offset += 4) {
    const after = envelope(output.subarray(offset, offset + 3));
    const before = envelope(source.subarray(offset, offset + 3));
    assert.ok(after.low >= -1 / 255 && after.high <= 1 + 1 / 255);
    assert.ok(Math.abs(before.y - after.y) <= 0.5 / 255 + 1e-9);
    assert.equal(output[offset + 3], 255);
  }
});

test('NTSC limiter preserves partial alpha and hidden RGB, blends amount and ignores unrelated geometry', () => {
  const source = new Uint8ClampedArray([255,0,0,128, 0,0,255,0]);
  const original = source.slice();
  const full = applyFilterEffectsPixels(source, 2, 1, effect);
  const half = applyFilterEffectsPixels(source, 2, 1, { ...effect, amount: 50 });
  assert.deepEqual(Array.from(full.subarray(4)), [0,0,255,0]);
  assert.equal(full[3], 128);
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(Math.abs(half[channel] - (source[channel] + full[channel]) / 2) <= 1);
  }
  assert.deepEqual(source, original);
  const identity = applyFilterEffectsPixels(source, 2, 1, { ...effect, amount: 0 });
  assert.notEqual(identity, source);
  assert.deepEqual(identity, source);
  assert.deepEqual(full, applyFilterEffectsPixels(source, 2, 1, {
    ...effect, radius: 64, angle: 180, seed: 4294967295, centerX: 0, centerY: 0,
  }));
  assert.equal(isNeutralFilterEffects(effect), false);
});

test('NTSC metadata and action records round-trip with explicit bounded strength', () => {
  const normalized = effectiveFilterEffects({ ...effect, amount: 200 });
  assert.equal(normalized.type, 'ntsc-colors');
  assert.equal(normalized.amount, 100);
  assert.equal(validFilterEffects(normalized), true);
  assert.deepEqual(effectiveFilterEffects(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.equal(validFilterEffects({ ...normalized, amount: NaN }), false);
  assert.equal(validFilterEffects({ ...normalized, amount: -1 }), false);
  const action = appendActionStep(createActionSet('TV colours', 'ntsc'), 'filter-ntsc-colors', 'NTSC Colors', undefined, 'ntsc-step');
  assert.deepEqual(parseActionSets(serializeActionSets([action])), [action]);
});

test('NTSC rejects malformed pixel buffers and dimensions before allocation', () => {
  assert.throws(() => applyFilterEffectsPixels([], 1, 1, effect), TypeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 2, 1, effect), RangeError);
  for (const [w,h] of [[0,1], [1,-1], [1.2,1], [16001,1], [4096,4096]]) {
    assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), w, h, effect), RangeError);
  }
});
