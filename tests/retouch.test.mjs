import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRetouchStroke } from '../src/retouch.ts';

const pixels = (values) => Uint8ClampedArray.from(values);

test('blur softens a local edge while preserving alpha and source bytes', () => {
  const source = pixels([
    0, 0, 0, 255, 255, 255, 255, 255,
    0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  const result = applyRetouchStroke(source, source, { width: 2, height: 2, x1: 1, y1: 0, x2: 1, y2: 1, size: 4, hardness: 0, flow: 1, mode: 'blur' });
  assert.deepEqual(Array.from(source), [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  assert.ok(result.changed);
  assert.equal(result.pixels[3], 255);
  assert.ok(result.pixels[4] < 255);
});

test('sharpen increases a bounded edge and respects selection alpha', () => {
  const source = pixels([
    90, 90, 90, 255, 120, 120, 120, 255,
    90, 90, 90, 255, 120, 120, 120, 255,
  ]);
  const untouched = new Uint8ClampedArray(source);
  const result = applyRetouchStroke(source, source, { width: 2, height: 2, x1: 1, y1: 0, x2: 1, y2: 1, size: 4, hardness: 100, flow: 1, mode: 'sharpen', selectionMask: Uint8ClampedArray.from([0, 0, 0, 255]) });
  assert.deepEqual(Array.from(source), Array.from(untouched));
  assert.equal(result.pixels[0], source[0]);
  assert.equal(result.pixels[4 + 0], source[4 + 0]);
  assert.ok(result.pixels[12 + 0] > source[12 + 0]);
  assert.equal(result.pixels[4 + 4], source[4 + 4]);
  assert.equal(result.pixels[15], 255);
});

test('retouch validation rejects malformed buffers and masks', () => {
  assert.throws(() => applyRetouchStroke(new Uint8ClampedArray(3), new Uint8ClampedArray(3), { width: 1, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 2, hardness: 0, flow: 1, mode: 'blur' }), /pixels/);
  assert.throws(() => applyRetouchStroke(new Uint8ClampedArray(4), new Uint8ClampedArray(4), { width: 1, height: 1, x1: 0, y1: 0, x2: 0, y2: 0, size: 2, hardness: 0, flow: 1, mode: 'blur', selectionMask: new Uint8ClampedArray(2) }), /mask/);
});

