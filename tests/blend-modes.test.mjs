import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLEND_MODE_GROUPS,
  LAYER_BLEND_MODES,
  NATIVE_CANVAS_BLEND_MODES,
  blendChannel,
  blendColorAt,
  blendModeLabel,
  blendPixelsInPlace,
  blendRgb,
  isNativeCanvasBlendMode,
  validBlendMode,
} from '../src/blendModes.ts';
import { compositeGroupPixels, GROUP_BLEND_MODES } from '../src/groupCompositing.ts';
import { BLENDS, neutral, validateFrame } from '../src/document.ts';

const close = (actual, expected, tolerance = 1e-9, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} ${actual} != ${expected}`);

// Independent reference formulas written out longhand (W3C Compositing and
// Blending Level 1 for the Canvas-native modes; common editor formulas for
// the software modes) so a regression in the shared helpers is caught.
const reference = {
  'source-over': (b, s) => s,
  darken: (b, s) => Math.min(b, s),
  multiply: (b, s) => b * s,
  'color-burn': (b, s) => (b === 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'linear-burn': (b, s) => Math.max(0, b + s - 1),
  lighten: (b, s) => Math.max(b, s),
  screen: (b, s) => 1 - (1 - b) * (1 - s),
  'color-dodge': (b, s) => (b === 0 ? 0 : s === 1 ? 1 : Math.min(1, b / (1 - s))),
  'linear-dodge': (b, s) => Math.min(1, b + s),
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  'hard-light': (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  'vivid-light': (b, s) => {
    if (s <= 0.5) {
      const s2 = 2 * s;
      return b === 1 ? 1 : s2 === 0 ? 0 : 1 - Math.min(1, (1 - b) / s2);
    }
    const s2 = 2 * s - 1;
    return b === 0 ? 0 : s2 === 1 ? 1 : Math.min(1, b / (1 - s2));
  },
  'linear-light': (b, s) => Math.max(0, Math.min(1, b + 2 * s - 1)),
  'pin-light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'hard-mix': (b, s) => (b + s >= 1 ? 1 : 0),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  subtract: (b, s) => Math.max(0, b - s),
  divide: (b, s) => (s === 0 ? (b === 0 ? 0 : 1) : Math.min(1, b / s)),
};

const samples = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];

test('every separable blend mode matches its reference formula across the channel range', () => {
  for (const [mode, formula] of Object.entries(reference))
    for (const b of samples)
      for (const s of samples)
        close(blendChannel(mode, b, s), formula(b, s), 1e-9, `${mode}(${b}, ${s})`);
});

test('mode catalogue is grouped, labelled like common editors and split native/software', () => {
  assert.equal(LAYER_BLEND_MODES.length, 26);
  assert.deepEqual(GROUP_BLEND_MODES, LAYER_BLEND_MODES);
  assert.deepEqual(BLENDS, LAYER_BLEND_MODES);
  const grouped = BLEND_MODE_GROUPS.flatMap((group) => group.modes.map((mode) => mode.value));
  assert.deepEqual([...grouped].sort(), [...LAYER_BLEND_MODES].sort());
  assert.equal(blendModeLabel('source-over'), 'Normal');
  assert.equal(blendModeLabel('linear-dodge'), 'Linear Dodge (Add)');
  assert.equal(blendModeLabel('color-dodge'), 'Color Dodge');
  assert.equal(blendModeLabel('luminosity'), 'Luminosity');
  for (const mode of ['color-dodge', 'color-burn', 'soft-light', 'hard-light', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'])
    assert.equal(isNativeCanvasBlendMode(mode), true, mode);
  // `lighter` adds premultiplied alpha as well as colour, so Linear Dodge is
  // deliberately software to keep W3C source-over coverage semantics.
  for (const mode of ['linear-dodge', 'linear-burn', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'subtract', 'divide', 'darker-color', 'lighter-color'])
    assert.equal(isNativeCanvasBlendMode(mode), false, mode);
  assert.equal(NATIVE_CANVAS_BLEND_MODES.has('lighter'), false);
  assert.equal(validBlendMode('lighter'), false);
  assert.equal(validBlendMode('normal'), false);
  assert.equal(validBlendMode(undefined), false);
  assert.equal(validBlendMode('vivid-light'), true);
});

test('non-separable modes follow the W3C SetLum/SetSat definitions', () => {
  const out = [0, 0, 0];
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const backdrop = [0.2, 0.4, 0.8], source = [0.9, 0.3, 0.1];
  // Color keeps the backdrop luminosity with the source hue/saturation.
  blendRgb('color', ...backdrop, ...source, out);
  close(lum(out), lum(backdrop), 1e-9, 'color luminosity');
  assert.ok(out[0] > out[1] && out[1] > out[2], 'color keeps the source hue order');
  // Luminosity keeps the backdrop hue with the source luminosity.
  blendRgb('luminosity', ...backdrop, ...source, out);
  close(lum(out), lum(source), 1e-9, 'luminosity');
  assert.ok(out[2] > out[1] && out[1] > out[0], 'luminosity keeps the backdrop hue order');
  // Saturation of a grey source removes the backdrop's saturation.
  blendRgb('saturation', ...backdrop, 0.5, 0.5, 0.5, out);
  close(out[0], out[1], 1e-9);
  close(out[1], out[2], 1e-9);
  close(out[0], lum(backdrop), 1e-9);
  // Hue on a grey backdrop leaves it grey (no saturation to transfer).
  blendRgb('hue', 0.5, 0.5, 0.5, ...source, out);
  assert.deepEqual(out.map((v) => Math.round(v * 1e6)), [500000, 500000, 500000]);
  blendRgb('darker-color', ...backdrop, ...source, out);
  assert.deepEqual(out, source.reduce((a, b) => a + b) < backdrop.reduce((a, b) => a + b) ? source : backdrop);
  blendRgb('lighter-color', ...backdrop, ...source, out);
  assert.deepEqual(out, backdrop);
});

test('software compositing uses the W3C source-over equation, opacity once and keeps hidden RGB', () => {
  const backdrop = new Uint8ClampedArray([200, 100, 50, 255, 11, 22, 33, 0, 40, 80, 120, 128]);
  const source = new Uint8ClampedArray([100, 150, 200, 255, 9, 9, 9, 0, 200, 100, 50, 255]);
  const before = backdrop.slice();
  blendPixelsInPlace(backdrop, source, 1, 'linear-dodge');
  assert.deepEqual(Array.from(backdrop.slice(0, 4)), [255, 250, 250, 255]);
  // A fully transparent source leaves hidden RGB untouched.
  assert.deepEqual(Array.from(backdrop.slice(4, 8)), Array.from(before.slice(4, 8)));
  // Partial backdrop alpha: Cs' = (1 - ab) Cs + ab B(Cb, Cs).
  const ab = 128 / 255, expected = [
    (1 - ab) * (200 / 255) + ab * Math.min(1, 40 / 255 + 200 / 255),
    (1 - ab) * (100 / 255) + ab * Math.min(1, 80 / 255 + 100 / 255),
    (1 - ab) * (50 / 255) + ab * Math.min(1, 120 / 255 + 50 / 255),
  ].map((value) => Math.round(value * 255));
  assert.deepEqual(Array.from(backdrop.slice(8, 12)), [...expected, 255]);

  const half = new Uint8ClampedArray([200, 100, 50, 255]);
  blendPixelsInPlace(half, new Uint8ClampedArray([100, 150, 200, 255]), 0.5, 'linear-burn');
  const mix = (b, s) => Math.round((0.5 * Math.max(0, b / 255 + s / 255 - 1) + 0.5 * (b / 255)) * 255);
  assert.deepEqual([...half], [mix(200, 100), mix(100, 150), mix(50, 200), 255]);

  const unchanged = new Uint8ClampedArray([1, 2, 3, 4]);
  blendPixelsInPlace(unchanged, new Uint8ClampedArray([255, 255, 255, 255]), 0, 'divide');
  assert.deepEqual([...unchanged], [1, 2, 3, 4]);
});

test('group compositing reference accepts every mode and matches the in-place helper', () => {
  const background = new Uint8ClampedArray([200, 100, 50, 255, 30, 60, 90, 200]);
  const group = new Uint8ClampedArray([100, 150, 200, 255, 250, 20, 140, 100]);
  for (const mode of LAYER_BLEND_MODES) {
    const expected = background.slice();
    blendPixelsInPlace(expected, group, 0.7, mode);
    assert.deepEqual(compositeGroupPixels(background, group, 2, 1, 0.7, mode), expected, mode);
  }
  assert.throws(() => compositeGroupPixels(background, group, 2, 1, 1, 'lighter'), /blend mode/);
});

test('blendColorAt over a transparent backdrop is Normal for every mode', () => {
  for (const mode of LAYER_BLEND_MODES) {
    const target = new Uint8ClampedArray([7, 8, 9, 0]);
    blendColorAt(target, 0, 255, 128, 0, 128, mode, [0, 0, 0]);
    assert.deepEqual([...target], [255, 128, 0, 128], mode);
  }
  const target = new Uint8ClampedArray([100, 100, 100, 255]);
  blendColorAt(target, 0, 100, 100, 100, 255, 'screen', [0, 0, 0]);
  const screened = Math.round((1 - (1 - 100 / 255) ** 2) * 255);
  assert.deepEqual([...target], [screened, screened, screened, 255]);
});

const SHAPE = '00000000-0000-4000-8000-000000000001';
const FOLDER = '00000000-0000-4000-8000-000000000002';
const rectangle = (patch = {}) => ({
  id: SHAPE,
  name: 'Shape',
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: structuredClone(neutral),
  kind: 'rectangle',
  width: 2,
  height: 2,
  color: '#ff0000',
  stroke: 1,
  fill: true,
  ...patch,
});

test('document validation accepts every new layer/folder mode and legacy documents', () => {
  for (const blend of LAYER_BLEND_MODES)
    assert.doesNotThrow(() => validateFrame({
      w: 4,
      h: 4,
      layers: [rectangle({ blend, groupId: FOLDER })],
      groups: [{ id: FOLDER, name: 'Folder', visible: true, locked: false, opacity: 1, blend, collapsed: false }],
      active: SHAPE,
    }, {}), blend);
  // A pre-change document: legacy seven-mode blend and no glow styles.
  assert.doesNotThrow(() => validateFrame({
    w: 4,
    h: 4,
    layers: [rectangle({
      blend: 'difference',
      styles: {
        dropShadow: { enabled: true, color: '#000000', opacity: 0.5, offsetX: 8, offsetY: 8, blur: 12 },
        outline: { enabled: false, color: '#ffffff', opacity: 1, width: 2 },
      },
    })],
    active: SHAPE,
  }, {}));
  for (const blend of ['lighter', 'normal', 'add', '', 7])
    assert.throws(() => validateFrame({ w: 4, h: 4, layers: [rectangle({ blend })], active: SHAPE }, {}), /Invalid layer document/);
});

test('gradient tool blend formulas agree with the shared layer catalogue for every shared mode', async () => {
  const { GRADIENT_BLEND_MODES, blendGradientChannel } = await import('../src/gradientBlend.ts');
  const shared = GRADIENT_BLEND_MODES.filter((mode) => validBlendMode(mode));
  assert.ok(shared.length >= 12, shared.join(','));
  for (const mode of GRADIENT_BLEND_MODES)
    if (mode !== 'normal' && mode !== 'replace') assert.equal(validBlendMode(mode), true, mode);
  for (const mode of shared)
    for (const b of samples)
      for (const s of samples)
        close(blendGradientChannel(mode, b, s), blendChannel(mode, b, s), 1e-9, `${mode}(${b}, ${s})`);
});
