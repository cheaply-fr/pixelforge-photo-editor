import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VECTOR_MASK_MAX_CONTOURS,
  VECTOR_MASK_MAX_NODES,
  applyVectorMaskPixels,
  defaultVectorMaskPath,
  effectiveVectorMask,
  validVectorMask,
  validateVectorMaskPath,
} from '../src/vectorMask.ts';

const path = (contours) => {
  const nodes = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  return {
    nodes,
    closed: true,
    fill: true,
    stroke: true,
    strokeWidth: 3,
    fillColor: '#ABCDEF',
    strokeColor: '#000000',
    ...(contours ? { contours } : {}),
    fillRule: 'evenodd',
  };
};

test('vector mask paths normalize appearance while preserving compound contours and fill rule', () => {
  const inner = { nodes: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }], closed: true };
  const normalized = validateVectorMaskPath(path([
    { nodes: path().nodes, closed: true },
    inner,
  ]));
  assert.equal(normalized.fill, true);
  assert.equal(normalized.stroke, false);
  assert.equal(normalized.strokeWidth, 3);
  assert.equal(normalized.fillRule, 'evenodd');
  assert.equal(normalized.contours.length, 2);
  assert.notEqual(normalized.nodes, path().nodes);
});

test('vector mask validation rejects open-only paths and malformed controls', () => {
  assert.throws(() => validateVectorMaskPath({ ...path(), closed: false }), /closed contour/);
  assert.throws(() => validateVectorMaskPath({ ...path(), fill: false, stroke: false }), /Path needs/);
  assert.equal(validVectorMask({ path: path(), enabled: true, inverted: false }), true);
  assert.equal(validVectorMask({ path: path(), enabled: 'yes', inverted: false }), false);
  assert.equal(validVectorMask({ path: { ...path(), nodes: [{ x: Infinity, y: 0 }] }, enabled: true, inverted: false }), false);
  assert.deepEqual(effectiveVectorMask({ path: path() }), {
    path: validateVectorMaskPath(path()), enabled: true, inverted: false,
  });
});

test('vector mask limits are bounded by contour and node budgets', () => {
  const base = path();
  const contours = Array.from({ length: VECTOR_MASK_MAX_CONTOURS + 1 }, () => ({ nodes: base.nodes, closed: true }));
  assert.throws(() => validateVectorMaskPath({ ...base, contours }), /contours/);
  const oversized = Array.from({ length: VECTOR_MASK_MAX_NODES + 1 }, (_, index) => ({ x: index, y: 0 }));
  assert.throws(() => validateVectorMaskPath({ ...base, nodes: oversized, closed: true }), /1 to/);
});

test('pixel alpha application is detached, source-safe, disabled-safe, and invertible', () => {
  const source = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
  const original = source.slice();
  const alpha = new Uint8ClampedArray([128, 64]);
  const normal = applyVectorMaskPixels(source, alpha);
  assert.deepEqual(Array.from(normal), [10, 20, 30, 128, 40, 50, 60, 32]);
  assert.deepEqual(source, original);
  assert.notEqual(normal, source);
  assert.deepEqual(Array.from(applyVectorMaskPixels(source, alpha, { inverted: true })), [10, 20, 30, 127, 40, 50, 60, 96]);
  assert.deepEqual(applyVectorMaskPixels(source, alpha, { enabled: false }), source);
  assert.throws(() => applyVectorMaskPixels(new Uint8ClampedArray([1, 2, 3]), [255]), /RGBA/);
  assert.throws(() => applyVectorMaskPixels(source, [255]), /one value/);
  assert.throws(() => applyVectorMaskPixels(source, [300, 0]), /alpha is invalid/);
});

test('default vector masks are bounded closed rectangles', () => {
  const result = defaultVectorMaskPath(12, 7);
  assert.equal(result.closed, true);
  assert.equal(result.nodes.length, 4);
  assert.deepEqual(result.nodes.at(-1), { x: 0, y: 7 });
  assert.throws(() => defaultVectorMaskPath(0, 7), /bounds are invalid/);
});
