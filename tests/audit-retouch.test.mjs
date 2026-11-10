// Production toolbar audit (2026-11) retouch items I-16..I-23: pure pixel
// logic and settings validation for Clone/Pattern Stamp, Spot Healing types,
// the Patch selection workflow, History Brush source labels, Color Replace
// modes and the Angle/Diamond gradients.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RETOUCH_OPTIONS,
  normalizeRetouchOptions,
  validRetouchOptions,
} from '../src/retouchOptions.ts';
import {
  IMAGE_PATTERN_LIMIT,
  addImagePattern,
  capturePatternTile,
  normalizeImagePatterns,
  validImagePattern,
} from '../src/imagePatterns.ts';
import { applyPatternStamp } from '../src/patternStamp.ts';
import { applySpotHealingStroke, applySpotHealingStrokes, validSpotHealingStroke } from '../src/spotHealing.ts';
import { applyPatchStroke, applyPatchStrokes, validPatchStroke } from '../src/patchTool.ts';
import { replaceColorWindow, replacePixelColor } from '../src/colorReplace.ts';
import { GRADIENT_LOOKUP_SIZE, gradientShapeT, renderGradientShape } from '../src/gradientShapes.ts';
import { buildGradientColorStops } from '../src/gradientStops.ts';
import { describeHistoryStep, historySourceLabels } from '../src/historyTimeline.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const fill = (width, height, rgba) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return data;
};
const at = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

// ---------------------------------------------------------------- settings

test('retouch options default, validate and normalize fail-closed', () => {
  assert.deepEqual(normalizeRetouchOptions(undefined), { ...DEFAULT_RETOUCH_OPTIONS });
  assert.equal(DEFAULT_RETOUCH_OPTIONS.cloneAligned, true);
  assert.equal(DEFAULT_RETOUCH_OPTIONS.colorReplaceMode, 'color');
  assert.equal(DEFAULT_RETOUCH_OPTIONS.spotHealingType, 'content-aware');
  assert.equal(validRetouchOptions({}), true);
  assert.equal(validRetouchOptions({ cloneSample: 'below', patchMode: 'destination', patternImage: null }), true);
  assert.equal(validRetouchOptions({ patternImage: uuid('a') }), true);
  for (const bad of [null, [], { cloneSample: 'layers' }, { cloneAligned: 'yes' }, { patternImage: 'x' }, { unknown: true }])
    assert.equal(validRetouchOptions(bad), false, JSON.stringify(bad));
  assert.deepEqual(
    normalizeRetouchOptions({ colorReplaceMode: 'hue', colorReplaceLimits: 'nope', extra: 1 }),
    { ...DEFAULT_RETOUCH_OPTIONS, colorReplaceMode: 'hue' },
  );
});

const draft = (settings) => ({
  version: CURRENT_DRAFT_VERSION,
  name: 'Retouch fixture',
  index: 0,
  settings: { tool: 'move', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral, ...settings },
  assets: {
    [uuid('1')]: {
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=',
      w: 1,
      h: 1,
    },
  },
  history: [{
    w: 1, h: 1, active: uuid('2'),
    layers: [{
      id: uuid('2'), name: 'Background', visible: true, locked: false, opacity: 1, blend: 'source-over',
      matrix: [1, 0, 0, 1, 0, 0], adjustments: neutral, kind: 'raster', asset: uuid('1'),
    }],
  }],
});

test('drafts persist retouch options, image patterns and new gradient types; older drafts omit them', () => {
  const pattern = { id: uuid('c'), label: 'Selection pattern 1', width: 1, height: 1, url: 'data:image/png;base64,AAAA' };
  const saved = validateDraft(draft({
    retouchOptions: { cloneAligned: false, colorReplaceSampling: 'background' },
    imagePatterns: [pattern],
    gradientMode: 'diamond',
  }));
  assert.deepEqual(saved.settings.retouchOptions, { cloneAligned: false, colorReplaceSampling: 'background' });
  assert.equal(saved.settings.imagePatterns[0].id, pattern.id);
  assert.equal(validateDraft(draft({ gradientMode: 'angle' })).settings.gradientMode, 'angle');
  const legacy = validateDraft(draft({}));
  assert.equal(legacy.settings.retouchOptions, undefined);
  assert.deepEqual(normalizeRetouchOptions(legacy.settings.retouchOptions), { ...DEFAULT_RETOUCH_OPTIONS });
  for (const settings of [
    { retouchOptions: { patchMode: 'lasso' } },
    { imagePatterns: [{ ...pattern, url: 'https://example.com/a.png' }] },
    { imagePatterns: [{ ...pattern, width: 129 }] },
  ])
    assert.throws(() => validateDraft(draft(settings)), /not supported/, JSON.stringify(settings));
});

// ---------------------------------------------------------- image patterns

test('a selection becomes a cropped, coverage-weighted pattern tile', () => {
  const width = 6, height = 4, pixels = fill(width, height, [10, 20, 30, 255]), mask = new Uint8Array(width * height);
  pixels.set([200, 0, 0, 255], (1 * width + 2) * 4);
  mask[1 * width + 2] = 255;
  mask[1 * width + 3] = 128;
  const tile = capturePatternTile(pixels, width, height, mask);
  assert.equal(tile.width, 2);
  assert.equal(tile.height, 1);
  assert.deepEqual(Array.from(tile.data.slice(0, 4)), [200, 0, 0, 255]);
  assert.deepEqual(Array.from(tile.data.slice(4, 8)), [10, 20, 30, 128]);
  assert.equal(capturePatternTile(pixels, width, height, new Uint8Array(width * height)), null);
  assert.throws(() => capturePatternTile(pixels, width, height, new Uint8Array(3)), /must match/);
});

test('large selections are reduced to at most 128 px per side', () => {
  const width = 300, height = 50, pixels = fill(width, height, [5, 6, 7, 255]), mask = new Uint8Array(width * height).fill(255);
  const tile = capturePatternTile(pixels, width, height, mask);
  assert.equal(tile.width, 128);
  assert.equal(tile.height, 21);
  assert.deepEqual(Array.from(tile.data.slice(0, 4)), [5, 6, 7, 255]);
});

test('image pattern lists are validated, de-duplicated and bounded', () => {
  const make = (index) => ({ id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`, label: `P${index}`, width: 2, height: 2, url: 'data:image/png;base64,AAAA' });
  assert.equal(validImagePattern(make(0)), true);
  assert.equal(validImagePattern({ ...make(0), label: '' }), false);
  let list = [];
  for (let index = 0; index < IMAGE_PATTERN_LIMIT + 3; index += 1) list = addImagePattern(list, make(index));
  assert.equal(list.length, IMAGE_PATTERN_LIMIT);
  assert.equal(list.at(-1).label, `P${IMAGE_PATTERN_LIMIT + 2}`);
  assert.equal(normalizeImagePatterns([make(0), make(0), { bad: true }]).length, 1);
});

test('Pattern Stamp tiles an image tile; aligned phase follows the canvas, non-aligned the stroke start', () => {
  const tile = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) };
  const stamp = (anchorX) => {
    const destination = fill(8, 1, [0, 0, 0, 0]);
    applyPatternStamp(destination, { width: 8, height: 1, x: 4, y: 0.5, size: 16, hardness: 100, opacity: 1, pattern: 'checker', tile, anchorX });
    return [0, 1, 2, 3].map((x) => at(destination, 8, x, 0)[0]);
  };
  assert.deepEqual(stamp(undefined), [255, 0, 255, 0]);
  assert.deepEqual(stamp(1), [0, 255, 0, 255]);
  assert.throws(() => applyPatternStamp(fill(2, 2, [0, 0, 0, 0]), {
    width: 2, height: 2, x: 1, y: 1, size: 2, hardness: 100, opacity: 1, pattern: 'checker',
    tile: { width: 2, height: 2, data: new Uint8ClampedArray(4) },
  }), /tile is invalid/);
});

// ------------------------------------------------------------ spot healing

/** A horizontal grey gradient with a vertical red mark through the middle. */
const markedGradient = () => {
  const width = 60, height = 30, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const v = Math.round((x / (width - 1)) * 240);
      data.set(x >= 28 && x <= 31 && y >= 9 && y <= 21 ? [250, 0, 0, 255] : [v, v, v, 255], (y * width + x) * 4);
    }
  return { width, height, data };
};
const stroke = (type, extra = {}) => ({
  version: 1, points: [{ x: 29.5, y: 10 }, { x: 29.5, y: 15 }, { x: 29.5, y: 20 }], size: 12, hardness: 100, opacity: 1,
  ...(type ? { type } : {}), ...extra,
});

test('Spot Healing types are validated; strokes without a type replay as Proximity Match', () => {
  assert.equal(validSpotHealingStroke(stroke('content-aware')), true);
  assert.equal(validSpotHealingStroke(stroke('texture')), true);
  assert.equal(validSpotHealingStroke(stroke('proximity')), true);
  assert.equal(validSpotHealingStroke(stroke('smart')), false);
  const { width, height, data } = markedGradient();
  assert.deepEqual(
    applySpotHealingStrokes(data, width, height, [stroke(undefined)]),
    applySpotHealingStrokes(data, width, height, [stroke('proximity')]),
  );
});

test('Content-Aware continues a gradient across the mark; Proximity Match flattens it', () => {
  const { width, height, data } = markedGradient();
  const aware = applySpotHealingStrokes(data, width, height, [stroke('content-aware')]);
  const proximity = applySpotHealingStrokes(data, width, height, [stroke('proximity')]);
  // The red mark is gone (red channel close to green) in both.
  for (const output of [aware, proximity]) {
    const [r, g, b] = at(output, width, 29, 15);
    assert.ok(Math.abs(r - g) < 12 && Math.abs(g - b) < 2, `${r},${g},${b}`);
  }
  // Content-Aware keeps the left-to-right ramp inside the healed area.
  const left = at(aware, width, 26, 15)[1], right = at(aware, width, 33, 15)[1];
  assert.ok(right - left > 12, `content-aware ramp ${left}..${right}`);
  // Alpha is untouched and pixels far outside the footprint are byte-identical.
  assert.equal(at(aware, width, 29, 15)[3], 255);
  assert.deepEqual(at(aware, width, 5, 5), at(data, width, 5, 5));
});

test('Create Texture adds donor detail, deterministically, and stays inside a selection mask', () => {
  const width = 60, height = 30, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const v = (x + y) % 2 ? 160 : 100;
      data.set(x >= 28 && x <= 31 ? [250, 0, 0, 255] : [v, v, v, 255], (y * width + x) * 4);
    }
  const texture = applySpotHealingStrokes(data, width, height, [stroke('texture')]);
  const aware = applySpotHealingStrokes(data, width, height, [stroke('content-aware')]);
  const spread = (output) => {
    const values = [];
    for (let x = 27; x <= 32; x += 1) values.push(at(output, width, x, 15)[1]);
    return Math.max(...values) - Math.min(...values);
  };
  assert.ok(spread(texture) > spread(aware) + 20, `texture ${spread(texture)} vs ${spread(aware)}`);
  assert.deepEqual(applySpotHealingStrokes(data, width, height, [stroke('texture')]), texture);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < 15; y += 1) mask.fill(255, y * width, y * width + width);
  const confined = new Uint8ClampedArray(data);
  applySpotHealingStroke(confined, data, width, height, stroke('content-aware'), mask);
  assert.deepEqual(at(confined, width, 29, 20), at(data, width, 29, 20));
  assert.notDeepEqual(at(confined, width, 29, 10), at(data, width, 29, 10));
});

// -------------------------------------------------------------------- patch

/** Left half blue with a red square at (4..7, 4..7); right half green. */
const patchFixture = () => {
  const width = 24, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      data.set(x >= 12 ? [0, 200, 0, 255] : x >= 4 && x <= 7 && y >= 4 && y <= 7 ? [255, 0, 0, 255] : [0, 0, 200, 255], (y * width + x) * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 4; y <= 7; y += 1) mask.fill(255, y * width + 4, y * width + 8);
  return { width, height, data, mask };
};
const region = (mode, offset) => ({
  version: 1, points: [{ x: 5, y: 5 }], size: 10, hardness: 100, opacity: 1, sourceOffset: offset, selectionMask: 'mask-1', region: mode,
});

test('Patch region strokes need a selection mask and a known mode', () => {
  assert.equal(validPatchStroke(region('source', { x: 3, y: 0 })), true);
  assert.equal(validPatchStroke(region('destination', { x: -3, y: 0 })), true);
  assert.equal(validPatchStroke({ ...region('source', { x: 1, y: 0 }), selectionMask: undefined }), false);
  assert.equal(validPatchStroke(region('sideways', { x: 1, y: 0 })), false);
});

test('Source mode replaces the selection with pixels from the drop location', () => {
  const { width, height, data, mask } = patchFixture();
  // Dragged 8 px down inside the blue area: the red square becomes blue.
  const output = applyPatchStrokes(data, width, height, [region('source', { x: 0, y: 8 })], { 'mask-1': mask });
  assert.deepEqual(at(output, width, 5, 5), [0, 0, 200, 255]);
  assert.deepEqual(at(output, width, 2, 2), [0, 0, 200, 255]);
  assert.deepEqual(at(output, width, 15, 5), at(data, width, 15, 5));
});

test('Source mode tone-matches the patch to the selection surroundings', () => {
  const { width, height, data, mask } = patchFixture();
  // Dragged onto the green half: the donor ring is green, the original ring
  // is blue, so the copied green is shifted towards blue.
  const output = applyPatchStrokes(data, width, height, [region('source', { x: 10, y: 0 })], { 'mask-1': mask });
  const [r, g, b] = at(output, width, 5, 5);
  assert.ok(b > 150 && g < 60 && r < 30, `${r},${g},${b}`);
});

test('Destination mode copies the selection to where it was dragged', () => {
  const { width, height, data, mask } = patchFixture();
  // Dragged 10 px right: sourceOffset (source − destination) is −10.
  const output = applyPatchStrokes(data, width, height, [region('destination', { x: -10, y: 0 })], { 'mask-1': mask });
  assert.deepEqual(at(output, width, 15, 5), [255, 0, 0, 255]);
  assert.deepEqual(at(output, width, 5, 5), [255, 0, 0, 255]);
  assert.deepEqual(at(output, width, 19, 5), at(data, width, 19, 5));
  // A zero drag is a no-op; a missing mask fails closed.
  const same = new Uint8ClampedArray(data);
  assert.equal(applyPatchStroke(same, data, width, height, region('destination', { x: 0, y: 0 }), mask), false);
  assert.throws(() => applyPatchStrokes(data, width, height, [region('source', { x: 1, y: 0 })], {}), /unavailable/);
});

// ------------------------------------------------------------ color replace

test('Color Replace modes follow the non-separable blend formulas', () => {
  const base = [200, 60, 40], paint = [0, 0, 255];
  assert.deepEqual(replacePixelColor(base, paint, 'normal'), [0, 0, 255]);
  const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
  const color = replacePixelColor(base, paint, 'color');
  assert.ok(Math.abs(lum(color) - lum(base)) < 1.5, 'Color keeps luminosity');
  assert.ok(color[2] > color[0] && color[2] > color[1], 'Color takes the blue hue');
  const luminosity = replacePixelColor(base, paint, 'luminosity');
  assert.ok(Math.abs(lum(luminosity) - lum(paint)) < 1.5);
  assert.ok(luminosity[0] > luminosity[2], 'Luminosity keeps the red hue');
  const saturation = replacePixelColor([120, 100, 100], [255, 0, 0], 'saturation');
  assert.ok(saturation[0] - saturation[1] > 20, 'Saturation raises chroma');
  const hue = replacePixelColor([200, 60, 40], [0, 255, 0], 'hue');
  assert.ok(hue[1] > hue[0] && hue[1] > hue[2], 'Hue takes green');
});

/** 12 × 5: red with a blue column at x = 6 separating two red regions. */
const replaceFixture = () => {
  const width = 12, height = 5, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data.set(x === 6 ? [0, 0, 255, 255] : [220, 20, 20, 255], (y * width + x) * 4);
  return { width, height, data };
};
const replace = (options) => {
  const { width, height, data } = replaceFixture(), output = new Uint8ClampedArray(data);
  replaceColorWindow({
    source: data, output, window: { x: 0, y: 0, width, height }, layerWidth: width, layerHeight: height,
    dabs: [{ x: 4, y: 2 }], radius: 6, paint: [0, 255, 0], tolerance: 10, opacity: 1,
    mode: 'normal', sampling: 'once', target: [220, 20, 20, 255], limits: 'discontiguous', ...options,
  });
  return { width, output };
};

test('Contiguous limits stop at a non-matching column; Discontiguous crosses it', () => {
  const contiguous = replace({ limits: 'contiguous' });
  assert.deepEqual(at(contiguous.output, contiguous.width, 3, 2), [0, 255, 0, 255]);
  assert.deepEqual(at(contiguous.output, contiguous.width, 8, 2), [220, 20, 20, 255]);
  const discontiguous = replace({ limits: 'discontiguous' });
  assert.deepEqual(at(discontiguous.output, discontiguous.width, 8, 2), [0, 255, 0, 255]);
  assert.deepEqual(at(discontiguous.output, discontiguous.width, 6, 2), [0, 0, 255, 255]);
});

test('Continuous sampling reads under each dab; Once and Background use the fixed target', () => {
  // The dab sits on the blue column; the press target is red.
  const once = replace({ dabs: [{ x: 6, y: 2 }], target: [220, 20, 20, 255] });
  assert.deepEqual(at(once.output, once.width, 6, 2), [0, 0, 255, 255]);
  assert.deepEqual(at(once.output, once.width, 5, 2), [0, 255, 0, 255]);
  const continuous = replace({ dabs: [{ x: 6, y: 2 }], sampling: 'continuous' });
  assert.deepEqual(at(continuous.output, continuous.width, 6, 2), [0, 255, 0, 255]);
  assert.deepEqual(at(continuous.output, continuous.width, 5, 2), [220, 20, 20, 255]);
  // Color mode keeps each pixel's luminosity (opacity blends towards it).
  const color = replace({ mode: 'color' });
  const [r, g, b] = at(color.output, color.width, 3, 2);
  assert.ok(g > r && g > b && g < 200, `${r},${g},${b}`);
});

// ----------------------------------------------------------------- gradient

test('Angle sweeps a full turn around the start; Diamond grows as |u| + |v|', () => {
  const start = { x: 10, y: 10 }, end = { x: 20, y: 10 };
  assert.ok(gradientShapeT('angle', 15, 9.5, start, end) < 0.02);
  assert.ok(Math.abs(gradientShapeT('angle', 9.5, 4, start, end) - 0.25) < 0.02, 'up is a quarter turn');
  assert.ok(Math.abs(gradientShapeT('angle', 4, 9.5, start, end) - 0.5) < 0.02);
  assert.ok(Math.abs(gradientShapeT('diamond', 14.5, 9.5, start, end) - 0.5) < 1e-9);
  assert.ok(Math.abs(gradientShapeT('diamond', 12.5, 11.5, start, end) - 0.5) < 1e-9);
  assert.equal(gradientShapeT('diamond', 40, 40, start, end), 1);
});

test('shaped gradients map through the shared colour stops and fail closed', () => {
  const lookup = new Uint8ClampedArray(GRADIENT_LOOKUP_SIZE * 4);
  for (let index = 0; index < GRADIENT_LOOKUP_SIZE; index += 1) lookup.set([index, 0, 255 - index, 255], index * 4);
  const pixels = renderGradientShape('diamond', 21, 21, { x: 10.5, y: 10.5 }, { x: 20.5, y: 10.5 }, lookup);
  assert.deepEqual(at(pixels, 21, 10, 10), [0, 0, 255, 255]);
  assert.deepEqual(at(pixels, 21, 0, 0), [255, 0, 0, 255]);
  assert.throws(() => renderGradientShape('spiral', 2, 2, { x: 0, y: 0 }, { x: 1, y: 0 }, lookup), /type is invalid/);
  assert.throws(() => renderGradientShape('angle', 2, 2, { x: 0, y: 0 }, { x: 1, y: 0 }, new Uint8ClampedArray(4)), /lookup/);
  const stops = buildGradientColorStops({ mode: 'angle', color: '#ff0000', backgroundColor: '#ffffff', end: 'background', reverse: false, midpoint: 'none', midpointPosition: 50 });
  assert.deepEqual(stops, [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#ffffff' }]);
});

// ------------------------------------------------------------ history brush

test('History Brush source labels name each step from the frame difference', () => {
  const layer = { id: 'a', name: 'Background', asset: 'one', matrix: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true };
  const open = { w: 10, h: 10, active: 'a', layers: [layer] };
  const painted = { ...open, layers: [{ ...layer, asset: 'two' }] };
  const healed = { ...painted, layers: [{ ...painted.layers[0], spotHealing: [{}] }] };
  const added = { ...healed, active: 'b', layers: [...healed.layers, { ...layer, id: 'b', name: 'Layer 2' }] };
  const selected = { ...added, selection: { shape: 'rectangle' } };
  assert.equal(describeHistoryStep(undefined, open), 'Opening state');
  assert.equal(describeHistoryStep(open, painted), 'Pixel edit');
  assert.equal(describeHistoryStep(painted, healed), 'Spot Healing');
  assert.equal(describeHistoryStep(healed, added), 'New layer');
  assert.equal(describeHistoryStep(added, selected), 'Selection');
  assert.equal(describeHistoryStep(selected, { ...selected, selection: undefined }), 'Deselect');
  assert.equal(describeHistoryStep(open, { ...open, w: 20 }), 'Canvas size');
  assert.equal(describeHistoryStep(open, { ...open }), 'Edit');
  assert.deepEqual(historySourceLabels([open, painted, added]), [
    '1. Opening state · Background',
    '2. Pixel edit · Background',
    '3. New layer · Layer 2',
  ]);
});
