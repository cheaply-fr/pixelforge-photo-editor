import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFadePixels } from '../src/fade.ts';

test('Fade preserves the previous/current endpoints and does not mutate inputs', () => {
  const previous = new Uint8ClampedArray([0, 20, 40, 60, 80, 100, 120, 140]);
  const current = new Uint8ClampedArray([100, 120, 140, 160, 180, 200, 220, 240]);
  assert.deepEqual([...applyFadePixels(previous, current, 0)], [...previous]);
  assert.deepEqual([...applyFadePixels(previous, current, 100)], [...current]);
  assert.deepEqual([...applyFadePixels(previous, current, 50)], [50, 70, 90, 110, 130, 150, 170, 190]);
  assert.deepEqual([...previous], [0, 20, 40, 60, 80, 100, 120, 140]);
  assert.deepEqual([...current], [100, 120, 140, 160, 180, 200, 220, 240]);
});

test('Fade rejects malformed buffers and out-of-range amounts', () => {
  assert.throws(() => applyFadePixels(new Uint8ClampedArray(3), new Uint8ClampedArray(3), 50), /complete RGBA/);
  assert.throws(() => applyFadePixels(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 50), /matching/);
  assert.throws(() => applyFadePixels(new Uint8ClampedArray(4), new Uint8ClampedArray(4), -1), /between 0 and 100/);
  assert.throws(() => applyFadePixels(new Uint8ClampedArray(4), new Uint8ClampedArray(4), 101), /between 0 and 100/);
});
