import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMattingPixels, effectiveMatting, validMattingSettings } from '../src/matting.ts';

test('white matting removes white edge contamination while preserving alpha', () => {
  const source = new Uint8ClampedArray([255, 128, 128, 128, 40, 80, 120, 255, 7, 8, 9, 0]);
  const output = applyMattingPixels(source, 3, 1, { mode: 'white', amount: 100 });
  assert.ok(output[1] < source[1]);
  assert.equal(output[3], 128);
  assert.deepEqual(Array.from(output.slice(8)), Array.from(source.slice(8)));
  assert.deepEqual(Array.from(source), [255, 128, 128, 128, 40, 80, 120, 255, 7, 8, 9, 0]);
});

test('black matting removes black edge contamination and amount blends deterministically', () => {
  const source = new Uint8ClampedArray([20, 40, 60, 128]);
  const full = applyMattingPixels(source, 1, 1, { mode: 'black', amount: 100 });
  const half = applyMattingPixels(source, 1, 1, { mode: 'black', amount: 50 });
  assert.ok(full[0] > source[0] && full[1] > source[1] && full[2] > source[2]);
  assert.ok(half[0] > source[0] && half[0] < full[0]);
  assert.equal(full[3], 128);
});

test('matting metadata clamps legacy values and rejects malformed settings', () => {
  assert.deepEqual(effectiveMatting({ mode: 'black', amount: 120 }), { mode: 'black', amount: 100 });
  assert.deepEqual(effectiveMatting({ mode: 'unknown', amount: -4 }), { mode: 'white', amount: 0 });
  assert.equal(validMattingSettings({ mode: 'white', amount: 40 }), true);
  assert.equal(validMattingSettings({ mode: 'blue', amount: 40 }), false);
  assert.throws(() => applyMattingPixels(new Uint8ClampedArray(4), 0, 1, { mode: 'white', amount: 100 }), /dimensions/);
});
