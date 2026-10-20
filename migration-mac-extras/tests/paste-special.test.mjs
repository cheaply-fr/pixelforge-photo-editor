import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePasteSpecialMode, pastePlacementMatrix } from '../src/pasteSpecial.ts';

test('paste placement keeps in-place transforms byte-for-byte equivalent', () => {
  const matrix = [1, 0.2, -0.1, 1.1, 42, 18];
  assert.deepEqual(
    pastePlacementMatrix(matrix, { x: 0, y: 0, width: 20, height: 10 }, { width: 100, height: 80 }, 'in-place'),
    matrix,
  );
  assert.deepEqual(
    pastePlacementMatrix(matrix, { x: 0, y: 0, width: 20, height: 10 }, { width: 100, height: 80 }, 'into-selection'),
    matrix,
  );
});

test('center placement translates only the affine origin', () => {
  const centered = pastePlacementMatrix(
    [2, 0, 0, 2, 10, 20],
    { x: 0, y: 0, width: 20, height: 10 },
    { width: 100, height: 80 },
    'center',
  );
  assert.deepEqual(centered, [2, 0, 0, 2, 30, 50]);
});

test('center placement respects local bounds, rotation and malformed numeric values', () => {
  const matrix = pastePlacementMatrix(
    [0, 1, -1, 0, 7, 9],
    { x: 4, y: 8, width: 12, height: 6 },
    { width: 80, height: 60 },
    'center',
  );
  assert.deepEqual(matrix.slice(0, 4), [0, 1, -1, 0]);
  const transformedCenter = [
    matrix[0] * 10 + matrix[2] * 11 + matrix[4],
    matrix[1] * 10 + matrix[3] * 11 + matrix[5],
  ];
  assert.deepEqual(transformedCenter, [40, 30]);
  assert.deepEqual(
    pastePlacementMatrix([Number.NaN, 0, 0, 1, 0, 0], { x: Number.NaN, y: 0, width: 2, height: 2 }, { width: 10, height: 10 }, 'center'),
    [0, 0, 0, 1, 4, 4],
  );
});

test('paste mode normalization fails closed to in-place', () => {
  assert.equal(normalizePasteSpecialMode('center'), 'center');
  assert.equal(normalizePasteSpecialMode('into-selection'), 'into-selection');
  assert.equal(normalizePasteSpecialMode('remote'), 'in-place');
  assert.equal(normalizePasteSpecialMode(undefined), 'in-place');
});

test('placement rejects malformed matrices and modes', () => {
  assert.throws(() => pastePlacementMatrix([1, 2] , { x: 0, y: 0, width: 1, height: 1 }, { width: 2, height: 2 }, 'center'), /six values/);
  assert.throws(() => pastePlacementMatrix([1, 0, 0, 1, 0, 0], { x: 0, y: 0, width: 1, height: 1 }, { width: 2, height: 2 }, 'bad'), /Unknown/);
});
