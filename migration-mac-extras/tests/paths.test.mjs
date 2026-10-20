import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clonePath,
  hitTestPathNode,
  hitTestPathStroke,
  movePathNode,
  pathBounds,
  serializePathData,
  transformPath,
  validatePath,
} from '../src/paths.ts';

const triangle = (patch = {}) => ({
  nodes: [{ x: 1, y: 2 }, { x: 8, y: 2 }, { x: 4, y: 7 }],
  closed: true,
  fill: true,
  stroke: true,
  strokeWidth: 2,
  fillColor: '#ff0000',
  strokeColor: '#000000',
  ...patch,
});

test('path validation clones nodes, normalizes colors, and rejects malformed bounds', () => {
  const raw = triangle();
  const path = validatePath(raw);
  raw.nodes[0].x = 99;
  assert.equal(path.nodes[0].x, 1);
  assert.equal(path.fillColor, '#ff0000');
  assert.throws(() => validatePath(triangle({ nodes: [] })), /1 to/);
  assert.throws(() => validatePath(triangle({ nodes: [{ x: 1e9, y: 0 }] })), /nodes/);
  assert.throws(() => validatePath(triangle({ fill: false, stroke: false })), /fill or stroke/);
  assert.throws(() => validatePath(triangle({ strokeWidth: -1 })), /stroke width/);
});

test('open and closed paths have deterministic bounds and SVG data', () => {
  const open = validatePath(triangle({ closed: false }));
  assert.deepEqual(pathBounds(open), { left: 1, top: 2, right: 8, bottom: 7, width: 7, height: 5 });
  assert.equal(serializePathData(open), 'M 1 2 L 8 2 L 4 7');
  assert.equal(serializePathData(triangle()), 'M 1 2 L 8 2 L 4 7 Z');
});

test('node hit testing is deterministic and stroke hit testing includes closing edge', () => {
  const path = validatePath(triangle());
  assert.equal(hitTestPathNode(path, { x: 1.2, y: 2.1 }, 1), 0);
  assert.equal(hitTestPathNode(path, { x: 4.5, y: 5.5 }, 0.2), null);
  assert.equal(hitTestPathStroke(path, { x: 4.5, y: 2 }, 0.6), true);
  assert.equal(hitTestPathStroke(path, { x: 5, y: 4.5 }, 0.3), true);
  assert.equal(hitTestPathStroke(validatePath({ ...path, closed: false }), { x: 5, y: 4.5 }, 0.3), false);
});

test('moving a node returns an immutable validated path', () => {
  const path = validatePath(triangle());
  const moved = movePathNode(path, 1, 9, 4);
  assert.equal(path.nodes[1].x, 8);
  assert.deepEqual(moved.nodes[1], { x: 9, y: 4 });
  assert.throws(() => movePathNode(path, 10, 0, 0), /index/);
  assert.throws(() => movePathNode(path, 0, Number.NaN, 0), /nodes/);
});

test('affine transforms retain metadata and transform all nodes', () => {
  const path = validatePath(triangle({ fill: false }));
  const moved = transformPath(path, [2, 0, 0, 3, 10, -2]);
  assert.deepEqual(moved.nodes, [{ x: 12, y: 4 }, { x: 26, y: 4 }, { x: 18, y: 19 }]);
  assert.equal(moved.strokeColor, path.strokeColor);
  assert.equal(moved.fill, false);
  assert.deepEqual(clonePath(path), path);
  assert.throws(() => transformPath(path, [1, 0, 0, 1, Number.NaN, 0]), /matrix/);
});

test('serializing the same path twice is byte deterministic', () => {
  const path = validatePath(triangle({ nodes: [{ x: 1.123456, y: 2.345678 }, { x: 8, y: 2 }, { x: 4, y: 7 }] }));
  assert.equal(serializePathData(path), serializePathData(clonePath(path)));
});
