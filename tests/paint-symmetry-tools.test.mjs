import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAINT_SYMMETRY,
  IDENTITY_AFFINE,
  PAINT_SYMMETRY_TOOLS,
  applyAffine,
  normalizePaintSymmetry,
  paintSymmetryAppliesToTool,
  paintSymmetryCopyCount,
  paintSymmetryForLayer,
  paintSymmetryTransforms,
  symmetryCloneCopies,
  symmetryDabCopies,
  symmetryStrokePointCopies,
  symmetryTipForTransform,
  transformSymmetryVector,
} from '../src/paintSymmetry.ts';
import {
  DEFAULT_ART_HISTORY_BRUSH,
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  MAX_ART_HISTORY_BRUSH_WORK,
  applyArtHistoryBrushPixels,
  applyHistoryBrushPixels,
  applyMixerBrushPixels,
  applySymmetricRetouchBrush,
  artHistoryBrushWork,
} from '../src/mixerHistoryBrush.ts';
import {
  STROKE_PATH_MAX_SAMPLES,
  planStrokePath,
  strokePathMaxSamplesForCopies,
} from '../src/strokePath.ts';

const settings = (patch = {}) => normalizePaintSymmetry({ ...DEFAULT_PAINT_SYMMETRY, ...patch });
const close = (actual, expected, message, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);

/** Deterministic RGBA test image (opaque, varied colours). */
const image = (width, height, seed = 1) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = (index * 37 + seed * 11) % 256;
    pixels[index * 4 + 1] = (index * 59 + seed * 23) % 256;
    pixels[index * 4 + 2] = (index * 83 + seed * 7) % 256;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
};
const solid = (width, height, [r, g, b, a]) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) pixels.set([r, g, b, a], index * 4);
  return pixels;
};
const pixel = (pixels, width, x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const changedPixels = (before, after) => {
  let count = 0;
  for (let index = 0; index < before.length; index += 4)
    if (before[index] !== after[index] || before[index + 1] !== after[index + 1] ||
      before[index + 2] !== after[index + 2] || before[index + 3] !== after[index + 3]) count += 1;
  return count;
};

test('symmetry applies to Brush, Pencil, Eraser, Mixer, History, Art History, Clone and Healing only', () => {
  assert.deepEqual([...PAINT_SYMMETRY_TOOLS], [
    'brush', 'pencil', 'eraser', 'mixer-brush', 'history-brush', 'art-history-brush', 'clone', 'heal',
  ]);
  for (const tool of PAINT_SYMMETRY_TOOLS) assert.equal(paintSymmetryAppliesToTool(tool), true, tool);
  for (const tool of ['spot-heal', 'patch', 'smudge', 'pattern-stamp', 'red-eye', 'dodge', 'blur', 'move', ''])
    assert.equal(paintSymmetryAppliesToTool(tool), false, tool);
});

test('vectors map through the linear part only', () => {
  const [, mirror] = paintSymmetryTransforms(settings({ mode: 'vertical', center: { x: 300, y: 50 } }), 1000, 500);
  assert.deepEqual(transformSymmetryVector(mirror, { x: 40, y: -15 }), { x: -40, y: -15 });
  assert.deepEqual(transformSymmetryVector(IDENTITY_AFFINE, { x: 40, y: -15 }), { x: 40, y: -15 });
  const [, quarter] = paintSymmetryTransforms(settings({ mode: 'radial', segments: 4 }), 1000, 500);
  const turned = transformSymmetryVector(quarter, { x: 10, y: 0 });
  close(turned.x, 0, 'radial x');
  close(turned.y, 10, 'radial y (clockwise on screen)');
});

test('clone copies map the source point with the same transform (offset turns with the copy)', () => {
  const W = 800, H = 600;
  for (const [mode, segments] of [['vertical', 8], ['horizontal', 8], ['dual', 8], ['diagonal', 8], ['radial', 5], ['mandala', 3]]) {
    const transforms = paintSymmetryTransforms(settings({ mode, segments, rotation: 17 }), W, H),
      dab = { x: 510, y: 222, angle: 25, flipX: false, flipY: false },
      source = { x: 470, y: 260 },
      copies = symmetryCloneCopies(transforms, dab, source),
      plain = symmetryDabCopies(transforms, dab);
    assert.equal(copies.length, paintSymmetryCopyCount({ mode, segments }), mode);
    // The identity copy keeps the original destination and source exactly.
    assert.deepEqual(copies[0], { ...dab, sourceX: 470, sourceY: 260 });
    for (const [index, copy] of copies.entries()) {
      // Destination, angle and handedness are those of an ordinary paint copy.
      assert.deepEqual({ x: copy.x, y: copy.y, angle: copy.angle, flipX: copy.flipX, flipY: copy.flipY }, plain[index]);
      const mapped = applyAffine(transforms[index], source),
        offset = transformSymmetryVector(transforms[index], { x: source.x - dab.x, y: source.y - dab.y });
      close(copy.sourceX, mapped.x, `${mode} ${index} source x`);
      close(copy.sourceY, mapped.y, `${mode} ${index} source y`);
      close(copy.sourceX - copy.x, offset.x, `${mode} ${index} offset x`, 1e-6);
      close(copy.sourceY - copy.y, offset.y, `${mode} ${index} offset y`, 1e-6);
      // Rigid transforms keep the clone distance.
      close(Math.hypot(copy.sourceX - copy.x, copy.sourceY - copy.y), Math.hypot(40, 38), `${mode} ${index} distance`, 1e-6);
    }
  }
});

test('a vertical mirror clone copy samples the mirrored source (x offset negated)', () => {
  const transforms = paintSymmetryTransforms(settings({ mode: 'vertical' }), 200, 100);
  const [original, mirrored] = symmetryCloneCopies(transforms, { x: 60, y: 40, angle: 0, flipX: false, flipY: false }, { x: 30, y: 45 });
  assert.deepEqual({ x: original.sourceX, y: original.sourceY }, { x: 30, y: 45 });
  assert.deepEqual({ x: mirrored.x, y: mirrored.y }, { x: 140, y: 40 });
  assert.deepEqual({ x: mirrored.sourceX, y: mirrored.sourceY }, { x: 170, y: 45 });
});

test('clone copies follow layer-space conjugation for offset layers', () => {
  const layerMatrix = [1, 0, 0, 1, 100, 50];
  const transforms = paintSymmetryForLayer(settings({ mode: 'vertical' }), 400, 200, layerMatrix);
  // Canvas centre x = 200 is local x = 100 for this layer.
  const [, mirrored] = symmetryCloneCopies(transforms, { x: 80, y: 20, angle: 0, flipX: false, flipY: false }, { x: 60, y: 30 });
  close(mirrored.x, 120, 'local destination x');
  close(mirrored.sourceX, 140, 'local source x');
  close(mirrored.sourceY, 30, 'local source y');
});

test('stroke point copies keep pressure and transform order, identity copy unchanged', () => {
  const transforms = paintSymmetryTransforms(settings({ mode: 'dual' }), 100, 100),
    points = [{ x: 60, y: 20, pressure: 0.25 }, { x: 70, y: 30, pressure: 0.75 }],
    copies = symmetryStrokePointCopies(transforms, points);
  assert.equal(copies.length, 4);
  assert.deepEqual(copies[0], points);
  assert.notEqual(copies[0], points, 'returns a fresh list');
  assert.deepEqual(copies[1], [{ x: 40, y: 20, pressure: 0.25 }, { x: 30, y: 30, pressure: 0.75 }]);
  assert.deepEqual(copies[2], [{ x: 60, y: 80, pressure: 0.25 }, { x: 70, y: 70, pressure: 0.75 }]);
  assert.deepEqual(copies[3], [{ x: 40, y: 80, pressure: 0.25 }, { x: 30, y: 70, pressure: 0.75 }]);
  assert.deepEqual(symmetryStrokePointCopies(transforms, []), [[], [], [], []]);
});

test('tip orientation per copy: rotations add, mirrors reflect angle and swap handedness', () => {
  const [, mirror] = paintSymmetryTransforms(settings({ mode: 'vertical' }), 100, 100);
  assert.deepEqual(symmetryTipForTransform(mirror, { angle: 30, flipX: false, flipY: false }), { angle: 150, flipX: false, flipY: true });
  assert.deepEqual(symmetryTipForTransform(IDENTITY_AFFINE, { angle: 30, flipX: true, flipY: false }), { angle: 30, flipX: true, flipY: false });
  const [, quarter] = paintSymmetryTransforms(settings({ mode: 'radial', segments: 4 }), 100, 100);
  assert.deepEqual(symmetryTipForTransform(quarter, { angle: 30, flipX: false, flipY: true }), { angle: 120, flipX: false, flipY: true });
});

const W = 48, H = 24;
const retouchSettings = {
  'mixer-brush': { ...DEFAULT_MIXER_BRUSH, size: 9, hardness: 60 },
  'history-brush': { ...DEFAULT_HISTORY_BRUSH, size: 9, hardness: 60 },
  'art-history-brush': { ...DEFAULT_ART_HISTORY_BRUSH, size: 9, hardness: 60, roundness: 40, angle: 30 },
};
const direct = {
  'mixer-brush': applyMixerBrushPixels,
  'history-brush': applyHistoryBrushPixels,
  'art-history-brush': applyArtHistoryBrushPixels,
};

test('symmetry off keeps every retouch brush byte-identical to the legacy call', () => {
  const destination = image(W, H, 3), source = image(W, H, 9),
    points = [{ x: 10, y: 8, pressure: 1 }, { x: 14, y: 11, pressure: 0.5 }];
  for (const kind of Object.keys(direct)) {
    const legacy = direct[kind](destination, source, W, H, points, retouchSettings[kind]);
    assert.deepEqual(applySymmetricRetouchBrush(kind, destination, source, W, H, points, retouchSettings[kind]), legacy, `${kind} undefined`);
    assert.deepEqual(applySymmetricRetouchBrush(kind, destination, source, W, H, points, retouchSettings[kind], undefined, [IDENTITY_AFFINE]), legacy, `${kind} identity only`);
    assert.deepEqual(applySymmetricRetouchBrush(kind, destination, source, W, H, points, retouchSettings[kind], undefined,
      paintSymmetryForLayer(settings(), W, H, [1, 0, 0, 1, 0, 0])), legacy, `${kind} off settings`);
  }
});

test('History Brush copies restore the snapshot at each mirrored position', () => {
  const destination = solid(W, H, [0, 0, 255, 255]), source = solid(W, H, [255, 0, 0, 255]),
    transforms = paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H),
    one = applyHistoryBrushPixels(destination, source, W, H, [{ x: 10, y: 12 }], retouchSettings['history-brush']),
    both = applySymmetricRetouchBrush('history-brush', destination, source, W, H, [{ x: 10, y: 12 }], retouchSettings['history-brush'], undefined, transforms);
  assert.equal(changedPixels(destination, both), 2 * changedPixels(destination, one));
  // Coverage is evaluated at integer pixel coordinates, so the mirror of
  // column x about centre 24 is column 48 − x.
  for (let y = 0; y < H; y += 1)
    for (let x = 1; x < W; x += 1)
      assert.deepEqual(pixel(both, W, x, y), pixel(both, W, W - x, y), `${x},${y}`);
  assert.deepEqual(pixel(both, W, 10, 12), pixel(one, W, 10, 12));
  assert.deepEqual(pixel(both, W, 38, 12), pixel(both, W, 10, 12));
  assert.notDeepEqual(pixel(both, W, 38, 12), [0, 0, 255, 255], 'mirrored copy restored toward the snapshot');
  assert.deepEqual(pixel(destination, W, 38, 12), [0, 0, 255, 255], 'input not mutated');
});

test('Mixer Brush copies equal applying each copy\'s points in transform order', () => {
  const destination = image(W, H, 5), source = image(W, H, 6),
    transforms = paintSymmetryTransforms(settings({ mode: 'radial', segments: 3, center: { x: 24, y: 12 } }), W, H),
    points = [{ x: 30, y: 12, pressure: 1 }, { x: 31, y: 14, pressure: 1 }],
    actual = applySymmetricRetouchBrush('mixer-brush', destination, source, W, H, points, retouchSettings['mixer-brush'], undefined, transforms);
  let expected = destination;
  for (const list of symmetryStrokePointCopies(transforms, points))
    expected = applyMixerBrushPixels(expected, source, W, H, list, retouchSettings['mixer-brush']);
  assert.deepEqual(actual, expected);
  assert.ok(changedPixels(destination, actual) > changedPixels(destination,
    applyMixerBrushPixels(destination, source, W, H, points, retouchSettings['mixer-brush'])));
});

test('Art History copies mirror the tip orientation per copy', () => {
  const destination = image(W, H, 2), source = image(W, H, 8),
    transforms = paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H),
    base = retouchSettings['art-history-brush'],
    points = [{ x: 12, y: 12 }],
    actual = applySymmetricRetouchBrush('art-history-brush', destination, source, W, H, points, base, undefined, transforms);
  const [originalPoints, mirroredPoints] = symmetryStrokePointCopies(transforms, points);
  const first = applyArtHistoryBrushPixels(destination, source, W, H, originalPoints, base),
    expected = applyArtHistoryBrushPixels(first, source, W, H, mirroredPoints, { ...base, angle: 150, flipY: true });
  assert.deepEqual(actual, expected);
  // Without mirroring the tip the mirrored dab would cover different pixels.
  const unmirrored = applyArtHistoryBrushPixels(first, source, W, H, mirroredPoints, base);
  assert.notDeepEqual(actual, unmirrored);
});

test('Art History work budget covers all copies together', () => {
  const big = 512, size = 300,
    destination = new Uint8ClampedArray(big * big * 4), source = new Uint8ClampedArray(big * big * 4),
    stroke = { ...DEFAULT_ART_HISTORY_BRUSH, size },
    points = [{ x: 256, y: 256 }, { x: 260, y: 256 }],
    transforms = paintSymmetryTransforms(settings({ mode: 'radial', segments: 8 }), big, big);
  const single = artHistoryBrushWork(points, size, big, big);
  assert.ok(single <= MAX_ART_HISTORY_BRUSH_WORK, 'one copy fits');
  assert.doesNotThrow(() => applyArtHistoryBrushPixels(destination, source, big, big, points, stroke));
  assert.throws(
    () => applySymmetricRetouchBrush('art-history-brush', destination, source, big, big, points, stroke, undefined, transforms),
    /local work limit/,
  );
});

test('symmetry copies honour the selection mask per pixel', () => {
  const destination = solid(W, H, [0, 0, 255, 255]), source = solid(W, H, [255, 0, 0, 255]),
    mask = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W / 2; x += 1) mask[y * W + x] = 255;
  const transforms = paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H);
  for (const kind of ['mixer-brush', 'history-brush']) {
    const result = applySymmetricRetouchBrush(kind, destination, source, W, H, [{ x: 10, y: 12 }], retouchSettings[kind], mask, transforms);
    assert.ok(changedPixels(destination, result) > 0, kind);
    for (let y = 0; y < H; y += 1)
      for (let x = W / 2; x < W; x += 1)
        assert.deepEqual(pixel(result, W, x, y), [0, 0, 255, 255], `${kind} ${x},${y} stays outside the selection`);
  }
});

test('copies are applied per copy, so long strokes are not capped by copy count', () => {
  const destination = solid(W, H, [0, 0, 0, 255]), source = solid(W, H, [255, 255, 255, 255]),
    points = Array.from({ length: 1100 }, (_, index) => ({ x: 4 + (index % 40), y: 6 }));
  const transforms = paintSymmetryTransforms(settings({ mode: 'dual' }), W, H);
  assert.doesNotThrow(() => applySymmetricRetouchBrush('history-brush', destination, source, W, H, points, retouchSettings['history-brush'], undefined, transforms));
});

test('Stroke Path sample budget divides by the symmetry copy count', () => {
  assert.equal(strokePathMaxSamplesForCopies(1), STROKE_PATH_MAX_SAMPLES);
  assert.equal(strokePathMaxSamplesForCopies(2), 10_000);
  assert.equal(strokePathMaxSamplesForCopies(16), 1_250);
  assert.equal(strokePathMaxSamplesForCopies(128), 156);
  assert.equal(strokePathMaxSamplesForCopies(0), STROKE_PATH_MAX_SAMPLES);
  assert.equal(strokePathMaxSamplesForCopies(Number.NaN), STROKE_PATH_MAX_SAMPLES);
  assert.equal(strokePathMaxSamplesForCopies(1e9), 1);
  for (const [mode, segments] of [['vertical', 8], ['dual', 8], ['radial', 64], ['mandala', 64]]) {
    const copies = paintSymmetryCopyCount({ mode, segments });
    assert.ok(strokePathMaxSamplesForCopies(copies) * copies <= STROKE_PATH_MAX_SAMPLES, mode);
  }
});

test('a long stroked path widens spacing to keep samples × copies within the dab limit', () => {
  const long = {
    nodes: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], closed: false, fill: false, stroke: true,
    strokeWidth: 1, fillColor: '#000000', strokeColor: '#000000',
  };
  const options = { simulatePressure: false, taperStart: 0, taperEnd: 0, minSize: 0, pressureSize: true, pressureOpacity: false, size: 4, spacing: 25 };
  const plain = planStrokePath([{ path: long, matrix: [1, 0, 0, 1, 0, 0] }], [1, 0, 0, 1, 0, 0], options);
  assert.equal(plain.limited, false);
  assert.ok(plain.samples.length > 3000);
  const copies = paintSymmetryCopyCount({ mode: 'mandala', segments: 8 });
  const mirrored = planStrokePath([{ path: long, matrix: [1, 0, 0, 1, 0, 0] }], [1, 0, 0, 1, 0, 0],
    { ...options, maxSamples: strokePathMaxSamplesForCopies(copies) });
  assert.equal(mirrored.limited, true);
  assert.ok(mirrored.samples.length * copies <= STROKE_PATH_MAX_SAMPLES);
  // Off (one copy) keeps the unchanged plan.
  assert.deepEqual(planStrokePath([{ path: long, matrix: [1, 0, 0, 1, 0, 0] }], [1, 0, 0, 1, 0, 0],
    { ...options, maxSamples: strokePathMaxSamplesForCopies(1) }).samples, plain.samples);
});
