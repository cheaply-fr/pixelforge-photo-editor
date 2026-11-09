import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CURVE_POINTS,
  MAX_INTERIOR_CURVE_POINTS,
  addCurvePoint,
  applyCurvesPixels,
  compileCurves,
  curveInterpolation,
  curveTable,
  curvesPixel,
  editableCurvePoints,
  effectiveCurves,
  evaluateCurve,
  identityCurve,
  moveCurvePointAt,
  nearestCurvePointIndex,
  removeCurvePointAt,
  sampleCurve,
  validCurvePoints,
  validCurves,
} from '../src/curves.ts';

const withRgb = (rgb, interpolation) => ({
  rgb,
  red: identityCurve,
  green: identityCurve,
  blue: identityCurve,
  ...(interpolation ? { interpolation } : {}),
});

/** Independent piecewise-linear reference matching the pre-smoothing renderer. */
function legacyLinear(points, input) {
  if (input <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [rx, ry] = points[index],
      [lx, ly] = points[index - 1];
    if (input <= rx) {
      const ratio = (input - lx) / Math.max(1, rx - lx);
      return Math.max(0, Math.min(255, Math.round(ly + (ry - ly) * ratio)));
    }
  }
  return points.at(-1)[1];
}

test('addCurvePoint inserts sorted interior points and reports the new index', () => {
  const first = addCurvePoint(identityCurve, 64, 90);
  assert.deepEqual(first, {
    points: [
      [0, 0],
      [64, 90],
      [255, 255],
    ],
    index: 1,
  });
  const second = addCurvePoint(first.points, 32.4, 20.6);
  assert.equal(second.index, 1);
  assert.deepEqual(second.points[1], [32, 21]);
  const third = addCurvePoint(second.points, 200, 230);
  assert.equal(third.index, 3);
  assert.deepEqual(
    third.points.map(([x]) => x),
    [0, 32, 64, 200, 255],
  );
});

test('addCurvePoint rejects duplicates, endpoint inputs, non-finite values and the cap', () => {
  const curve = addCurvePoint(identityCurve, 128, 128).points;
  assert.equal(addCurvePoint(curve, 128, 10), null);
  assert.equal(addCurvePoint(curve, 0, 10), null);
  assert.equal(addCurvePoint(curve, 255, 10), null);
  assert.equal(addCurvePoint(curve, Number.NaN, 10), null);
  let full = identityCurve;
  for (let index = 1; index <= MAX_INTERIOR_CURVE_POINTS; index += 1)
    full = addCurvePoint(full, index * 16, index * 16).points;
  assert.equal(full.length, MAX_CURVE_POINTS);
  assert.equal(MAX_INTERIOR_CURVE_POINTS, 14);
  assert.equal(addCurvePoint(full, 250, 3), null);
  assert.equal(editableCurvePoints(full), true);
});

test('moveCurvePointAt clamps interior inputs between neighbours and keeps endpoint inputs', () => {
  const curve = [
    [0, 0],
    [64, 60],
    [128, 140],
    [255, 255],
  ];
  assert.deepEqual(moveCurvePointAt(curve, 1, 200, 300)[1], [127, 255]);
  assert.deepEqual(moveCurvePointAt(curve, 2, -40, -5)[2], [65, 0]);
  assert.deepEqual(moveCurvePointAt(curve, 0, 90, 40)[0], [0, 40]);
  assert.deepEqual(moveCurvePointAt(curve, 3, 10, 210)[3], [255, 210]);
  // Order and point count never change while dragging.
  for (const x of [-100, 0, 63, 64, 65, 127, 128, 300]) {
    const moved = moveCurvePointAt(curve, 1, x, 99);
    assert.equal(moved.length, 4);
    assert.equal(validCurvePoints(moved), true);
  }
  assert.deepEqual(moveCurvePointAt(curve, 9, 10, 10), curve);
  assert.deepEqual(moveCurvePointAt(curve, 1, Number.NaN, 10), curve);
});

test('removeCurvePointAt removes interior points only', () => {
  const curve = [
    [0, 0],
    [64, 60],
    [128, 140],
    [255, 255],
  ];
  assert.deepEqual(removeCurvePointAt(curve, 1), [
    [0, 0],
    [128, 140],
    [255, 255],
  ]);
  assert.deepEqual(removeCurvePointAt(curve, 0), curve);
  assert.deepEqual(removeCurvePointAt(curve, 3), curve);
  assert.deepEqual(removeCurvePointAt(curve, 1.5), curve);
});

test('nearestCurvePointIndex chooses the closest point inside the radius', () => {
  const curve = [
    [0, 0],
    [100, 100],
    [110, 140],
    [255, 255],
  ];
  assert.equal(nearestCurvePointIndex(curve, 103, 104, 10), 1);
  assert.equal(nearestCurvePointIndex(curve, 109, 137, 10), 2);
  assert.equal(nearestCurvePointIndex(curve, 180, 20, 10), -1);
});

test('validation requires sorted unique integer inputs in range with both endpoints', () => {
  assert.equal(validCurvePoints([[0, 0], [128, 64], [255, 255]]), true);
  assert.equal(validCurvePoints([[0, 0], [128, 64], [128, 70], [255, 255]]), false);
  assert.equal(validCurvePoints([[0, 0], [200, 64], [100, 70], [255, 255]]), false);
  assert.equal(validCurvePoints([[0, 0], [128, 256], [255, 255]]), false);
  assert.equal(validCurvePoints([[0, 0], [128.5, 64], [255, 255]]), false);
  assert.equal(validCurvePoints([[0, -1], [255, 255]]), false);
  assert.equal(validCurvePoints([[1, 0], [255, 255]]), false);
  const tooMany = Array.from({ length: 34 }, (_, index) => [
    Math.round((index / 33) * 255),
    0,
  ]);
  assert.equal(validCurvePoints(tooMany), false);
  // Legacy documents may hold up to 33 points; the editor itself caps at 16.
  const legacy = tooMany.slice(0, 32).concat([[255, 0]]);
  assert.equal(validCurvePoints(legacy), true);
  assert.equal(editableCurvePoints(legacy), false);
  assert.equal(validCurves(withRgb(identityCurve, 'monotone')), true);
  assert.equal(validCurves(withRgb(identityCurve, 'cubic')), false);
});

test('monotone interpolation never overshoots and stays monotone between points', () => {
  const curves = [
    [[0, 0], [64, 10], [128, 245], [192, 250], [255, 255]],
    [[0, 0], [30, 200], [60, 200], [255, 255]],
    [[0, 255], [128, 0], [255, 255]],
    [[0, 20], [10, 30], [11, 240], [250, 245], [255, 250]],
  ];
  for (const curve of curves) {
    for (let index = 1; index < curve.length; index += 1) {
      const [lx, ly] = curve[index - 1],
        [rx, ry] = curve[index];
      let previous = ly;
      for (let x = lx; x <= rx; x += 0.25) {
        const value = evaluateCurve(curve, x, 'monotone');
        assert.ok(value >= Math.min(ly, ry) - 1e-9 && value <= Math.max(ly, ry) + 1e-9,
          `overshoot at ${x}: ${value}`);
        if (ry >= ly) assert.ok(value >= previous - 1e-9, `not monotone at ${x}`);
        else assert.ok(value <= previous + 1e-9, `not monotone at ${x}`);
        previous = value;
      }
    }
    // Interpolating: every control point is reproduced exactly.
    for (const [x, y] of curve) assert.equal(sampleCurve(curve, x, 'monotone'), y);
  }
});

test('monotone interpolation is smooth: it differs from linear between interior points', () => {
  const curve = [[0, 0], [64, 40], [192, 220], [255, 255]];
  const table = curveTable(curve, 'monotone');
  const linear = curveTable(curve, 'linear');
  assert.equal(table[0], 0);
  assert.equal(table[255], 255);
  assert.equal(table[64], 40);
  assert.equal(table[192], 220);
  assert.notDeepEqual([...table], [...linear]);
  for (let index = 1; index < 256; index += 1) assert.ok(table[index] >= table[index - 1]);
});

test('endpoint outputs hold below and above the endpoint inputs', () => {
  const curve = [[0, 30], [128, 100], [255, 200]];
  for (const interpolation of ['linear', 'monotone']) {
    assert.equal(sampleCurve(curve, -50, interpolation), 30);
    assert.equal(sampleCurve(curve, 0, interpolation), 30);
    assert.equal(sampleCurve(curve, 255, interpolation), 200);
    assert.equal(sampleCurve(curve, 400, interpolation), 200);
  }
});

test('two-point curves render identically under linear and monotone interpolation', () => {
  for (const curve of [identityCurve, [[0, 30], [255, 220]], [[0, 255], [255, 0]], [[0, 7], [255, 250]]]) {
    assert.deepEqual([...curveTable(curve, 'monotone')], [...curveTable(curve, 'linear')]);
    for (let input = 0; input < 256; input += 1)
      assert.equal(sampleCurve(curve, input, 'monotone'), legacyLinear(curve, input));
  }
});

test('legacy curves without an interpolation field keep their exact piecewise-linear output', () => {
  const legacyRgb = [[0, 0], [64, 30], [128, 192], [255, 255]];
  const legacy = withRgb(legacyRgb);
  assert.equal(curveInterpolation(legacy), 'linear');
  // Normalising never writes a resolved value back into the record.
  assert.equal(effectiveCurves(legacy).interpolation, undefined);
  assert.equal(effectiveCurves(withRgb(legacyRgb, 'monotone')).interpolation, 'monotone');
  const tables = compileCurves(legacy);
  for (let input = 0; input < 256; input += 1)
    assert.equal(tables[0][input], legacyLinear(legacyRgb, input));
  // The same points flagged monotone render differently (smooth).
  const smooth = compileCurves(withRgb(legacyRgb, 'monotone'));
  assert.notDeepEqual([...smooth[0]], [...tables[0]]);
  // Endpoint-only and absent records adopt the smooth default for new edits.
  assert.equal(curveInterpolation(undefined), 'monotone');
  assert.equal(curveInterpolation(withRgb(identityCurve)), 'monotone');
  assert.equal(curveInterpolation(withRgb(legacyRgb, 'monotone')), 'monotone');
});

test('curvesPixel and in-place application agree with compiled tables', () => {
  const curves = {
    ...withRgb([[0, 0], [90, 60], [170, 210], [255, 255]], 'monotone'),
    red: [[0, 10], [128, 150], [255, 245]],
  };
  const tables = compileCurves(curves);
  const data = new Uint8ClampedArray([20, 90, 200, 255, 128, 128, 128, 255]);
  applyCurvesPixels(data, curves);
  assert.deepEqual([data[0], data[1], data[2]], [tables[0][20], tables[1][90], tables[2][200]]);
  assert.deepEqual(curvesPixel(20, 90, 200, curves), [data[0], data[1], data[2]]);
});
