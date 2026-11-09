import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editPathAnchor,
  hitTestWholePath,
  isPathAnchorEdit,
  pathAnchorEditNotice,
  pathContainsPoint,
  penAnchorEditMode,
  pullPathNodeHandles,
  translatePath,
} from '../src/pathEditTools.ts';
import { pathBounds, setPathNodeSmooth, validatePath } from '../src/paths.ts';

const square = (patch = {}) => ({
  nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  closed: true,
  fill: true,
  stroke: true,
  strokeWidth: 2,
  fillColor: '#ff0000',
  strokeColor: '#000000',
  ...patch,
});

const curved = () => validatePath(square({
  nodes: [
    { x: 0, y: 0, outHandle: { x: 30, y: -20 } },
    { x: 100, y: 0, inHandle: { x: 70, y: -20 }, outHandle: { x: 120, y: 30 } },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
}));

const compound = () => validatePath(square({
  fillRule: 'evenodd',
  contours: [
    { nodes: square().nodes, closed: true },
    { nodes: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 75, y: 75 }, { x: 25, y: 75 }], closed: true },
  ],
}));

test('translatePath moves every anchor and handle of every contour by the delta', () => {
  const source = curved();
  const moved = translatePath(source, 12.5, -7);
  assert.equal(moved.nodes.length, source.nodes.length);
  source.nodes.forEach((node, index) => {
    const next = moved.nodes[index];
    assert.deepEqual({ x: next.x, y: next.y }, { x: node.x + 12.5, y: node.y - 7 });
    for (const kind of ['inHandle', 'outHandle']) {
      if (node[kind]) assert.deepEqual(next[kind], { x: node[kind].x + 12.5, y: node[kind].y - 7 });
      else assert.equal(next[kind], undefined);
    }
  });
  const before = pathBounds(source), after = pathBounds(moved);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.equal(after.left, before.left + 12.5);
  assert.equal(after.top, before.top - 7);
  // Appearance and closure are untouched, and the input is not mutated.
  assert.equal(moved.closed, true);
  assert.equal(moved.fillColor, source.fillColor);
  assert.equal(source.nodes[0].x, 0);
});

test('translatePath keeps compound contours aligned and mirrored', () => {
  const moved = translatePath(compound(), -5, 10);
  assert.equal(moved.contours.length, 2);
  assert.deepEqual(moved.contours[0].nodes, moved.nodes);
  assert.deepEqual(moved.contours[1].nodes[0], { x: 20, y: 35 });
  assert.equal(moved.fillRule, 'evenodd');
  assert.deepEqual(translatePath(moved, 5, -10), compound());
});

test('translatePath rejects non-finite offsets and zero is an identity', () => {
  assert.throws(() => translatePath(square(), Number.NaN, 0), /offset/);
  assert.throws(() => translatePath(square(), 0, Infinity), /offset/);
  assert.deepEqual(translatePath(square(), 0, 0), validatePath(square()));
});

test('pathContainsPoint honours closed contours and fill rules', () => {
  assert.equal(pathContainsPoint(square(), { x: 50, y: 50 }), true);
  assert.equal(pathContainsPoint(square(), { x: 150, y: 50 }), false);
  assert.equal(pathContainsPoint(square({ closed: false }), { x: 50, y: 50 }), false);
  // The even-odd hole is outside the compound path; its ring is inside.
  assert.equal(pathContainsPoint(compound(), { x: 50, y: 50 }), false);
  assert.equal(pathContainsPoint(compound(), { x: 10, y: 50 }), true);
  // Curved segments are sampled: the bulge above y=0 is inside.
  assert.equal(pathContainsPoint(curved(), { x: 50, y: -8 }), true);
});

test('hitTestWholePath picks anchors, strokes and interiors but not empty space', () => {
  const path = validatePath(square({ fill: false }));
  assert.equal(hitTestWholePath(path, { x: 0, y: 0 }, 4), true);
  assert.equal(hitTestWholePath(path, { x: 50, y: 2 }, 4), true);
  assert.equal(hitTestWholePath(path, { x: 50, y: 50 }, 4), true, 'interior of a closed unfilled path');
  assert.equal(hitTestWholePath(path, { x: 130, y: 50 }, 4), false);
  const open = validatePath(square({ closed: false }));
  assert.equal(hitTestWholePath(open, { x: 50, y: 50 }, 4), false);
  assert.equal(hitTestWholePath(open, { x: 2, y: 50 }, 4), false, 'no closing segment on an open path');
  assert.throws(() => hitTestWholePath(path, { x: 0, y: 0 }, -1), /invalid/);
});

test('penAnchorEditMode maps Pen modifiers to Photoshop edits', () => {
  assert.equal(penAnchorEditMode({}), 'add');
  assert.equal(penAnchorEditMode({ shiftKey: true }), 'convert');
  assert.equal(penAnchorEditMode({ altKey: true }), 'delete');
  assert.equal(penAnchorEditMode({ altKey: true, shiftKey: true }), 'delete');
});

test('add mode inserts an anchor on the clicked segment only', () => {
  const edit = editPathAnchor(square(), { x: 40, y: 1 }, 6, 'add');
  assert.ok(isPathAnchorEdit(edit));
  assert.equal(edit.path.nodes.length, 5);
  assert.equal(edit.index, 1);
  // A straight segment is split exactly under the pointer's projection.
  assert.deepEqual(edit.path.nodes[1], { x: 40, y: 0 });
  assert.equal(pathAnchorEditNotice(edit), 'Path anchor added');
  assert.equal(pathAnchorEditNotice(edit, true), 'Vector mask anchor added');
  // On an existing anchor or in empty space nothing is inserted.
  const onAnchor = editPathAnchor(square(), { x: 100, y: 0 }, 6, 'add');
  assert.equal(isPathAnchorEdit(onAnchor), false);
  assert.match(onAnchor.reason, /segment/);
  assert.equal(isPathAnchorEdit(editPathAnchor(square(), { x: 50, y: 50 }, 6, 'add')), false);
});

test('add mode splits the closing segment and preserves cubic shape', () => {
  const closing = editPathAnchor(square(), { x: 0, y: 50 }, 6, 'add');
  assert.ok(isPathAnchorEdit(closing));
  assert.equal(closing.path.nodes.length, 5);
  assert.deepEqual(closing.path.nodes.at(-1), { x: 0, y: 50 });
  const curve = editPathAnchor(curved(), { x: 50, y: -15 }, 6, 'add');
  assert.ok(isPathAnchorEdit(curve));
  const inserted = curve.path.nodes[1];
  assert.ok(inserted.inHandle && inserted.outHandle, 'split cubic gains handles');
  assert.ok(pathBounds(curve.path).top < 0);
});

test('delete mode removes the clicked anchor and keeps at least one', () => {
  const edit = editPathAnchor(square(), { x: 99, y: 101 }, 6, 'delete');
  assert.ok(isPathAnchorEdit(edit));
  assert.equal(edit.index, 2);
  assert.deepEqual(edit.path.nodes, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
  assert.equal(edit.path.closed, true);
  assert.equal(pathAnchorEditNotice(edit), 'Path anchor deleted');
  const miss = editPathAnchor(square(), { x: 50, y: 0 }, 6, 'delete');
  assert.equal(isPathAnchorEdit(miss), false);
  assert.match(miss.reason, /anchor/);
  const single = validatePath(square({ nodes: [{ x: 5, y: 5 }], closed: false }));
  assert.match(editPathAnchor(single, { x: 5, y: 5 }, 6, 'delete').reason, /at least one/);
  // Deleting down to two anchors opens a closed path, as removePathNode does.
  const triangle = validatePath(square({ nodes: square().nodes.slice(0, 3) }));
  const opened = editPathAnchor(triangle, { x: 0, y: 0 }, 6, 'delete');
  assert.ok(isPathAnchorEdit(opened));
  assert.equal(opened.path.closed, false);
});

test('convert mode toggles corner and smooth anchors', () => {
  const smooth = editPathAnchor(square(), { x: 100, y: 0 }, 6, 'convert');
  assert.ok(isPathAnchorEdit(smooth));
  assert.deepEqual(smooth.path, setPathNodeSmooth(square(), 1, true));
  assert.ok(smooth.path.nodes[1].inHandle && smooth.path.nodes[1].outHandle);
  assert.equal(pathAnchorEditNotice(smooth), 'Path anchor converted to smooth');
  const corner = editPathAnchor(smooth.path, { x: 100, y: 0 }, 6, 'convert');
  assert.ok(isPathAnchorEdit(corner));
  assert.deepEqual(corner.path.nodes[1], { x: 100, y: 0 });
  assert.equal(pathAnchorEditNotice(corner, true), 'Vector mask anchor converted to corner');
  assert.equal(isPathAnchorEdit(editPathAnchor(square(), { x: 50, y: 50 }, 6, 'convert')), false);
  assert.throws(() => editPathAnchor(square(), { x: 0, y: Number.NaN }, 6, 'convert'), /invalid/);
});

test('pullPathNodeHandles drags out symmetric handles through the anchor', () => {
  const pulled = pullPathNodeHandles(square(), 1, { x: 130, y: 20 });
  assert.deepEqual(pulled.nodes[1], {
    x: 100, y: 0, inHandle: { x: 70, y: -20 }, outHandle: { x: 130, y: 20 },
  });
  // Other anchors are untouched and the anchor itself never moves.
  assert.deepEqual(pulled.nodes.filter((_, index) => index !== 1), square().nodes.filter((_, index) => index !== 1));
  // Dragging back onto the anchor makes it a corner again.
  assert.deepEqual(pullPathNodeHandles(pulled, 1, { x: 100.1, y: 0 }).nodes[1], { x: 100, y: 0 });
  assert.throws(() => pullPathNodeHandles(square(), 9, { x: 0, y: 0 }), /index/);
  assert.throws(() => pullPathNodeHandles(square(), 0, { x: Infinity, y: 0 }), /invalid/);
});

test('pullPathNodeHandles keeps the compound primary contour mirrored', () => {
  const pulled = pullPathNodeHandles(compound(), 0, { x: 10, y: -10 });
  assert.deepEqual(pulled.contours[0].nodes, pulled.nodes);
  assert.deepEqual(pulled.contours[1], compound().contours[1]);
  assert.deepEqual(pulled.nodes[0].inHandle, { x: -10, y: 10 });
});
