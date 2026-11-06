import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundSelectionPolygon,
  clipPolygonToFrame,
  ellipsePolygon,
  limitPolygonPoints,
  MAX_SELECTION_POLYGON_POINTS,
  polygonArea,
} from '../src/selectionPolygon.ts';

const W = 100, H = 80;
const inFrame = (points) =>
  points.every((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);

/** Nonzero-winding point-in-polygon test, matching canvas fill(). */
function winding(points, x, y) {
  let wn = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    const side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
    if (a.y <= y) {
      if (b.y > y && side > 0) wn += 1;
    } else if (b.y <= y && side < 0) wn -= 1;
  }
  return wn;
}

/** Every pixel on the canvas is covered identically by both paths. */
function assertSameCoverage(raw, clipped) {
  // Off-centre samples avoid points lying exactly on a test edge.
  for (let y = 0.47; y < H; y += 1)
    for (let x = 0.31; x < W; x += 1)
      assert.equal(
        winding(clipped, x, y) !== 0,
        winding(raw, x, y) !== 0,
        `coverage differs at ${x},${y}`,
      );
}

test('a polygon already inside the frame is returned unchanged', () => {
  const points = [{ x: 10, y: 10 }, { x: 60, y: 12 }, { x: 40, y: 50 }];
  const result = boundSelectionPolygon(points, W, H);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, points);
  assert.deepEqual([result.x, result.y, result.w, result.h], [10, 10, 50, 40]);
});

test('vertices exactly on the border are kept as-is', () => {
  const points = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const result = boundSelectionPolygon(points, W, H);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, points);
  assert.deepEqual([result.x, result.y, result.w, result.h], [0, 0, W, H]);
});

for (const { edge, raw } of [
  { edge: 'left', raw: [{ x: 20, y: 20 }, { x: -30, y: 30 }, { x: 25, y: 60 }] },
  { edge: 'right', raw: [{ x: 70, y: 20 }, { x: 140, y: 35 }, { x: 60, y: 60 }] },
  { edge: 'top', raw: [{ x: 20, y: 30 }, { x: 50, y: -40 }, { x: 80, y: 40 }] },
  { edge: 'bottom', raw: [{ x: 20, y: 40 }, { x: 80, y: 40 }, { x: 50, y: 130 }] },
])
  test(`a lasso crossing the ${edge} edge is clipped, not rejected`, () => {
    const result = boundSelectionPolygon(raw, W, H);
    assert.equal(result.ok, true);
    assert.ok(inFrame(result.points));
    assert.ok(result.x >= 0 && result.y >= 0);
    assert.ok(result.x + result.w <= W && result.y + result.h <= H);
    assert.ok(result.w >= 1 && result.h >= 1);
    assertSameCoverage(raw, result.points);
  });

test('border vertices pushed a few pixels out by screen-to-canvas rounding are pulled back', () => {
  // e.g. a point placed on the right border of a 2646 px document mapping to 2648.7.
  const DW = 2646, DH = 1764;
  const raw = [
    { x: 2000, y: 400 },
    { x: DW + 2.7, y: 400.4 },
    { x: DW + 1.3, y: 1300 },
    { x: 2000, y: 1300 },
    { x: -0.6, y: DH + 3.2 },
  ];
  const result = boundSelectionPolygon(raw, DW, DH);
  assert.equal(result.ok, true);
  assert.ok(result.points.every((p) => p.x >= 0 && p.x <= DW && p.y >= 0 && p.y <= DH));
  assert.equal(result.x + result.w, DW);
  assert.ok(result.y + result.h <= DH);
});

test('a self-intersecting freehand loop spanning several edges keeps its in-canvas coverage', () => {
  const raw = [
    { x: 50, y: 40 }, { x: -20, y: -10 }, { x: 120, y: -15 },
    { x: 30, y: 95 }, { x: -25, y: 60 }, { x: 110, y: 70 },
  ];
  const result = boundSelectionPolygon(raw, W, H);
  assert.equal(result.ok, true);
  assert.ok(inFrame(result.points));
  assertSameCoverage(raw, result.points);
});

test('clipping is exact where per-vertex clamping would over-select a corner', () => {
  // The edge from (50, 90) back to (-10, 50) only grazes the bottom-left
  // corner; clamping vertices would select a large triangle there.
  const raw = [{ x: -10, y: 50 }, { x: -10, y: 90 }, { x: 50, y: 90 }];
  const result = boundSelectionPolygon(raw, W, H);
  assert.equal(result.ok, true);
  assertSameCoverage(raw, result.points);
  assert.ok(polygonArea(result.points) < 500);
});

test('a loop entirely outside the canvas reports outside instead of a selection', () => {
  for (const raw of [
    [{ x: -50, y: 10 }, { x: -10, y: 20 }, { x: -30, y: 60 }],
    [{ x: 110, y: 10 }, { x: 150, y: 20 }, { x: 130, y: 60 }],
    [{ x: 10, y: -50 }, { x: 60, y: -10 }, { x: 30, y: -30 }],
    [{ x: 10, y: 90 }, { x: 60, y: 120 }, { x: 30, y: 150 }],
    // Wraps around the top-left corner without entering the canvas.
    [{ x: -20, y: 40 }, { x: -20, y: -20 }, { x: 40, y: -20 }, { x: -5, y: -5 }],
  ]) {
    const result = boundSelectionPolygon(raw, W, H);
    assert.deepEqual(result, { ok: false, reason: 'outside' });
  }
});

test('a path that only touches the border from outside selects nothing', () => {
  const raw = [{ x: 0, y: 10 }, { x: -20, y: 30 }, { x: 0, y: 50 }];
  assert.deepEqual(boundSelectionPolygon(raw, W, H), { ok: false, reason: 'outside' });
});

test('a loop around the whole canvas selects the whole canvas', () => {
  const raw = [{ x: -10, y: -10 }, { x: 200, y: -5 }, { x: 190, y: 190 }, { x: -20, y: 150 }];
  const result = boundSelectionPolygon(raw, W, H);
  assert.equal(result.ok, true);
  assert.deepEqual([result.x, result.y, result.w, result.h], [0, 0, W, H]);
  assert.equal(polygonArea(result.points), W * H);
});

test('degenerate in-canvas paths report empty or too few points', () => {
  assert.deepEqual(boundSelectionPolygon([{ x: 1, y: 1 }, { x: 5, y: 5 }], W, H), {
    ok: false,
    reason: 'too-few-points',
  });
  assert.deepEqual(
    boundSelectionPolygon([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 30, y: 30 }], W, H),
    { ok: false, reason: 'empty' },
  );
  assert.deepEqual(
    boundSelectionPolygon([{ x: 10, y: 10 }, { x: 10.5, y: 40 }, { x: 10.2, y: 60 }], W, H),
    { ok: false, reason: 'empty' },
  );
  assert.deepEqual(
    boundSelectionPolygon([{ x: 10, y: 10 }, { x: Number.NaN, y: 40 }, { x: 20, y: 60 }], W, H),
    { ok: false, reason: 'too-few-points' },
  );
});

test('clipPolygonToFrame removes duplicate border vertices and stays in the frame', () => {
  const clipped = clipPolygonToFrame(
    [{ x: -10, y: 10 }, { x: -10, y: 70 }, { x: 50, y: 40 }],
    W,
    H,
  );
  assert.ok(inFrame(clipped));
  for (let i = 0; i < clipped.length; i += 1) {
    const a = clipped[i], b = clipped[(i + 1) % clipped.length];
    assert.ok(a.x !== b.x || a.y !== b.y);
  }
  assert.deepEqual(clipPolygonToFrame([{ x: -5, y: -5 }, { x: -1, y: -5 }, { x: -3, y: -1 }], W, H), []);
});

test('ellipsePolygon traces the inscribed ellipse with radius-adaptive density', () => {
  const onEllipse = (points, cx, cy, rx, ry) =>
    points.every((p) => Math.abs(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 - 1) < 1e-9);
  const small = ellipsePolygon(10, 20, 8, 6);
  assert.equal(small.length, 64);
  assert.ok(onEllipse(small, 14, 23, 4, 3));
  const large = ellipsePolygon(0, 0, 2000, 1000);
  assert.ok(large.length > 1000 && large.length <= 4096);
  assert.ok(onEllipse(large, 1000, 500, 1000, 500));
  const exact = Math.PI * 1000 * 500;
  assert.ok(Math.abs(polygonArea(large) - exact) / exact < 1e-4);
});

test('an ellipse half off the left edge is clipped, keeping its true radius', () => {
  // A circle of radius 30 centred on the left border at (0, 40).
  const raw = ellipsePolygon(-30, 10, 60, 60);
  const result = boundSelectionPolygon(raw, W, H);
  assert.equal(result.ok, true);
  assert.equal(result.x, 0);
  assert.ok(Math.abs(result.w - 30) < 1e-6, `width ${result.w}`);
  assert.ok(Math.abs(result.h - 60) < 0.1, `height ${result.h}`);
  // Half the disc remains, not a squashed whole ellipse in the clamped box.
  assert.ok(Math.abs(polygonArea(result.points) - (Math.PI * 900) / 2) < 5);
  assertSameCoverage(raw, result.points);
});

test('long paths are thinned to the stored vertex limit', () => {
  const raw = Array.from({ length: 25000 }, (_, i) => {
    const angle = (i / 25000) * Math.PI * 2;
    return { x: 50 + 70 * Math.cos(angle), y: 40 + 30 * Math.sin(angle) };
  });
  const result = boundSelectionPolygon(raw, W, H);
  assert.equal(result.ok, true);
  assert.ok(result.points.length <= MAX_SELECTION_POLYGON_POINTS);
  assert.ok(inFrame(result.points));
  assert.equal(limitPolygonPoints(raw, 100).length, 100);
  assert.equal(limitPolygonPoints(raw.slice(0, 50), 100).length, 50);
});
