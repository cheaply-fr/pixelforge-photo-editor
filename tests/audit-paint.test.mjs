import test from 'node:test';
import assert from 'node:assert/strict';
import { removeRedEye } from '../src/redEye.ts';
import {
  DEFAULT_MIXER_BRUSH,
  applyMixerBrushPixels,
  applySymmetricRetouchBrush,
  mixerBrushDeposit,
  mixerBrushPickup,
} from '../src/mixerHistoryBrush.ts';
import {
  BRUSH_STRANDS_THICKNESS_MAX,
  BRUSH_STRANDS_THICKNESS_MIN,
  DEFAULT_BRUSH_STRANDS,
  buildStrands,
  normalizeBrushStrands,
  smoothStrandPath,
  strandPathOptions,
  validBrushStrands,
} from '../src/brushStrands.ts';
import { BUILT_IN_BRUSH_PRESETS } from '../src/brushPresetLibrary.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { commonLayer, isBackgroundLayer, layerFromBackground, neutral, validateFrame } from '../src/document.ts';

const solid = (w, h, rgba) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set(rgba, i * 4);
  return data;
};
const px = (data, w, x, y) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

test('Red Eye neutralises pure red toward (green + blue) / 2 and leaves other pixels', () => {
  const w = 21, h = 21, source = solid(w, h, [40, 90, 120, 255]);
  for (let y = 8; y <= 12; y += 1) for (let x = 0; x < w; x += 1) source.set([255, 0, 0, 255], (y * w + x) * 4);
  const before = new Uint8ClampedArray(source),
    result = removeRedEye(source, { width: w, height: h, x: 10, y: 10, radius: 20, threshold: 36, amount: 1 });
  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(source), Array.from(before), 'input is never mutated: callers must write result.pixels back');
  assert.deepEqual(px(result.pixels, w, 10, 10), [0, 0, 0, 255]);
  assert.deepEqual(px(result.pixels, w, 10, 2), [40, 90, 120, 255], 'non-red pixels are untouched');
  const none = removeRedEye(solid(w, h, [40, 90, 120, 255]), { width: w, height: h, x: 10, y: 10, radius: 8 });
  assert.equal(none.changed, false, 'no red-eye pixels → unchanged (the editor adds no history step)');
});

test('Mixer Brush carries paint along a stroke over an unchanged snapshot (B-10)', () => {
  const w = 60, h = 12, image = solid(w, h, [60, 120, 220, 255]);
  for (let y = 0; y < h; y += 1) for (let x = 30; x < w; x += 1) image.set([220, 130, 60, 255], (y * w + x) * 4);
  const points = Array.from({ length: 13 }, (_, i) => ({ x: 14 + i * 3, y: 6 })),
    settings = { ...DEFAULT_MIXER_BRUSH, size: 8, hardness: 80 },
    output = applyMixerBrushPixels(image, image, w, h, points, settings);
  // The snapshot and the destination are the same pixels (as in the editor):
  // the old per-pixel self-mix changed nothing.
  const sun = px(output, w, 40, 6);
  assert.ok(sun[2] > 60 + 10, `sky blue carried into the sun: ${sun.join(",")}`);
  assert.ok(sun[0] < 220, `sun red reduced: ${sun.join(",")}`);
  assert.deepEqual(px(output, w, 40, 0), [220, 130, 60, 255], 'outside the brush is untouched');
});

test('Mixer Brush keeps its reservoir across calls of one stroke and paints nothing on an empty layer', () => {
  const w = 60, h = 12, image = solid(w, h, [60, 120, 220, 255]);
  for (let y = 0; y < h; y += 1) for (let x = 30; x < w; x += 1) image.set([220, 130, 60, 255], (y * w + x) * 4);
  const settings = { ...DEFAULT_MIXER_BRUSH, size: 8, hardness: 80 },
    points = Array.from({ length: 13 }, (_, i) => ({ x: 14 + i * 3, y: 6 })),
    whole = applyMixerBrushPixels(image, image, w, h, points, settings),
    state = {},
    first = applyMixerBrushPixels(image, image, w, h, points.slice(0, 6), settings, undefined, state),
    split = applyMixerBrushPixels(first, image, w, h, points.slice(6), settings, undefined, state);
  assert.deepEqual(Array.from(split), Array.from(whole), 'split pointer moves equal one call');
  const empty = solid(w, h, [0, 0, 0, 0]);
  assert.deepEqual(Array.from(applyMixerBrushPixels(empty, empty, w, h, points, settings)), Array.from(empty));
  assert.ok(mixerBrushDeposit(DEFAULT_MIXER_BRUSH) > 0 && mixerBrushPickup(DEFAULT_MIXER_BRUSH) > 0);
  const symmetric = applySymmetricRetouchBrush('mixer-brush', image, image, w, h, points, settings, undefined, undefined, []);
  assert.deepEqual(Array.from(symmetric), Array.from(whole));
});

test('Silk strands: thickness is its own validated, persisted setting (I-21)', () => {
  assert.equal(DEFAULT_BRUSH_STRANDS.thickness, 2);
  assert.equal(normalizeBrushStrands({}).thickness, 2);
  assert.equal(normalizeBrushStrands({ thickness: 3.3 }).thickness, 3.5);
  assert.equal(normalizeBrushStrands({ thickness: 0 }).thickness, BRUSH_STRANDS_THICKNESS_MIN);
  assert.equal(normalizeBrushStrands({ thickness: 900 }).thickness, BRUSH_STRANDS_THICKNESS_MAX);
  assert.equal(validBrushStrands({ thickness: 4 }), true);
  assert.equal(validBrushStrands({ thickness: 0.2 }), false);
  assert.equal(validBrushStrands({ thickness: 101 }), false);
  assert.equal(validBrushStrands({ width: 120 }), true, 'older drafts with only a ribbon width stay valid');
});

test('Silk strands: Size is the ribbon width and strands keep their own thickness', () => {
  const points = Array.from({ length: 61 }, (_, i) => ({ x: 20 + i * 10, y: 400 })),
    // The editor passes the brush Size as the ribbon width.
    build = (size, thickness) => {
      const s = normalizeBrushStrands({ ...DEFAULT_BRUSH_STRANDS, enabled: true, width: size, thickness, wobble: 0 });
      return buildStrands(smoothStrandPath(points, strandPathOptions(s)), s, {});
    },
    spread = (strands) => {
      const ys = strands.flatMap((strand) => strand.vertices.map((v) => v.y));
      return Math.max(...ys) - Math.min(...ys);
    },
    maxWidth = (strands) => Math.max(...strands.flatMap((strand) => strand.vertices.map((v) => v.width)));
  const narrow = build(20, 2), wide = build(80, 2), thick = build(80, 6);
  assert.ok(spread(wide) > spread(narrow) * 3, 'Size spreads the strands across a wider ribbon');
  assert.ok(maxWidth(wide) <= 2 + 1e-9, 'Size 80 still paints 2 px strands, not 80 px blobs');
  assert.ok(maxWidth(thick) > 5 && maxWidth(thick) <= 6 + 1e-9);
  const silk = BUILT_IN_BRUSH_PRESETS.find((preset) => preset.id === 'builtin-silk-smoke');
  assert.equal(silk.size, 140);
  assert.equal(silk.brushStrands.thickness, 2);
});

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '11111111-1111-4111-8111-111111111111', layerId = '22222222-2222-4222-8222-222222222222';
const draft = (layer) => ({
  version: CURRENT_DRAFT_VERSION,
  localRevision: 1,
  name: 'Background fixture',
  index: 0,
  settings: { tool: 'move', zoom: 72, color: '#000000', size: 2, text: '', fontSize: 56, ...neutral },
  assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
  history: [{
    w: 1, h: 1, active: layerId,
    layers: [{
      id: layerId, name: 'Background', visible: true, locked: false,
      opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      ...layer,
    }],
  }],
});

test('Background flag: validated, legacy drafts stay ordinary, only the bottom raster layer counts (I-01)', () => {
  const legacy = validateDraft(draft({}));
  assert.equal(legacy.history[0].layers[0].background, undefined);
  assert.equal(isBackgroundLayer(legacy.history[0], legacy.history[0].layers[0]), false, 'old drafts keep current behaviour');
  const flagged = validateDraft(draft({ background: true }));
  assert.equal(isBackgroundLayer(flagged.history[0], flagged.history[0].layers[0]), true);
  assert.throws(() => validateDraft(draft({ background: false })));
  assert.throws(() => validateDraft(draft({ background: 'yes' })));
  const bottom = { ...commonLayer('Background'), kind: 'raster', asset: 'a', background: true },
    top = { ...commonLayer('Layer 1'), kind: 'raster', asset: 'b', background: true };
  assert.equal(isBackgroundLayer({ layers: [bottom, top] }, bottom), true);
  assert.equal(isBackgroundLayer({ layers: [bottom, top] }, top), false, 'a flagged layer above the bottom is ordinary');
  const converted = layerFromBackground(bottom);
  assert.equal('background' in converted, false);
  assert.equal(isBackgroundLayer({ layers: [converted] }, converted), false);
  const adjustment = { ...commonLayer('Levels'), kind: 'adjustment' },
    frameOf = (layer) => ({ w: 8, h: 8, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] });
  assert.doesNotThrow(() => validateFrame(frameOf(adjustment), {}));
  assert.throws(() => validateFrame(frameOf({ ...adjustment, background: true }), {}), 'only raster layers can be a Background');
});
