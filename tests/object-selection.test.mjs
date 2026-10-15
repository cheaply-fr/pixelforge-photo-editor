import test from 'node:test';
import assert from 'node:assert/strict';
import { objectSelectionMask } from '../src/objectSelection.ts';

const rgba = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = paint(x, y);
    data.set(color, (y * width + x) * 4);
  }
  return data;
};

test('Object Selection grows only the clicked connected colour region', () => {
  const source = rgba(5, 3, (x, y) =>
    x < 2 ? [220, 30, 30, 255] : y === 1 ? [30, 30, 220, 255] : [30, 220, 30, 255]);
  const before = new Uint8ClampedArray(source);
  const mask = objectSelectionMask(source, { width: 5, height: 3, x: 0, y: 1, tolerance: 0 });
  assert.equal([...mask].filter(Boolean).length, 6);
  assert.equal(mask[0], 255);
  assert.equal(mask[2], 0);
  assert.deepEqual(source, before);
});

test('Object Selection preserves partial alpha and supports soft colour edges', () => {
  const source = rgba(3, 1, (x) => x === 0 ? [100, 100, 100, 128] : [110, 100, 100, 255]);
  const mask = objectSelectionMask(source, { width: 3, height: 1, x: 0, y: 0, tolerance: 0, softness: 20 });
  assert.equal(mask[0], 128);
  assert.ok(mask[1] > 0 && mask[1] < 255);
  assert.equal(mask[2], 0);
});

test('Object Selection rejects invalid geometry and returns empty alpha for transparent seeds', () => {
  const source = new Uint8ClampedArray(2 * 2 * 4);
  assert.equal(objectSelectionMask(source, { width: 2, height: 2, x: 0, y: 0 }).every((value) => value === 0), true);
  assert.throws(() => objectSelectionMask(source, { width: 2, height: 2, x: 2, y: 0 }), /point is outside/);
  assert.throws(() => objectSelectionMask(source, { width: 2, height: 2, x: 0, y: 0, tolerance: 256 }), /tolerance/);
});
