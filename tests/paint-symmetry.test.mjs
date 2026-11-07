import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAINT_SYMMETRY,
  IDENTITY_AFFINE,
  PAINT_SYMMETRY_MODES,
  affineMaxScale,
  applyAffine,
  invertAffine,
  multiplyAffine,
  normalizePaintSymmetry,
  nudgePaintSymmetryCenter,
  paintSymmetryCopyCount,
  paintSymmetryForLayer,
  paintSymmetryGuides,
  paintSymmetryTransforms,
  resolvePaintSymmetryCenter,
  symmetryDabCopies,
  transformSymmetryDab,
  validPaintSymmetry,
  wrapSymmetryAngle,
} from '../src/paintSymmetry.ts';
import { brushCoverage } from '../src/brush.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const W = 1200, H = 800;
const settings = (patch = {}) => normalizePaintSymmetry({ ...DEFAULT_PAINT_SYMMETRY, ...patch });
const close = (actual, expected, message, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
const closePoint = (actual, expected, message) => {
  close(actual.x, expected.x, `${message} x`);
  close(actual.y, expected.y, `${message} y`);
};
const points = (mode, point, patch = {}) =>
  paintSymmetryTransforms(settings({ mode, ...patch }), W, H).map((m) => applyAffine(m, point));
const sortPoints = (list) =>
  list.map((p) => ({ x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
const dab = (patch = {}) => ({ x: 700, y: 300, angle: 30, flipX: false, flipY: false, ...patch });

test('defaults are off with 8 segments, no rotation, canvas-centred, guides shown', () => {
  assert.deepEqual(DEFAULT_PAINT_SYMMETRY, { mode: 'off', segments: 8, rotation: 0, showGuides: true });
  assert.equal(paintSymmetryCopyCount(DEFAULT_PAINT_SYMMETRY), 1);
  assert.deepEqual(resolvePaintSymmetryCenter(DEFAULT_PAINT_SYMMETRY, W, H), { x: 600, y: 400 });
  assert.deepEqual(paintSymmetryTransforms(DEFAULT_PAINT_SYMMETRY, W, H), [IDENTITY_AFFINE]);
});

test('off keeps the unchanged single-dab path (no layer transforms at all)', () => {
  assert.equal(paintSymmetryForLayer(settings(), W, H, [1, 0, 0, 1, 0, 0]), undefined);
  // A dab through the identity is returned as the very same object.
  const source = dab();
  assert.equal(transformSymmetryDab(IDENTITY_AFFINE, source), source);
});

test('copy counts per mode and segment bounds', () => {
  assert.equal(paintSymmetryCopyCount({ mode: 'vertical', segments: 8 }), 2);
  assert.equal(paintSymmetryCopyCount({ mode: 'horizontal', segments: 8 }), 2);
  assert.equal(paintSymmetryCopyCount({ mode: 'diagonal', segments: 8 }), 2);
  assert.equal(paintSymmetryCopyCount({ mode: 'dual', segments: 8 }), 4);
  assert.equal(paintSymmetryCopyCount({ mode: 'radial', segments: 8 }), 8);
  assert.equal(paintSymmetryCopyCount({ mode: 'mandala', segments: 8 }), 16);
  assert.equal(paintSymmetryCopyCount({ mode: 'radial', segments: 1 }), 2);
  assert.equal(paintSymmetryCopyCount({ mode: 'radial', segments: 999 }), 64);
  for (const mode of PAINT_SYMMETRY_MODES)
    for (const segments of [2, 3, 7, 64])
      assert.equal(
        paintSymmetryTransforms(settings({ mode, segments }), W, H).length,
        paintSymmetryCopyCount({ mode, segments }),
        `${mode} ${segments}`,
      );
});

test('vertical axis mirrors left/right through the centre', () => {
  const [a, b] = points('vertical', { x: 700, y: 300 });
  assert.deepEqual(a, { x: 700, y: 300 });
  closePoint(b, { x: 500, y: 300 }, 'mirror');
});

test('horizontal axis mirrors top/bottom through the centre', () => {
  const [, b] = points('horizontal', { x: 700, y: 300 });
  closePoint(b, { x: 700, y: 500 }, 'mirror');
});

test('dual axis yields the four quadrant images', () => {
  assert.deepEqual(sortPoints(points('dual', { x: 700, y: 300 })), sortPoints([
    { x: 700, y: 300 }, { x: 500, y: 300 }, { x: 700, y: 500 }, { x: 500, y: 500 },
  ]));
});

test('diagonal mirrors across the bottom-left to top-right axis', () => {
  // Offset (+100, -50) from the centre reflects across y = -x (y-down) to (+50, -100).
  const [, b] = points('diagonal', { x: 700, y: 350 });
  closePoint(b, { x: 650, y: 300 }, 'diagonal');
  // Points on the axis are fixed.
  const [, onAxis] = points('diagonal', { x: 700, y: 300 });
  closePoint(onAxis, { x: 700, y: 300 }, 'on axis');
});

test('radial N places N copies at equal angles and equal radius', () => {
  for (const segments of [2, 3, 5, 8, 13, 64]) {
    const list = points('radial', { x: 800, y: 400 }, { segments });
    assert.equal(list.length, segments);
    list.forEach((p, k) => {
      close(Math.hypot(p.x - 600, p.y - 400), 200, `radius ${segments}/${k}`, 1e-6);
      const angle = (Math.atan2(p.y - 400, p.x - 600) * 180) / Math.PI;
      close(wrapSymmetryAngle(angle - (360 * k) / segments), 0, `angle ${segments}/${k}`, 1e-6);
    });
  }
  // Radial 4 is exact for axis-aligned offsets (no trig round-off).
  assert.deepEqual(points('radial', { x: 700, y: 400 }, { segments: 4 }),
    [{ x: 700, y: 400 }, { x: 600, y: 500 }, { x: 500, y: 400 }, { x: 600, y: 300 }]);
});

test('mandala is radial N plus N mirror images (dihedral group, all distinct)', () => {
  const list = points('mandala', { x: 700, y: 380 }, { segments: 6 });
  assert.equal(list.length, 12);
  assert.equal(new Set(sortPoints(list).map((p) => `${p.x},${p.y}`)).size, 12);
  for (const p of list) close(Math.hypot(p.x - 600, p.y - 400), Math.hypot(100, 20), 'radius', 1e-6);
  // The first mirror (axis at the rotation, 0°) reflects top/bottom.
  closePoint(list[6], { x: 700, y: 420 }, 'mirror');
  // Closure: composing any two group elements stays in the group.
  const transforms = paintSymmetryTransforms(settings({ mode: 'mandala', segments: 6 }), W, H);
  const key = (m) => m.map((v) => Math.round(v * 1e6)).join(',');
  const keys = new Set(transforms.map(key));
  for (const a of transforms) for (const b of transforms) assert.ok(keys.has(key(multiplyAffine(a, b))));
});

test('centre is editable and clamped into the canvas', () => {
  const at = settings({ mode: 'vertical', center: { x: 300, y: 200 } });
  const [, b] = paintSymmetryTransforms(at, W, H).map((m) => applyAffine(m, { x: 350, y: 250 }));
  closePoint(b, { x: 250, y: 250 }, 'mirror about x=300');
  assert.deepEqual(resolvePaintSymmetryCenter({ center: { x: -50, y: 9999 } }, W, H), { x: 0, y: 800 });
  // Every transform fixes the centre.
  for (const mode of PAINT_SYMMETRY_MODES)
    for (const m of paintSymmetryTransforms(settings({ mode, center: { x: 321, y: 123 }, rotation: 17 }), W, H))
      closePoint(applyAffine(m, { x: 321, y: 123 }), { x: 321, y: 123 }, `${mode} fixes centre`);
});

test('rotation turns the mirror axes', () => {
  // Vertical axis rotated by 90° becomes horizontal.
  const [, b] = points('vertical', { x: 700, y: 300 }, { rotation: 90 });
  closePoint(b, { x: 700, y: 500 }, 'rotated vertical');
  // Horizontal axis rotated by 45° is the y = x (y-down) diagonal.
  const [, c] = points('horizontal', { x: 700, y: 400 }, { rotation: 45 });
  closePoint(c, { x: 600, y: 500 }, 'rotated horizontal');
  // Rotation does not change which rotations a radial set contains.
  assert.deepEqual(sortPoints(points('radial', { x: 750, y: 410 }, { segments: 6, rotation: 33 })),
    sortPoints(points('radial', { x: 750, y: 410 }, { segments: 6, rotation: 0 })));
});

test('mirrored copies flip handedness and reflect the tip angle; rotated copies add their angle', () => {
  const [, mirror] = symmetryDabCopies(paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H), dab());
  // Axis at 90°: θ → 180° − θ, with the tip's local Y flipped.
  assert.equal(mirror.angle, 150);
  assert.equal(mirror.flipY, true);
  assert.equal(mirror.flipX, false);
  const radial = symmetryDabCopies(paintSymmetryTransforms(settings({ mode: 'radial', segments: 4 }), W, H), dab());
  assert.deepEqual(radial.map((copy) => copy.angle), [30, 120, -150, -60]);
  assert.ok(radial.every((copy) => copy.flipY === false));
  // A mirror of a mirrored tip restores handedness.
  assert.equal(transformSymmetryDab(paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H)[1], mirror).flipY, false);
});

test('a mirrored oriented tip is the pixel-exact mirror image of the source tip', () => {
  // Elliptical tip: compare coverage at mirrored offsets.
  const [, mirror] = symmetryDabCopies(paintSymmetryTransforms(settings({ mode: 'vertical' }), W, H), dab({ angle: 30 }));
  for (const [dx, dy] of [[5, 1], [-3, 4], [7, -2], [0, 6], [2.5, -1.5]]) {
    const source = brushCoverage(dx, dy, 8, 60, 35, 30, false, false);
    const image = brushCoverage(-dx, dy, 8, 60, 35, mirror.angle, mirror.flipX, mirror.flipY);
    close(image, source, `coverage ${dx},${dy}`, 1e-9);
  }
  const [, turned] = symmetryDabCopies(paintSymmetryTransforms(settings({ mode: 'radial', segments: 4 }), W, H), dab({ angle: 30 }));
  for (const [dx, dy] of [[5, 1], [-3, 4], [7, -2]]) {
    // Rotation by 90° clockwise (y-down): (dx, dy) → (-dy, dx).
    close(brushCoverage(-dy, dx, 8, 60, 35, turned.angle, false, false),
      brushCoverage(dx, dy, 8, 60, 35, 30, false, false), `rotated ${dx},${dy}`, 1e-9);
  }
});

test('angles stay within the brush engine range', () => {
  for (const mode of PAINT_SYMMETRY_MODES)
    for (const angle of [-180, -179, -90, 0, 45, 179, 180])
      for (const copy of symmetryDabCopies(paintSymmetryTransforms(settings({ mode, segments: 7, rotation: 123 }), W, H), dab({ angle })))
        assert.ok(copy.angle >= -180 && copy.angle <= 180, `${mode} ${angle} → ${copy.angle}`);
  assert.equal(wrapSymmetryAngle(190), -170);
  assert.equal(wrapSymmetryAngle(-190), 170);
  assert.equal(wrapSymmetryAngle(180), 180);
  assert.equal(Object.is(wrapSymmetryAngle(-0), 0), true);
});

test('transforms are deterministic and repeatable', () => {
  const value = settings({ mode: 'mandala', segments: 11, rotation: 7, center: { x: 410.5, y: 233.25 } });
  assert.deepEqual(paintSymmetryTransforms(value, W, H), paintSymmetryTransforms(value, W, H));
  assert.deepEqual(symmetryDabCopies(paintSymmetryTransforms(value, W, H), dab()),
    symmetryDabCopies(paintSymmetryTransforms(value, W, H), dab()));
});

test('copies of a dab inside the canvas stay at the same distance from the centre (bounds)', () => {
  for (const mode of PAINT_SYMMETRY_MODES) {
    const value = settings({ mode, segments: 9, rotation: 21, center: { x: 200, y: 600 } });
    for (const copy of symmetryDabCopies(paintSymmetryTransforms(value, W, H), dab({ x: 260, y: 520 })))
      close(Math.hypot(copy.x - 200, copy.y - 600), Math.hypot(60, 80), `${mode} distance`, 1e-6);
  }
  // Every transform is rigid: stretch factor 1.
  for (const m of paintSymmetryTransforms(settings({ mode: 'mandala', segments: 5, rotation: 13 }), W, H))
    close(affineMaxScale(m), 1, 'rigid', 1e-9);
});

test('layer-space transforms conjugate by the layer matrix', () => {
  // A layer offset by (100, 50): canvas centre 600,400 is local 500,350.
  const local = paintSymmetryForLayer(settings({ mode: 'vertical' }), W, H, [1, 0, 0, 1, 100, 50]);
  assert.equal(local.length, 2);
  assert.equal(local[0], IDENTITY_AFFINE);
  closePoint(applyAffine(local[1], { x: 600, y: 250 }), { x: 400, y: 250 }, 'offset layer');
  // A scaled and rotated layer: mapping local → canvas → mirror → local matches.
  const layer = [0, 2, -2, 0, 300, 100];
  const inverse = invertAffine(layer);
  const value = settings({ mode: 'radial', segments: 5, center: { x: 610, y: 390 } });
  const canvasT = paintSymmetryTransforms(value, W, H);
  const localT = paintSymmetryForLayer(value, W, H, layer);
  const p = { x: 40, y: -30 };
  localT.forEach((m, k) => closePoint(applyAffine(m, p),
    applyAffine(inverse, applyAffine(canvasT[k], applyAffine(layer, p))), `layer copy ${k}`));
  // A singular layer matrix leaves symmetry off rather than throwing.
  assert.equal(paintSymmetryForLayer(value, W, H, [0, 0, 0, 0, 0, 0]), undefined);
});

test('guides: axes for mirror modes, one ray per segment for radial, 2N rays for mandala', () => {
  assert.deepEqual(paintSymmetryGuides(settings(), W, H).lines, []);
  const vertical = paintSymmetryGuides(settings({ mode: 'vertical' }), W, H);
  assert.equal(vertical.lines.length, 1);
  close(vertical.lines[0].x1, 600, 'vertical x1');
  close(vertical.lines[0].x2, 600, 'vertical x2');
  assert.ok(vertical.lines[0].y1 <= 0 && vertical.lines[0].y2 >= H);
  assert.equal(paintSymmetryGuides(settings({ mode: 'dual' }), W, H).lines.length, 2);
  const radial = paintSymmetryGuides(settings({ mode: 'radial', segments: 8 }), W, H);
  assert.equal(radial.lines.length, 8);
  assert.ok(radial.lines.every((line) => line.x1 === 600 && line.y1 === 400 && line.kind === 'segment'));
  assert.equal(paintSymmetryGuides(settings({ mode: 'mandala', segments: 8 }), W, H).lines.length, 16);
  // Rays reach every canvas corner even from an off-centre centre.
  const corner = paintSymmetryGuides(settings({ mode: 'radial', segments: 4, center: { x: 0, y: 0 } }), W, H);
  assert.ok(Math.hypot(corner.lines[0].x2, corner.lines[0].y2) >= Math.hypot(W, H) - 1e-6);
});

test('keyboard nudges move the centre by 1 or 10 px; Home recentres; other keys are ignored', () => {
  const value = settings({ mode: 'radial' });
  assert.deepEqual(nudgePaintSymmetryCenter(value, W, H, 'ArrowRight', false), { x: 601, y: 400 });
  assert.deepEqual(nudgePaintSymmetryCenter(value, W, H, 'ArrowUp', true), { x: 600, y: 390 });
  assert.equal(nudgePaintSymmetryCenter(value, W, H, 'Home', false), undefined);
  assert.equal(nudgePaintSymmetryCenter(value, W, H, 'a', false), null);
  assert.deepEqual(nudgePaintSymmetryCenter(settings({ center: { x: 0, y: 0 } }), W, H, 'ArrowLeft', true), { x: 0, y: 0 });
});

test('validation rejects malformed persisted settings; normalisation repairs them', () => {
  assert.ok(validPaintSymmetry(DEFAULT_PAINT_SYMMETRY));
  assert.ok(validPaintSymmetry({ mode: 'mandala', segments: 64, rotation: -180, showGuides: false, center: { x: 1, y: 2 } }));
  for (const bad of [
    null, 'radial', {}, { ...DEFAULT_PAINT_SYMMETRY, mode: 'spiral' },
    { ...DEFAULT_PAINT_SYMMETRY, segments: 1 }, { ...DEFAULT_PAINT_SYMMETRY, segments: 65 },
    { ...DEFAULT_PAINT_SYMMETRY, segments: 2.5 }, { ...DEFAULT_PAINT_SYMMETRY, rotation: 181 },
    { ...DEFAULT_PAINT_SYMMETRY, rotation: Number.NaN }, { ...DEFAULT_PAINT_SYMMETRY, showGuides: 'yes' },
    { ...DEFAULT_PAINT_SYMMETRY, center: { x: 'a', y: 1 } }, { ...DEFAULT_PAINT_SYMMETRY, center: null },
    { ...DEFAULT_PAINT_SYMMETRY, center: { x: 1e9, y: 0 } },
  ]) assert.equal(validPaintSymmetry(bad), false, JSON.stringify(bad));
  assert.deepEqual(normalizePaintSymmetry({ mode: 'spiral', segments: 300, rotation: 270, center: { x: 'a' } }),
    { mode: 'off', segments: 64, rotation: -90, showGuides: true });
  assert.deepEqual(normalizePaintSymmetry(undefined), DEFAULT_PAINT_SYMMETRY);
  for (const value of [null, 3, { mode: 'radial', segments: 0 }])
    assert.ok(validPaintSymmetry(normalizePaintSymmetry(value)));
});

test('drafts accept valid symmetry settings and reject malformed ones', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const assetId = '11111111-1111-4111-8111-111111111111';
  const draft = (paintSymmetry) => ({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Symmetry fixture',
    index: 0,
    settings: {
      tool: 'brush', zoom: 72, color: '#000000', size: 10, text: '', fontSize: 56, ...neutral,
      ...(paintSymmetry === undefined ? {} : { paintSymmetry }),
    },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: '22222222-2222-4222-8222-222222222222',
      layers: [{
        id: '22222222-2222-4222-8222-222222222222', name: 'Background', visible: true, locked: false,
        opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      }],
    }],
  });
  assert.equal(validateDraft(draft(undefined)).settings.paintSymmetry, undefined);
  const value = { mode: 'radial', segments: 8, rotation: 15, showGuides: false, center: { x: 0.5, y: 0.25 } };
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(draft(value)))).settings.paintSymmetry, value);
  for (const bad of [{ ...value, segments: 0 }, { ...value, mode: 'spiral' }, { ...value, center: { x: 'a', y: 0 } }])
    assert.throws(() => validateDraft(draft(bad)), /not supported/);
});

test('stamping a dab and its mirror copy produces mirror-image pixels', async () => {
  const { applyRadialStamp } = await import('../src/brush.ts');
  const width = 41, height = 31;
  const value = settings({ mode: 'vertical', center: { x: 20, y: 15 } });
  const transforms = paintSymmetryTransforms(value, width, height);
  const stamp = (data, copy) => applyRadialStamp(data, {
    width, height, x: copy.x, y: copy.y, size: 14, hardness: 40, opacity: 0.8,
    angle: copy.angle, roundness: 30, flipX: copy.flipX, flipY: copy.flipY,
    mode: 'source-over', color: [200, 40, 10, 255],
  });
  const [source, mirror] = symmetryDabCopies(transforms, { x: 27, y: 12, angle: 35, flipX: false, flipY: false });
  const a = new Uint8ClampedArray(width * height * 4), b = new Uint8ClampedArray(width * height * 4);
  stamp(a, source);
  stamp(b, mirror);
  let painted = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const left = (y * width + x) * 4, right = (y * width + (width - 1 - x)) * 4;
      for (let c = 0; c < 4; c += 1) assert.equal(b[right + c], a[left + c], `pixel ${x},${y}`);
      if (a[left + 3]) painted += 1;
    }
  assert.ok(painted > 20, 'the fixture paints an oriented ellipse');
});

test('radial 4 copies of a stamped dab are exact quarter turns', async () => {
  const { applyRadialStamp } = await import('../src/brush.ts');
  const size = 41;
  const value = settings({ mode: 'radial', segments: 4, center: { x: 20, y: 20 } });
  const copies = symmetryDabCopies(paintSymmetryTransforms(value, size, size), { x: 29, y: 15, angle: -20, flipX: false, flipY: false });
  const layers = copies.map((copy) => {
    const data = new Uint8ClampedArray(size * size * 4);
    applyRadialStamp(data, {
      width: size, height: size, x: copy.x, y: copy.y, size: 12, hardness: 70, opacity: 1,
      angle: copy.angle, roundness: 40, flipX: copy.flipX, flipY: copy.flipY, mode: 'source-over', color: [0, 0, 0, 255],
    });
    return data;
  });
  // Quarter turn clockwise about (20, 20) on a y-down grid: (x, y) → (40 − y, x).
  for (let k = 1; k < 4; k += 1)
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1)
        assert.equal(layers[k][((x) * size + (40 - y)) * 4 + 3], layers[k - 1][(y * size + x) * 4 + 3], `turn ${k} at ${x},${y}`);
});
