import test from 'node:test';
import assert from 'node:assert/strict';
import {
  skySelectionMask,
  subjectSelectionMask,
} from '../src/assistedSelection.ts';

function rgba(width, height, fill) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const offset = (y * width + x) * 4;
      output.set([r, g, b, a], offset);
    }
  }
  return output;
}

test('subject proxy selects centre contrast against a uniform border', () => {
  const source = rgba(5, 5, (x, y) =>
    x === 0 || y === 0 || x === 4 || y === 4
      ? [220, 220, 220, 255]
      : [20, 40, 220, 255],
  );
  const mask = subjectSelectionMask(source, {
    width: 5,
    height: 5,
    threshold: 20,
    softness: 0,
  });
  assert.equal(mask[0], 0);
  assert.equal(mask[2 * 5 + 2], 255);
  assert.ok(mask[1 * 5 + 1] > 200);
});

test('subject proxy is deterministic, alpha safe, and validates bounds', () => {
  const source = rgba(3, 2, () => [10, 20, 30, 255]);
  source[3] = 0;
  const first = subjectSelectionMask(source, { width: 3, height: 2 });
  const second = subjectSelectionMask(source, { width: 3, height: 2 });
  assert.deepEqual(first, second);
  assert.equal(first[0], 0);
  assert.throws(() =>
    subjectSelectionMask(new Uint8ClampedArray(4), { width: 2, height: 2 }),
  );
  assert.throws(() =>
    subjectSelectionMask(source, { width: 3, height: 2, centreBias: 2 }),
  );
});

test('sky proxy selects blue upper frame and fades below the horizon', () => {
  const source = rgba(4, 4, (x, y) =>
    y < 2 ? [40, 100, 220, 255] : [35, 100, 35, 255],
  );
  const mask = skySelectionMask(source, {
    width: 4,
    height: 4,
    threshold: 20,
    softness: 0,
    horizon: 0.5,
  });
  assert.equal(mask[0], 255);
  assert.equal(mask[1], 255);
  assert.equal(mask[2 * 4], 0);
  assert.equal(mask[3 * 4], 0);
});

test('sky proxy keeps transparent pixels empty and rejects invalid options', () => {
  const source = rgba(2, 2, () => [40, 100, 220, 255]);
  source[3] = 0;
  const mask = skySelectionMask(source, { width: 2, height: 2 });
  assert.equal(mask[0], 0);
  assert.throws(() =>
    skySelectionMask(source, { width: 2, height: 2, horizon: 0 }),
  );
  assert.throws(() =>
    skySelectionMask(source, { width: 2, height: 2, threshold: 256 }),
  );
});
