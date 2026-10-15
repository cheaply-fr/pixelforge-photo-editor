import assert from 'node:assert/strict';
import test from 'node:test';
import { applyImagePixels } from '../src/applyImage.ts';

test('Apply Image composites source-over at the requested opacity without mutating inputs', () => {
  const target = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0]);
  const source = new Uint8ClampedArray([110, 120, 130, 255, 255, 0, 0, 128]);
  const output = applyImagePixels(target, source, 50);
  assert.deepEqual([...output], [60, 70, 80, 255, 255, 0, 0, 64]);
  assert.deepEqual([...target], [10, 20, 30, 255, 0, 0, 0, 0]);
  assert.deepEqual([...source], [110, 120, 130, 255, 255, 0, 0, 128]);
});

test('Apply Image validates buffers and preserves endpoint behavior', () => {
  const target = new Uint8ClampedArray([10, 20, 30, 255]);
  const source = new Uint8ClampedArray([110, 120, 130, 255]);
  assert.deepEqual([...applyImagePixels(target, source, 0)], [...target]);
  assert.deepEqual([...applyImagePixels(target, source, 100)], [...source]);
  assert.throws(() => applyImagePixels(target, new Uint8ClampedArray(8)), /matching/);
  assert.throws(() => applyImagePixels(target, source, 101), /between 0 and 100/);
});
