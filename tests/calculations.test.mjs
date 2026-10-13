import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateImagePixels } from '../src/applyImage.ts';

test('Calculations applies bounded channel modes and preserves alpha-safe source compositing', () => {
  const target = new Uint8ClampedArray([100, 150, 200, 255, 20, 30, 40, 255]);
  const source = new Uint8ClampedArray([50, 100, 150, 255, 250, 200, 100, 128]);
  assert.deepEqual([...calculateImagePixels(target, source, 'multiply')], [20, 59, 118, 255, 20, 27, 28, 255]);
  assert.deepEqual([...calculateImagePixels(target, source, 'screen')], [130, 191, 232, 255, 136, 119, 82, 255]);
  assert.deepEqual([...calculateImagePixels(target, source, 'difference', 0)], [...target]);
  assert.equal(calculateImagePixels(target, source, 'add')[0], 150);
  assert.equal(calculateImagePixels(target, source, 'subtract')[0], 50);
  assert.equal(calculateImagePixels(target, source, 'difference')[0], 50);
});

test('Calculations remains immutable and rejects malformed modes, opacity and buffers', () => {
  const target = new Uint8ClampedArray([100, 150, 200, 255]);
  const source = new Uint8ClampedArray([50, 100, 150, 255]);
  const before = [...target];
  calculateImagePixels(target, source, 'overlay');
  assert.deepEqual([...target], before);
  assert.throws(() => calculateImagePixels(target, source, 'invalid'), /Unsupported/);
  assert.throws(() => calculateImagePixels(target, source, 'multiply', -1), /between 0 and 100/);
  assert.throws(() => calculateImagePixels(target, new Uint8ClampedArray(8), 'multiply'), /matching/);
});
