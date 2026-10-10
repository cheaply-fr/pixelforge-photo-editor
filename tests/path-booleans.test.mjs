import assert from 'node:assert/strict';
import test from 'node:test';
import {
  booleanPathFromPoints,
  booleanPathIsClosed,
  combinePathBooleans,
  flattenPathContours,
} from '../src/pathBooleans.ts';
import { commonLayer, validateFrame } from '../src/document.ts';
import { pathBounds, pathContours, serializePathData, validatePath } from '../src/paths.ts';

const style = {
  fill: true,
  stroke: true,
  strokeWidth: 1,
  fillColor: '#ff0000',
  strokeColor: '#000000',
};
const box = (x, y, width, height, patch = {}) => validatePath({
  nodes: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
  closed: true,
  ...style,
  ...patch,
});
const signedArea = (points) => points.reduce(
  (total, point, index) => total + point.x * points[(index + 1) % points.length].y -
    points[(index + 1) % points.length].x * point.y,
  0,
) / 2;

test('compound paths validate, preserve legacy fields and round-trip contours', () => {
  const outer = box(0, 0, 20, 20), inner = box(5, 5, 10, 10);
  const compound = validatePath({
    ...outer,
    contours: [
      { nodes: outer.nodes, closed: true },
      { nodes: inner.nodes, closed: true },
    ],
    fillRule: 'evenodd',
  });
  assert.equal(pathContours(compound).length, 2);
  assert.deepEqual(compound.nodes, outer.nodes);
  assert.equal(compound.fillRule, 'evenodd');
  assert.equal(serializePathData(compound), 'M 0 0 L 20 0 L 20 20 L 0 20 Z M 5 5 L 15 5 L 15 15 L 5 15 Z');
  assert.deepEqual(pathBounds(compound), { left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20 });
  const layer = { ...commonLayer('Compound'), kind: 'path', path: compound };
  assert.doesNotThrow(() => validateFrame({
    w: 32,
    h: 32,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  }, {}));
  assert.throws(() => validatePath({ ...compound, contours: [{ nodes: [], closed: true }] }), /contours/);
  assert.throws(() => validatePath({ ...compound, contours: [{ nodes: inner.nodes, closed: true }, { nodes: outer.nodes, closed: true }] }), /mirror/);
});

test('union retains disjoint components and combines overlapping rectangles', () => {
  const disjoint = combinePathBooleans([box(0, 0, 10, 10), box(20, 0, 10, 10)], 'union');
  assert.equal(pathContours(disjoint).length, 2);
  const overlapping = combinePathBooleans([box(0, 0, 10, 10), box(5, 0, 10, 10)], 'union');
  assert.equal(pathContours(overlapping).length, 1);
  assert.deepEqual(pathBounds(overlapping), { left: 0, top: 0, right: 15, bottom: 10, width: 15, height: 10 });
  assert.equal(booleanPathIsClosed(overlapping), true);
});

test('subtract emits an even-odd hole and intersection clips to overlap', () => {
  const hole = combinePathBooleans([box(0, 0, 30, 30), box(10, 10, 10, 10)], 'subtract');
  assert.equal(pathContours(hole).length, 2);
  assert.equal(hole.fillRule, 'evenodd');
  const areas = flattenPathContours(hole).map(signedArea).map(Math.abs).sort((a, b) => a - b);
  assert.deepEqual(areas, [100, 900]);
  const intersection = combinePathBooleans([box(0, 0, 10, 10), box(5, 5, 10, 10)], 'intersect');
  assert.deepEqual(pathBounds(intersection), { left: 5, top: 5, right: 10, bottom: 10, width: 5, height: 5 });
});

test('exclude produces two components for a shared strip and rejects unsupported operands', () => {
  const result = combinePathBooleans([box(0, 0, 10, 10), box(5, 0, 10, 10)], 'exclude');
  assert.equal(pathContours(result).length, 2);
  assert.throws(() => combinePathBooleans([box(0, 0, 10, 10), box(20, 0, 10, 10, { closed: false })], 'union'), /closed/);
  assert.throws(() => combinePathBooleans([box(0, 0, 10, 10)], 'union'), /2 to 8/);
  assert.throws(() => combinePathBooleans([box(0, 0, 10, 10), box(5, 0, 10, 10)], 'bad'), /invalid/);
});

test('parametric point conversion is bounded and deterministic', () => {
  const path = booleanPathFromPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], style);
  assert.equal(path.closed, true);
  assert.deepEqual(flattenPathContours(path), [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]]);
  assert.throws(() => booleanPathFromPoints([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }], style), /points/);
});
