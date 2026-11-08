import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_BLEND_DEFAULT,
  BRUSH_BLEND_MODES,
  BRUSH_BLEND_MODE_GROUPS,
  brushBlendModeLabel,
  brushToolUsesBlendMode,
  compositeBrushBlendLayer,
  compositeBrushBlendRect,
  normalizeBrushBlendMode,
  usesBrushBlendStroke,
  validBrushBlendMode,
} from '../src/brushBlend.ts';
import { LAYER_BLEND_MODES, NATIVE_CANVAS_BLEND_MODES } from '../src/blendModes.ts';
import { applyRadialStamp } from '../src/brush.ts';
import { mixRectByMask } from '../src/selectionClip.ts';
import {
  BUILT_IN_BRUSH_PRESETS,
  builtInBrushPresetById,
  mergeBrushPresetLibraries,
  parseBrushPresetLibrary,
  serializeBrushPresetLibrary,
} from '../src/brushPresetLibrary.ts';
import { createCustomBrushPreset, normalizeCustomBrushPresets, validCustomBrushPreset } from '../src/customBrushPresets.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const filled = (width, height, rgba) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return data;
};
const pixel = (data, width, x, y) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
const stamp = (target, width, height, x, y, options = {}) =>
  applyRadialStamp(target, {
    width, height, x, y, size: 10, hardness: 100, opacity: 1, mode: 'source-over', color: [128, 128, 128, 255], ...options,
  });

test('the Mode list is Normal plus the Canvas-native blend modes, grouped like the Fill dialog', () => {
  assert.equal(BRUSH_BLEND_DEFAULT, 'source-over');
  assert.equal(BRUSH_BLEND_MODES[0], 'source-over');
  assert.deepEqual(new Set(BRUSH_BLEND_MODES), new Set(NATIVE_CANVAS_BLEND_MODES));
  assert.equal(BRUSH_BLEND_MODES.length, NATIVE_CANVAS_BLEND_MODES.size);
  // Menu order follows the shared layer blend list.
  const order = BRUSH_BLEND_MODES.map((mode) => LAYER_BLEND_MODES.indexOf(mode));
  assert.ok(order.every((value) => value >= 0));
  for (const mode of ['linear-burn', 'linear-dodge', 'vivid-light', 'hard-mix', 'subtract', 'divide', 'darker-color'])
    assert.equal(BRUSH_BLEND_MODES.includes(mode), false, mode);
  assert.deepEqual(BRUSH_BLEND_MODE_GROUPS.map((group) => group.label), ['Normal', 'Darken', 'Lighten', 'Contrast', 'Inversion', 'Component']);
  assert.ok(BRUSH_BLEND_MODE_GROUPS.every((group) => group.modes.length > 0));
  assert.deepEqual(BRUSH_BLEND_MODE_GROUPS.flatMap((group) => group.modes.map((mode) => mode.value)), [...BRUSH_BLEND_MODES]);
  assert.equal(brushBlendModeLabel('source-over'), 'Normal');
  assert.equal(brushBlendModeLabel('multiply'), 'Multiply');
  assert.equal(brushBlendModeLabel('soft-light'), 'Soft Light');
  assert.ok(Object.isFrozen(BRUSH_BLEND_MODES));
});

test('validation rejects unknown, non-native and non-string modes; normalization falls back to Normal', () => {
  for (const mode of BRUSH_BLEND_MODES) {
    assert.equal(validBrushBlendMode(mode), true, mode);
    assert.equal(normalizeBrushBlendMode(mode), mode);
  }
  for (const bad of ['normal', 'Multiply', 'linear-burn', 'destination-out', 'destination-over', 'clear', 'copy', '', ' multiply', 7, null, undefined, {}, ['multiply']]) {
    assert.equal(validBrushBlendMode(bad), false, JSON.stringify(bad));
    assert.equal(normalizeBrushBlendMode(bad), 'source-over');
  }
});

test('only Brush and Pencil use a separate stroke buffer, and only for non-Normal modes', () => {
  assert.equal(brushToolUsesBlendMode('brush'), true);
  assert.equal(brushToolUsesBlendMode('pencil'), true);
  for (const tool of ['eraser', 'clone', 'heal', 'smudge', 'mixer-brush', 'history-brush', 'pattern-stamp'])
    assert.equal(brushToolUsesBlendMode(tool), false, tool);
  assert.equal(usesBrushBlendStroke('brush', 'source-over'), false);
  assert.equal(usesBrushBlendStroke('pencil', undefined), false);
  assert.equal(usesBrushBlendStroke('brush', 'bogus'), false);
  assert.equal(usesBrushBlendStroke('brush', 'multiply'), true);
  assert.equal(usesBrushBlendStroke('pencil', 'screen'), true);
  assert.equal(usesBrushBlendStroke('eraser', 'multiply'), false);
});

test('overlapping dabs of one Multiply stroke do not multiply against each other', () => {
  const width = 40, height = 20;
  const original = filled(width, height, [255, 255, 255, 255]);
  const stroke = new Uint8ClampedArray(width * height * 4);
  // Two overlapping 100% dabs on the transparent stroke buffer.
  stamp(stroke, width, height, 15, 10);
  stamp(stroke, width, height, 19, 10);
  const result = compositeBrushBlendLayer(original, stroke, width, 'multiply');
  // Overlap: one coat of 50% grey multiplied over white, not grey × grey.
  assert.deepEqual(pixel(result, width, 17, 10), [128, 128, 128, 255]);
  assert.deepEqual(pixel(result, width, 13, 10), [128, 128, 128, 255]);
  assert.deepEqual(pixel(result, width, 35, 10), [255, 255, 255, 255]);
  // Naive per-dab compositing onto the layer would compound to ~64.
  const naive = filled(width, height, [255, 255, 255, 255]);
  for (const x of [15, 19]) {
    const dab = new Uint8ClampedArray(width * height * 4);
    stamp(dab, width, height, x, 10);
    naive.set(compositeBrushBlendLayer(naive, dab, width, 'multiply'));
  }
  assert.ok(pixel(naive, width, 17, 10)[0] <= 65);
});

test('flow builds stroke coverage like Normal before the mode is applied once', () => {
  const width = 30, height = 20;
  const original = filled(width, height, [200, 100, 50, 255]);
  const stroke = new Uint8ClampedArray(width * height * 4);
  stamp(stroke, width, height, 12, 10, { opacity: 0.5, color: [0, 0, 0, 255] });
  stamp(stroke, width, height, 16, 10, { opacity: 0.5, color: [0, 0, 0, 255] });
  // ~0.5 + 0.5 × 0.5 ≈ 0.75 coverage where the two dabs overlap.
  assert.equal(pixel(stroke, width, 14, 10)[3], 192);
  assert.equal(pixel(stroke, width, 9, 10)[3], 128);
  const darkened = compositeBrushBlendLayer(original, stroke, width, 'darken');
  // Darken with black at coverage a: Cb × (1 - a).
  assert.deepEqual(pixel(darkened, width, 14, 10), [49, 25, 12, 255]);
  assert.deepEqual(pixel(darkened, width, 9, 10), [100, 50, 25, 255]);
});

test('mode arithmetic follows the shared W3C reference', () => {
  const width = 1, height = 1;
  const mid = filled(1, 1, [128, 64, 200, 255]);
  const paint = filled(1, 1, [128, 192, 32, 255]);
  const rect = { x: 0, y: 0, width, height };
  assert.deepEqual(Array.from(compositeBrushBlendRect(mid, paint, 1, rect, 'screen')), [192, 208, 207, 255]);
  assert.deepEqual(Array.from(compositeBrushBlendRect(mid, paint, 1, rect, 'darken')), [128, 64, 32, 255]);
  assert.deepEqual(Array.from(compositeBrushBlendRect(mid, paint, 1, rect, 'lighten')), [128, 192, 200, 255]);
  assert.deepEqual(Array.from(compositeBrushBlendRect(mid, paint, 1, rect, 'difference')), [0, 128, 168, 255]);
  assert.deepEqual(Array.from(compositeBrushBlendRect(mid, paint, 1, rect, 'source-over')), [128, 192, 32, 255]);
  // Every native mode produces an opaque, valid result over an opaque backdrop.
  for (const mode of BRUSH_BLEND_MODES) {
    const out = compositeBrushBlendRect(mid, paint, 1, rect, mode);
    assert.equal(out.length, 4);
    assert.equal(out[3], 255, mode);
  }
  // Luminosity keeps the backdrop's hue and takes the paint's luminance.
  const luminosity = compositeBrushBlendRect(filled(1, 1, [255, 0, 0, 255]), filled(1, 1, [255, 255, 255, 255]), 1, rect, 'luminosity');
  assert.deepEqual(Array.from(luminosity), [255, 255, 255, 255]);
});

test('over transparent pixels the stroke paints as Normal, and untouched pixels keep their bytes', () => {
  const width = 4;
  // Transparent pixels with hidden RGB, plus one opaque pixel.
  const original = new Uint8ClampedArray([9, 8, 7, 0, 9, 8, 7, 0, 10, 20, 30, 255, 1, 2, 3, 4]);
  const stroke = new Uint8ClampedArray([200, 100, 50, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const out = compositeBrushBlendLayer(original, stroke, width, 'multiply');
  assert.deepEqual(Array.from(out.subarray(0, 4)), [200, 100, 50, 255]);
  assert.deepEqual(Array.from(out.subarray(4)), Array.from(original.subarray(4)));
  // Inputs are never mutated.
  assert.deepEqual(Array.from(original.subarray(0, 4)), [9, 8, 7, 0]);
});

test('a rectangle composite matches the same pixels of the whole-layer composite and is idempotent', () => {
  const width = 24, height = 16;
  const original = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < original.length; index += 1) original[index] = (index * 37 + 11) % 256;
  const stroke = new Uint8ClampedArray(width * height * 4);
  stamp(stroke, width, height, 8, 8, { size: 9, hardness: 40, opacity: 0.8, color: [20, 200, 90, 255] });
  stamp(stroke, width, height, 14, 7, { size: 7, hardness: 0, opacity: 0.6, color: [240, 30, 10, 255] });
  for (const mode of ['multiply', 'screen', 'overlay', 'color', 'hard-light']) {
    const whole = compositeBrushBlendLayer(original, stroke, width, mode);
    const rect = { x: 3, y: 2, width: 15, height: 11 };
    const strokeRect = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (let row = 0; row < rect.height; row += 1) {
      const start = ((rect.y + row) * width + rect.x) * 4;
      strokeRect.set(stroke.subarray(start, start + rect.width * 4), row * rect.width * 4);
    }
    const first = compositeBrushBlendRect(original, strokeRect, width, rect, mode);
    const second = compositeBrushBlendRect(original, strokeRect, width, rect, mode);
    // Recompositing an overlapping segment rectangle from the stroke-start
    // pixels never compounds the mode.
    assert.deepEqual(first, second, mode);
    for (let row = 0; row < rect.height; row += 1)
      for (let column = 0; column < rect.width; column += 1)
        assert.deepEqual(
          Array.from(first.subarray((row * rect.width + column) * 4, (row * rect.width + column) * 4 + 4)),
          pixel(whole, width, rect.x + column, rect.y + row),
          `${mode} ${column},${row}`,
        );
  }
});

test('selection coverage mixes the blended rectangle back over the stroke-start pixels', () => {
  const width = 6, height = 2;
  const original = filled(width, height, [240, 240, 240, 255]);
  const stroke = filled(width, height, [0, 0, 0, 255]);
  const mask = new Uint8ClampedArray(width * height);
  mask.fill(255, 0, 2);
  mask.fill(128, 2, 4);
  const rect = { x: 0, y: 0, width, height: 1 };
  const strokeRect = stroke.slice(0, width * 4);
  const out = compositeBrushBlendRect(original, strokeRect, width, rect, 'multiply', mask);
  assert.deepEqual(Array.from(out.subarray(0, 4)), [0, 0, 0, 255]);
  assert.deepEqual(Array.from(out.subarray(16, 20)), [240, 240, 240, 255]);
  const partial = out[8];
  assert.ok(partial > 100 && partial < 140, String(partial));
  const unmasked = compositeBrushBlendRect(original, strokeRect, width, rect, 'multiply');
  assert.deepEqual(out, mixRectByMask(original, unmasked, mask, width, rect));
});

test('composite validation rejects mismatched buffers, bad rectangles and unknown modes', () => {
  const width = 4, height = 4;
  const original = new Uint8ClampedArray(width * height * 4);
  const rect = { x: 1, y: 1, width: 2, height: 2 };
  const stroke = new Uint8ClampedArray(2 * 2 * 4);
  assert.equal(compositeBrushBlendRect(original, stroke, width, rect, 'screen').length, 16);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, rect, 'linear-burn'), /mode is invalid/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, rect, 'bogus'), /mode is invalid/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, { x: 3, y: 1, width: 2, height: 2 }, 'screen'), /does not match/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, { x: -1, y: 0, width: 2, height: 2 }, 'screen'), /does not match/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, { x: 0.5, y: 0, width: 2, height: 2 }, 'screen'), /does not match/);
  assert.throws(() => compositeBrushBlendRect(original, new Uint8ClampedArray(12), width, rect, 'screen'), /does not match/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, 3, rect, 'screen'), /does not match/);
  assert.throws(() => compositeBrushBlendRect(original, stroke, width, rect, 'screen', new Uint8ClampedArray(5)), /does not match/);
  assert.throws(() => compositeBrushBlendLayer(original, new Uint8ClampedArray(8), width, 'screen'), /does not match/);
});

const values = {
  size: 30, hardness: 50, spacing: 25, angle: 0, roundness: 100, flipX: false, flipY: false,
  pressureSize: false, pressureOpacity: false, pressureCurve: 'linear', brushSmoothing: 0, brushScatter: 0,
  brushTexture: 0, brushDual: 0, secondaryBrushPreset: 'none', brushBristle: 0, brushWetEdges: 0,
  brushBuildUp: 0, brushFlow: 100,
};
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('saved presets store a valid mode, reject unknown modes and old presets load as Normal', () => {
  const multiply = createCustomBrushPreset(id(1), 'Shade', { ...values, brushBlendMode: 'multiply' });
  assert.equal(multiply.brushBlendMode, 'multiply');
  for (const mode of BRUSH_BLEND_MODES)
    assert.equal(validCustomBrushPreset({ ...multiply, brushBlendMode: mode }), true, mode);
  for (const bad of ['linear-burn', 'normal', 'destination-out', 3, null, ''])
    assert.equal(validCustomBrushPreset({ ...multiply, brushBlendMode: bad }), false, String(bad));
  assert.throws(() => createCustomBrushPreset(id(2), 'Bad', { ...values, brushBlendMode: 'bogus' }), /invalid/);
  const legacy = createCustomBrushPreset(id(3), 'Legacy', values);
  assert.equal('brushBlendMode' in legacy, false);
  assert.equal(normalizeBrushBlendMode(legacy.brushBlendMode), 'source-over');
  // Malformed entries are dropped, valid ones keep their mode.
  const normalized = normalizeCustomBrushPresets([multiply, { ...multiply, id: id(4), brushBlendMode: 'bogus' }, legacy]);
  assert.deepEqual(normalized.map((item) => item.id), [id(1), id(3)]);
  assert.equal(normalized[0].brushBlendMode, 'multiply');
});

test('the device library round-trips the mode and drops presets with an unknown mode', () => {
  const screen = createCustomBrushPreset(id(5), 'Glow', { ...values, brushBlendMode: 'screen' });
  const legacy = createCustomBrushPreset(id(6), 'Old', values);
  const parsed = parseBrushPresetLibrary(serializeBrushPresetLibrary([screen, legacy]));
  assert.equal(parsed.find((item) => item.id === id(5)).brushBlendMode, 'screen');
  assert.equal(parsed.find((item) => item.id === id(6)).brushBlendMode, undefined);
  const corrupt = JSON.stringify({ version: 1, presets: [{ ...screen, brushBlendMode: 'plus-lighter' }, legacy] });
  assert.deepEqual(parseBrushPresetLibrary(corrupt).map((item) => item.id), [id(6)]);
  assert.deepEqual(mergeBrushPresetLibraries([screen], [{ ...screen, id: id(7), brushBlendMode: 7 }]).map((item) => item.id), [id(5)]);
});

test('built-in presets store a mode: Soft glow uses Screen, the rest Normal', () => {
  for (const preset of BUILT_IN_BRUSH_PRESETS) assert.equal(validBrushBlendMode(preset.brushBlendMode), true, preset.label);
  assert.equal(builtInBrushPresetById('builtin-soft-glow').brushBlendMode, 'screen');
  for (const presetId of ['builtin-star-field', 'builtin-dust-nebula', 'builtin-smoke-wisp'])
    assert.equal(builtInBrushPresetById(presetId).brushBlendMode, 'source-over');
});

test('drafts and projects carry the brush mode; unknown modes fail validation and old drafts omit it', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const assetId = '11111111-1111-4111-8111-111111111111';
  const draft = (settings) => ({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Brush mode fixture',
    index: 0,
    settings: { tool: 'brush', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral, ...settings },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: '22222222-2222-4222-8222-222222222222',
      layers: [{
        id: '22222222-2222-4222-8222-222222222222', name: 'Background', visible: true, locked: false,
        opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      }],
    }],
  });
  assert.equal(validateDraft(draft({})).settings.brushBlendMode, undefined);
  assert.equal(validateDraft(draft({ brushBlendMode: 'overlay' })).settings.brushBlendMode, 'overlay');
  for (const bad of ['linear-dodge', 'bogus', 1])
    assert.throws(() => validateDraft(draft({ brushBlendMode: bad })), /not supported/);
  const preset = createCustomBrushPreset(id(8), 'Shade', { ...values, brushBlendMode: 'color-burn' });
  assert.equal(validateDraft(draft({ customBrushPresets: [preset] })).settings.customBrushPresets[0].brushBlendMode, 'color-burn');
  assert.throws(() => validateDraft(draft({ customBrushPresets: [{ ...preset, brushBlendMode: 'bogus' }] })), /not supported/);
});
