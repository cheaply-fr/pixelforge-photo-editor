import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SMUDGE_SETTINGS,
  SMUDGE_MODES,
  applySmudgeDabs,
  applySmudgeStroke,
  createSmudgeStroke,
  normalizeSmudgeSettings,
  planSmudgeSegment,
  smudgeDabReach,
  smudgeStroke,
  validSmudgeSettings,
} from '../src/smudge.ts';
import { strokeWindow, cropRgba, cropAlpha, pasteRgba } from '../src/strokeWindow.ts';
import { paintSymmetryTransforms } from '../src/paintSymmetry.ts';
import { normalizeBrushDynamics } from '../src/brushDynamics.ts';
import { normalizeCustomBrushPresets, validCustomBrushPreset } from '../src/customBrushPresets.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/** RGBA raster filled by `paint(x, y)`. */
const raster = (width, height, paint) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) pixels.set(paint(x, y), (y * width + x) * 4);
  return pixels;
};
const at = (pixels, width, x, y) => Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
/** Red/white split: red for x < split. */
const split = (width, height, split = 60, left = RED, right = WHITE) =>
  raster(width, height, (x) => (x < split ? left : right));
/** How much red was dragged into a white pixel: 255 - green. */
const redness = (pixels, width, x, y) => 255 - pixels[(y * width + x) * 4 + 1];
const W = 200, H = 40;
const drag = (pixels, options = {}, points = [{ x: 40, y: 20 }, { x: 180, y: 20 }]) =>
  applySmudgeStroke(pixels, points, { width: W, height: H, size: 20, hardness: 100, strength: 0.5, ...options });

test('settings validate, normalise and migrate the legacy Flow value', () => {
  assert.deepEqual(normalizeSmudgeSettings(undefined), DEFAULT_SMUDGE_SETTINGS);
  assert.equal(DEFAULT_SMUDGE_SETTINGS.strength, 50);
  assert.equal(normalizeSmudgeSettings(undefined, 57).strength, 57, 'legacy brushOpacity becomes Strength');
  assert.equal(normalizeSmudgeSettings({ strength: 20 }, 57).strength, 20, 'stored Strength wins over legacy');
  assert.equal(normalizeSmudgeSettings({ strength: 400 }).strength, 100);
  assert.equal(normalizeSmudgeSettings({ mode: 'multiply' }).mode, 'normal');
  assert.ok(validSmudgeSettings({}));
  assert.ok(validSmudgeSettings({ strength: 0, mode: 'luminosity', fingerPainting: true, sampleAllLayers: true, ignoreAdjustments: true, pressureStrength: true }));
  for (const bad of [null, [], { strength: -1 }, { strength: 101 }, { strength: 'x' }, { mode: 'screen' }, { fingerPainting: 1 }, { sampleAllLayers: 'yes' }])
    assert.equal(validSmudgeSettings(bad), false, JSON.stringify(bad));
  assert.deepEqual([...SMUDGE_MODES], ['normal', 'darken', 'lighten', 'hue', 'saturation', 'color', 'luminosity']);
});

test('drafts and brush presets accept Smudge settings and reject invalid ones', () => {
  const preset = {
    id: '00000000-0000-4000-8000-000000000001', label: 'Smear', size: 30, hardness: 60, spacing: 25, angle: 30,
    roundness: 40, flipX: false, flipY: false, pressureSize: false, pressureOpacity: false, brushSmoothing: 0,
    brushScatter: 0, brushTexture: 0, brushDual: 0, secondaryBrushPreset: 'none', brushBristle: 0, brushFlow: 100,
  };
  assert.ok(validCustomBrushPreset(preset), 'presets saved before Smudge settings still load');
  assert.ok(validCustomBrushPreset({ ...preset, smudge: { ...DEFAULT_SMUDGE_SETTINGS, strength: 80, mode: 'darken' } }));
  assert.equal(validCustomBrushPreset({ ...preset, smudge: { strength: 120 } }), false);
  const [normalized] = normalizeCustomBrushPresets([{ ...preset, smudge: { strength: 80, fingerPainting: true } }]);
  assert.deepEqual(normalized.smudge, { ...DEFAULT_SMUDGE_SETTINGS, strength: 80, fingerPainting: true });
  assert.equal(normalizeCustomBrushPresets([preset])[0].smudge, undefined);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const assetId = '11111111-1111-4111-8111-111111111111', layerId = '22222222-2222-4222-8222-222222222222';
  const draft = (settings) => ({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Smudge fixture',
    index: 0,
    settings: { tool: 'smudge', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral, ...settings },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: layerId,
      layers: [{
        id: layerId, name: 'Background', visible: true, locked: false, opacity: 1, blend: 'source-over',
        matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      }],
    }],
  });
  assert.equal(validateDraft(draft({})).settings.smudge, undefined, 'older drafts omit Smudge settings');
  assert.deepEqual(validateDraft(draft({ smudge: { strength: 75, mode: 'hue', sampleAllLayers: true } })).settings.smudge,
    { strength: 75, mode: 'hue', sampleAllLayers: true });
  for (const bad of [{ strength: 175 }, { mode: 'overlay' }, { fingerPainting: 'on' }, []])
    assert.throws(() => validateDraft(draft({ smudge: bad })), /not supported/, JSON.stringify(bad));
  assert.throws(() => validateDraft(draft({ customBrushPresets: [{ ...preset, smudge: { strength: -4 } }] })), /not supported/);
});

test('Strength 0 is an identity and a stationary tap changes nothing', () => {
  const pixels = split(W, H);
  const before = pixels.slice();
  const none = drag(pixels, { strength: 0 });
  assert.equal(none.changed, false);
  assert.deepEqual(none.pixels, before);
  const tap = drag(pixels, {}, [{ x: 70, y: 20 }, { x: 70, y: 20 }]);
  assert.equal(tap.changed, false);
  assert.deepEqual(pixels, before, 'inputs are never mutated');
  assert.notEqual(tap.pixels, pixels);
});

test('carried colour fades with distance and higher Strength drags further', () => {
  const pixels = split(W, H);
  const fifty = drag(pixels, { strength: 0.5 }).pixels,
    seventyFive = drag(pixels, { strength: 0.75 }).pixels,
    full = drag(pixels, { strength: 1 }).pixels;
  const profile = (result) => [64, 80, 100, 120, 140, 160].map((x) => redness(result, W, x, 20));
  const p50 = profile(fifty), p75 = profile(seventyFive), p100 = profile(full);
  for (let index = 1; index < p50.length; index += 1) {
    assert.ok(p50[index] <= p50[index - 1], `50% fades: ${String(p50)}`);
    assert.ok(p75[index] <= p75[index - 1], `75% fades: ${String(p75)}`);
  }
  assert.ok(p50[0] > 150, `paint is dragged into the white: ${String(p50)}`);
  assert.ok(p50[4] < 20, `50% has faded after ~4 diameters: ${String(p50)}`);
  assert.ok(p75[3] > p50[3] + 60, `75% drags further than 50%: ${String(p75)} vs ${String(p50)}`);
  assert.deepEqual(p100, [255, 255, 255, 255, 255, 255], 'Strength 100% drags the colour unchanged');
  // Pixels away from the stroke are untouched.
  assert.deepEqual(at(fifty, W, 120, 2), WHITE);
});

test('smear distance is about the same for dense and sparse dab spacing', () => {
  const pixels = split(W, H);
  const trail = (result) => {
    let x = 60;
    while (x < W && redness(result, W, x, 20) > 64) x += 1;
    return x - 60;
  };
  const lengths = [4, 10, 25].map((spacing) => trail(drag(pixels, { spacing, strength: 0.6 }).pixels));
  const [min, max] = [Math.min(...lengths), Math.max(...lengths)];
  assert.ok(min > 10, `trails exist: ${String(lengths)}`);
  assert.ok(max / min < 1.6, `spacing-independent trail lengths: ${String(lengths)}`);
});

test('the paint load is per pixel: texture and detail are smeared, not averaged', () => {
  // Horizontal stripes dragged along their length stay stripes.
  const stripes = raster(W, H, (x, y) => (x < 60 ? (y % 6 < 3 ? RED : [0, 0, 255, 255]) : WHITE));
  const result = drag(stripes, { strength: 0.8, size: 24 }).pixels;
  const a = at(result, W, 75, 19), b = at(result, W, 75, 22);
  assert.ok(a[0] > a[2] + 60, `red stripe stays red: ${String(a)}`);
  assert.ok(b[2] > b[0] + 60, `blue stripe stays blue: ${String(b)}`);
});

test('alpha is picked up and deposited', () => {
  const opaqueIntoClear = drag(split(W, H, 60, RED, CLEAR), { strength: 0.75 }).pixels;
  assert.ok(at(opaqueIntoClear, W, 70, 20)[3] > 128, 'opaque paint is dragged onto transparent pixels');
  assert.deepEqual(at(opaqueIntoClear, W, 70, 20).slice(0, 3), [255, 0, 0]);
  const clearIntoOpaque = drag(split(W, H, 60, CLEAR, WHITE), { strength: 0.75 }).pixels;
  assert.ok(at(clearIntoOpaque, W, 70, 20)[3] < 128, 'transparency is dragged into opaque pixels');
  // Transparent hidden RGB never leaks: a fully transparent smear stays clear.
  const hidden = raster(W, H, () => [12, 200, 7, 0]);
  const clear = drag(hidden, { strength: 1 });
  assert.equal(clear.changed, false);
});

test('Finger Painting starts the load with the opaque foreground colour', () => {
  const white = raster(W, H, () => WHITE);
  const result = drag(white, { fingerPainting: true, color: [0, 0, 255], strength: 0.5 });
  assert.ok(result.changed);
  const start = at(result.pixels, W, 40, 20);
  assert.ok(start[0] < 200 && start[2] === 255, `the first dab deposits blue: ${String(start)}`);
  const near = at(result.pixels, W, 50, 20), far = at(result.pixels, W, 150, 20);
  assert.ok(255 - near[0] > 255 - far[0], 'the foreground fades along the stroke');
  // Onto transparent pixels Finger Painting paints opaque colour.
  const clear = drag(raster(W, H, () => CLEAR), { fingerPainting: true, color: [10, 200, 30], strength: 1 });
  assert.deepEqual(at(clear.pixels, W, 100, 20), [10, 200, 30, 255]);
  // A Finger Painting tap paints one dab.
  assert.ok(drag(white, { fingerPainting: true, color: [0, 0, 0] }, [{ x: 30, y: 20 }]).changed);
});

test('Sample All Layers smudges the composite onto an empty layer', () => {
  const composite = split(W, H);
  const empty = raster(W, H, () => CLEAR);
  const layer = drag(empty, { sample: composite, strength: 0.6 });
  assert.ok(layer.changed);
  const deposited = at(layer.pixels, W, 75, 20);
  assert.ok(deposited[3] > 0 && deposited[0] === 255 && deposited[1] < 40, `red paint lands on the empty layer: ${String(deposited)}`);
  assert.deepEqual(at(layer.pixels, W, 120, 2), CLEAR, 'pixels outside the tip stay empty');
  // Layer over composite reproduces smudging the flattened image (Normal mode).
  const flat = drag(composite, { strength: 0.6 }).pixels;
  for (const x of [35, 40, 62, 70, 85, 100, 120, 150]) {
    const top = at(layer.pixels, W, x, 20), below = at(composite, W, x, 20), alpha = top[3] / 255;
    const over = [0, 1, 2].map((channel) => top[channel] * alpha + below[channel] * (1 - alpha));
    const expected = at(flat, W, x, 20);
    for (let channel = 0; channel < 3; channel += 1)
      assert.ok(Math.abs(over[channel] - expected[channel]) <= 3, `x=${String(x)}: ${String(over)} vs ${String(expected)}`);
  }
  assert.deepEqual(composite, split(W, H), 'the sample input is not mutated');
});

test('each mode writes the smudged colour through its rule', () => {
  const run = (left, right, mode) => at(drag(split(W, H, 60, left, right), { mode, strength: 0.8 }).pixels, W, 70, 20);
  // Darken only darkens; Lighten only lightens.
  assert.ok(run([20, 20, 20, 255], WHITE, 'darken')[0] < 120);
  assert.deepEqual(run(WHITE, [20, 20, 20, 255], 'darken'), [20, 20, 20, 255]);
  assert.ok(run(WHITE, [20, 20, 20, 255], 'lighten')[0] > 120);
  assert.deepEqual(run([20, 20, 20, 255], WHITE, 'lighten'), WHITE);
  // Color keeps the grey's luminosity but takes red's hue and saturation.
  const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
  const grey = [128, 128, 128, 255];
  const color = run(RED, grey, 'color');
  assert.ok(color[0] > color[1] + 40, `colour mode tints: ${String(color)}`);
  assert.ok(Math.abs(lum(color) - 128) <= 3, `colour mode keeps luminosity: ${String(color)}`);
  // Luminosity keeps red's hue but brightens it from the dragged light grey.
  const luminosity = run([170, 170, 170, 255], [200, 0, 0, 255], 'luminosity');
  assert.ok(luminosity[0] > luminosity[2] && lum(luminosity) > lum([200, 0, 0]) + 30, `${String(luminosity)}`);
  // Hue turns red towards the dragged blue while keeping saturation.
  const hue = run([0, 0, 255, 255], [220, 30, 30, 255], 'hue');
  assert.ok(hue[2] > hue[0], `hue: ${String(hue)}`);
  // Saturation drains colour from red when grey is dragged in.
  const saturation = run(grey, [220, 30, 30, 255], 'saturation');
  assert.ok(saturation[0] - saturation[1] < 190 - 40, `saturation: ${String(saturation)}`);
  // Normal equals the plain smear.
  assert.deepEqual(run(RED, WHITE, 'normal'), at(drag(split(W, H), { strength: 0.8 }).pixels, W, 70, 20));
});

test('angle and roundness shape non-round tips and do nothing to round ones', () => {
  const size = 41, width = 80, height = 80;
  const footprint = (angle, roundness) => {
    const { pixels } = applySmudgeStroke(raster(width, height, () => WHITE), [{ x: 40, y: 40 }], {
      width, height, size, hardness: 100, strength: 1, angle, roundness, fingerPainting: true, color: [0, 0, 0],
    });
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1)
        if (pixels[(y * width + x) * 4] < 128) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    return { width: maxX - minX + 1, height: maxY - minY + 1, pixels };
  };
  const flat = footprint(0, 25), upright = footprint(90, 25);
  assert.ok(flat.width > flat.height * 2.5, `0° flat tip is wide: ${String(flat.width)}x${String(flat.height)}`);
  assert.ok(upright.height > upright.width * 2.5, `90° tip is tall: ${String(upright.width)}x${String(upright.height)}`);
  assert.deepEqual(footprint(0, 100).pixels, footprint(63, 100).pixels, 'angle has no effect on a round tip');
});

test('pressure scales size and strength when enabled', () => {
  const pixels = split(W, H);
  const pen = (pressure) => [{ x: 40, y: 20, pressure, pointerType: 'pen' }, { x: 180, y: 20, pressure, pointerType: 'pen' }];
  const strong = drag(pixels, { pressureStrength: true, strength: 0.9 }, pen(1)).pixels,
    light = drag(pixels, { pressureStrength: true, strength: 0.9 }, pen(0.3)).pixels;
  assert.ok(redness(strong, W, 100, 20) > redness(light, W, 100, 20) + 50, 'light pressure smears less');
  const wide = drag(pixels, { pressureSize: true, size: 30, strength: 1 }, pen(1)).pixels,
    narrow = drag(pixels, { pressureSize: true, size: 30, strength: 1 }, pen(0.3)).pixels;
  assert.ok(redness(wide, W, 100, 32) > 200 && redness(narrow, W, 100, 32) === 0, 'light pressure narrows the tip');
  assert.deepEqual(drag(pixels, { strength: 0.9 }, pen(0.3)).pixels, drag(pixels, { strength: 0.9 }).pixels,
    'pressure is ignored unless mapped');
  assert.equal(drag(pixels, { pressureSize: true }, pen(0)).changed, false, 'a pen lift does nothing');
});

test('scatter and count are deterministic and replay identically', () => {
  const pixels = split(W, H);
  const dynamics = normalizeBrushDynamics({ count: 3, sizeJitter: 40, angleJitter: 50 });
  const options = { scatter: 120, dynamics, roundness: 50, strength: 0.7 };
  const first = drag(pixels, options), second = drag(pixels, options);
  assert.deepEqual(first.pixels, second.pixels);
  assert.notDeepEqual(first.pixels, drag(pixels, { strength: 0.7, roundness: 50 }).pixels, 'scatter moves dabs');
  const stroke = createSmudgeStroke({ size: 20 });
  const dabs = planSmudgeSegment(stroke, { x: 40, y: 20 }, { x: 100, y: 20 }, { size: 20, hardness: 50, scatter: 120, dynamics });
  assert.ok(dabs.length > 3 * 25, 'Count multiplies dabs per spacing step');
  assert.ok(dabs.some((dab) => Math.abs(dab.y - 20) > 2), 'dabs leave the stroke line');
  assert.equal(smudgeStroke, applySmudgeStroke);
});

test('a selection confines every change', () => {
  const pixels = split(W, H);
  const mask = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < 100; x += 1) mask[y * W + x] = 255;
  const result = drag(pixels, { selectionMask: mask, strength: 0.9 }).pixels;
  assert.ok(redness(result, W, 80, 20) > 100, 'inside the selection is smudged');
  for (let y = 0; y < H; y += 1)
    for (let x = 100; x < W; x += 1) assert.deepEqual(at(result, W, x, y), WHITE, `outside at ${String(x)},${String(y)}`);
  const none = drag(pixels, { selectionMask: new Uint8ClampedArray(W * H) });
  assert.equal(none.changed, false);
});

test('Paint Symmetry smears every copy with its own paint load', () => {
  const width = 120, height = 60;
  // Pixel x mirrors to width - x across the vertical axis (pixel-index centres).
  const image = raster(width, height, (x) => (x <= 20 || x >= 100 ? RED : WHITE));
  const symmetry = paintSymmetryTransforms({ mode: 'vertical', segments: 2, rotation: 0, showGuides: true }, width, height);
  const { pixels } = applySmudgeStroke(image, [{ x: 10, y: 30 }, { x: 50, y: 30 }], {
    width, height, size: 16, hardness: 100, strength: 0.8, symmetry,
  });
  for (const x of [25, 35, 45])
    for (const y of [24, 30, 36])
      assert.deepEqual(at(pixels, width, x, y), at(pixels, width, width - x, y), `mirrored at ${String(x)},${String(y)}`);
  assert.ok(redness(pixels, width, 30, 30) > 100 && redness(pixels, width, 90, 30) > 100);
});

test('large brushes use a bounded, downsampled paint load', () => {
  const stroke = createSmudgeStroke({ size: 4000 });
  assert.ok(stroke.cell > 1 && stroke.side <= 512);
  const many = createSmudgeStroke({ size: 600, copies: 128 });
  assert.ok(many.side * many.side * 128 <= 2 * 1024 * 1024 + 128 * 1024);
  const width = 300, height = 120;
  const image = raster(width, height, (x, y) => (x < 100 ? [(y * 7) % 256, 0, 0, 255] : WHITE));
  const options = { width, height, size: 1200, hardness: 80, strength: 0.7 };
  const first = applySmudgeStroke(image, [{ x: 60, y: 60 }, { x: 240, y: 60 }], options);
  const again = applySmudgeStroke(image, [{ x: 60, y: 60 }, { x: 240, y: 60 }], options);
  assert.ok(first.changed);
  assert.deepEqual(first.pixels, again.pixels);
});

/** Run a multi-segment stroke on windows exactly like the editor does. */
const windowedStroke = (pixels, width, height, points, tip, apply, symmetry) => {
  const target = Uint8ClampedArray.from(pixels);
  const sample = apply.sample ? { data: Uint8ClampedArray.from(apply.sample), width, height, x: 0, y: 0 } : undefined;
  const stroke = createSmudgeStroke({ size: tip.size, copies: symmetry?.length ?? 1 });
  let windowPixels = 0;
  for (let index = 0; index < points.length; index += 1) {
    const dabs = planSmudgeSegment(stroke, points[Math.max(0, index - 1)], points[index], tip, symmetry);
    if (!dabs.length) continue;
    const rect = strokeWindow(dabs, smudgeDabReach(stroke), width, height);
    if (!rect) continue;
    windowPixels = Math.max(windowPixels, rect.width * rect.height);
    const view = { data: cropRgba(target, width, rect), width: rect.width, height: rect.height, x: rect.x, y: rect.y };
    applySmudgeDabs(stroke, dabs, view, {
      ...apply,
      sample,
      selectionMask: apply.selectionMask ? cropAlpha(apply.selectionMask, width, rect) : undefined,
    });
    pasteRgba(target, width, rect, view.data);
  }
  return { pixels: target, windowPixels };
};

test('windowed segments equal the full-layer stroke byte for byte', () => {
  const width = 140, height = 90;
  const image = raster(width, height, (x, y) => [(x * 13 + y * 5) % 256, (x * 3 + y * 11) % 256, (x * y) % 256, 120 + ((x + y) % 136)]);
  const composite = raster(width, height, (x, y) => [(x * 7) % 256, (y * 9) % 256, 90, 255]);
  const mask = raster(width, 1, () => [0, 0, 0, 0]).subarray(0, 0);
  const selection = new Uint8ClampedArray(width * height);
  for (let index = 0; index < selection.length; index += 1) selection[index] = (index * 37) % 256;
  void mask;
  const points = [
    { x: 12, y: 15, pressure: 0.4, pointerType: 'pen' },
    { x: 30, y: 22, pressure: 0.9, pointerType: 'pen' },
    { x: 61.5, y: 40.25, pressure: 0.7, pointerType: 'pen' },
    { x: 95, y: 70, pressure: 1, pointerType: 'pen' },
    { x: 128, y: 80, pressure: 0.6, pointerType: 'pen' },
  ];
  const symmetry = paintSymmetryTransforms({ mode: 'dual', segments: 2, rotation: 0, showGuides: true }, width, height);
  const cases = [
    { tip: { size: 18, hardness: 40 }, apply: { strength: 0.6 } },
    { tip: { size: 25, hardness: 90, angle: 35, roundness: 30, pressureSize: true, pressureStrength: true }, apply: { strength: 0.8, mode: 'luminosity', bristle: 60, texture: 40 } },
    { tip: { size: 16, hardness: 70, scatter: 150, dynamics: normalizeBrushDynamics({ count: 2, sizeJitter: 50, angleJitter: 30, opacityJitter: 20 }) }, apply: { strength: 0.5, selectionMask: selection } },
    { tip: { size: 22, hardness: 100 }, apply: { strength: 0.7, sample: composite, mode: 'darken' } },
    { tip: { size: 14, hardness: 60 }, apply: { strength: 0.9, fingerPainting: true, color: [30, 200, 90] }, symmetry },
  ];
  for (const { tip, apply, symmetry: copies } of cases) {
    const full = applySmudgeStroke(image, points, { width, height, ...tip, ...apply, symmetry: copies });
    const windowed = windowedStroke(image, width, height, points, tip, apply, copies);
    assert.ok(full.changed);
    assert.deepEqual(windowed.pixels, full.pixels, JSON.stringify({ tip, mode: apply.mode }));
    if (!copies && !tip.scatter) assert.ok(windowed.windowPixels < width * height, 'segments do not touch the whole layer');
  }
});

test('invalid inputs fail before any output', () => {
  const pixels = split(W, H);
  assert.throws(() => drag(pixels, { size: 0 }), /size/);
  assert.throws(() => drag(pixels, { hardness: 101 }), /hardness/);
  assert.throws(() => drag(pixels, { strength: 1.5 }), /strength/);
  assert.throws(() => drag(pixels, { mode: 'screen' }), /mode/);
  assert.throws(() => drag(pixels, { selectionMask: new Uint8ClampedArray(3) }), /Selection/);
  assert.throws(() => drag(pixels, { sample: new Uint8ClampedArray(3) }), /Sample/);
  assert.throws(() => drag(pixels.subarray(4)), /RGBA/);
  assert.throws(() => drag(pixels, {}, [{ x: Number.NaN, y: 1 }]), /points/);
  assert.throws(() => applySmudgeStroke(pixels, [], { width: 0, height: 1, size: 4, hardness: 0, strength: 1 }), /dimensions/);
});

test('performance smoke: a large brush stroke on a 2646 x 4096 layer stays windowed and fast', () => {
  const width = 2646, height = 4096;
  const layer = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < layer.length; index += 4) {
    layer[index] = (index >> 4) & 255;
    layer[index + 1] = 128;
    layer[index + 2] = (index >> 10) & 255;
    layer[index + 3] = 255;
  }
  const points = Array.from({ length: 40 }, (_, index) => ({ x: 600 + index * 25, y: 1800 + Math.sin(index / 4) * 200 }));
  const started = performance.now();
  const result = windowedStroke(layer, width, height, points, { size: 300, hardness: 50 }, { strength: 0.6 });
  const elapsed = performance.now() - started;
  assert.ok(result.windowPixels < 600 * 600, `window ${String(result.windowPixels)} px`);
  // About 1,000 px of travel with a 300 px brush (~330 dabs of ~70k px each).
  assert.ok(elapsed < 8000, `took ${String(Math.round(elapsed))} ms`);
  console.log(`smudge perf smoke: ${String(Math.round(elapsed))} ms for 1,000 px at 300 px on 2646x4096`);
});
