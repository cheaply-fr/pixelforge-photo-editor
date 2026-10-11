import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_ART_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  applyHistoryBrushPixels,
  applyArtHistoryBrushPixels,
  interpolateArtHistoryPoints,
  applyMixerBrushPixels,
  effectiveHistoryBrush,
  effectiveArtHistoryBrush,
  effectiveMixerBrush,
  validHistoryBrushSettings,
  validArtHistoryBrushSettings,
  validMixerBrushSettings,
} from '../src/mixerHistoryBrush.ts';

const pixels = (w, h, colour) => {
  const result = new Uint8ClampedArray(w * h * 4);
  for (let index = 0; index < w * h; index += 1) result.set(colour, index * 4);
  return result;
};

test('Mixer Brush validates bounded controls and resolves stable defaults', () => {
  assert.equal(validMixerBrushSettings(DEFAULT_MIXER_BRUSH), true);
  assert.equal(validHistoryBrushSettings(DEFAULT_HISTORY_BRUSH), true);
  assert.equal(validMixerBrushSettings({ ...DEFAULT_MIXER_BRUSH, wet: 101 }), false);
  assert.equal(validHistoryBrushSettings({ ...DEFAULT_HISTORY_BRUSH, opacity: -1 }), false);
  assert.equal(validArtHistoryBrushSettings(DEFAULT_ART_HISTORY_BRUSH), true);
  assert.equal(validArtHistoryBrushSettings({ ...DEFAULT_ART_HISTORY_BRUSH, style: 25 }), false);
  assert.equal(validArtHistoryBrushSettings({ ...DEFAULT_ART_HISTORY_BRUSH, fidelity: -1 }), false);
  assert.deepEqual(effectiveMixerBrush({ mix: 0 }).mix, 0);
  assert.deepEqual(effectiveHistoryBrush({ flow: 42 }).flow, 42);
  assert.deepEqual(effectiveArtHistoryBrush({ style: 99 }).style, 24);
});

test('Mixer Brush blends an immutable source with deterministic alpha handling', () => {
  const source = pixels(5, 5, [220, 40, 20, 255]);
  const destination = pixels(5, 5, [20, 40, 220, 255]);
  const originalSource = new Uint8ClampedArray(source);
  const output = applyMixerBrushPixels(destination, source, 5, 5, [{ x: 2, y: 2 }], {
    ...DEFAULT_MIXER_BRUSH,
    size: 3,
    hardness: 100,
    flow: 100,
    wet: 100,
    load: 100,
    mix: 100,
  });
  assert.deepEqual(Array.from(source), Array.from(originalSource));
  assert.deepEqual(Array.from(destination), Array.from(pixels(5, 5, [20, 40, 220, 255])));
  assert.deepEqual(Array.from(output.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [220, 40, 20, 255]);
  assert.deepEqual(Array.from(output.slice(0, 4)), [20, 40, 220, 255]);
});

test('History Brush restores a prior raster through a soft alpha mask', () => {
  const source = pixels(5, 5, [10, 220, 20, 255]);
  const destination = pixels(5, 5, [220, 20, 30, 255]);
  const output = applyHistoryBrushPixels(destination, source, 5, 5, [{ x: 2, y: 2 }], {
    ...DEFAULT_HISTORY_BRUSH,
    size: 3,
    hardness: 100,
    opacity: 50,
    flow: 100,
  });
  assert.deepEqual(Array.from(output.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [115, 120, 25, 255]);
  assert.deepEqual(Array.from(output.slice(0, 4)), [220, 20, 30, 255]);
});

test('source transparency does not erase opaque destination and selection alpha gates edits', () => {
  const source = pixels(3, 3, [0, 0, 0, 0]);
  const destination = pixels(3, 3, [80, 90, 100, 255]);
  const selection = new Uint8ClampedArray(9);
  selection[4] = 255;
  const output = applyHistoryBrushPixels(destination, source, 3, 3, [{ x: 1, y: 1 }], {
    ...DEFAULT_HISTORY_BRUSH,
    size: 3,
    hardness: 100,
    opacity: 100,
    flow: 100,
  }, selection);
  assert.deepEqual(Array.from(output), Array.from(destination));
});

test('invalid dimensions, pixels, and points fail closed', () => {
  const data = pixels(2, 2, [0, 0, 0, 255]);
  assert.throws(() => applyMixerBrushPixels(data, data, 0, 2, [], DEFAULT_MIXER_BRUSH), /dimensions/);
  assert.throws(() => applyMixerBrushPixels(data, new Uint8ClampedArray(1), 2, 2, [], DEFAULT_MIXER_BRUSH), /source pixels/);
  assert.throws(() => applyHistoryBrushPixels(data, data, 2, 2, [{ x: Number.NaN, y: 1 }], DEFAULT_HISTORY_BRUSH), /points/);
});

test('Art History Brush paints deterministic neighbourhood dabs without mutating source or destination', () => {
  const source = pixels(7, 7, [220, 40, 20, 255]);
  source.set([0, 0, 0, 0], (3 * 7 + 3) * 4);
  const destination = pixels(7, 7, [20, 40, 220, 255]);
  const sourceBefore = new Uint8ClampedArray(source);
  const destinationBefore = new Uint8ClampedArray(destination);
  const settings = { ...DEFAULT_ART_HISTORY_BRUSH, size: 5, hardness: 100, opacity: 100, flow: 100, style: 2, fidelity: 0 };
  const first = applyArtHistoryBrushPixels(destination, source, 7, 7, [{ x: 3, y: 3 }], settings);
  const second = applyArtHistoryBrushPixels(destination, source, 7, 7, [{ x: 3, y: 3 }], settings);
  assert.deepEqual(Array.from(first), Array.from(second));
  assert.deepEqual(Array.from(source), Array.from(sourceBefore));
  assert.deepEqual(Array.from(destination), Array.from(destinationBefore));
  const center = (3 * 7 + 3) * 4;
  if (first[center + 3] === 0) assert.deepEqual(Array.from(first.slice(center, center + 3)), [0, 0, 0]);
  assert.notDeepEqual(Array.from(first.slice((3 * 7 + 2) * 4, (3 * 7 + 2) * 4 + 4)), Array.from(destination.slice((3 * 7 + 2) * 4, (3 * 7 + 2) * 4 + 4)));
});

test('Art History Brush selection alpha gates edits and large dabs stay bounded', () => {
  const source = pixels(64, 64, [250, 10, 10, 255]);
  const destination = pixels(64, 64, [10, 10, 250, 255]);
  const selection = new Uint8ClampedArray(64 * 64);
  selection[32 * 64 + 32] = 255;
  const output = applyArtHistoryBrushPixels(destination, source, 64, 64, [{ x: 32, y: 32 }], {
    ...DEFAULT_ART_HISTORY_BRUSH,
    size: 10_000,
    hardness: 100,
    opacity: 100,
    flow: 100,
  }, selection);
  assert.deepEqual(Array.from(output.slice(0, 4)), Array.from(destination.slice(0, 4)));
  assert.notDeepEqual(Array.from(output.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4)), Array.from(destination.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4)));
  assert.throws(() => applyArtHistoryBrushPixels(destination, source, 64, 64, [{ x: 32, y: 32 }], DEFAULT_ART_HISTORY_BRUSH, new Uint8ClampedArray(1)), /selection mask/);
  const malformedMask = new Float32Array(64 * 64);
  malformedMask[0] = 300;
  assert.throws(() => applyArtHistoryBrushPixels(destination, source, 64, 64, [{ x: 32, y: 32 }], DEFAULT_ART_HISTORY_BRUSH, malformedMask), /selection mask/);
});

test('Art History Brush ignores hidden RGB in transparent historical pixels', () => {
  const source = pixels(3, 3, [200, 20, 20, 255]);
  source.set([255, 0, 255, 0], 4 * 4);
  const destination = pixels(3, 3, [20, 40, 220, 255]);
  const output = applyArtHistoryBrushPixels(destination, source, 3, 3, [{ x: 1, y: 1 }], {
    ...DEFAULT_ART_HISTORY_BRUSH,
    size: 1,
    hardness: 100,
    opacity: 100,
    flow: 100,
    fidelity: 0,
  });
  assert.deepEqual(Array.from(output.slice(4, 8)), [20, 40, 220, 255]);
});

test('Art History Brush interpolation fills fast pointer gaps deterministically', () => {
  const points = interpolateArtHistoryPoints({ x: 0, y: 4, pressure: 1 }, { x: 20, y: 4, pressure: 0.5 }, 5);
  assert.deepEqual(points.map(({ x, y }) => [x, y]), [[5, 4], [10, 4], [15, 4], [20, 4]]);
  assert.equal(points.at(-1)?.pressure, 0.5);
  assert.throws(() => interpolateArtHistoryPoints({ x: 0, y: 0 }, { x: 1, y: 1 }, 0), /interpolation/);
});

test('Art History Brush rejects a footprint that exceeds the explicit local work budget', () => {
  const width = 1_200, height = 1_200;
  const source = pixels(width, height, [250, 10, 10, 255]);
  const destination = pixels(width, height, [10, 10, 250, 255]);
  assert.throws(() => applyArtHistoryBrushPixels(destination, source, width, height, [{ x: width / 2, y: height / 2 }], {
    ...DEFAULT_ART_HISTORY_BRUSH,
    size: 10_000,
  }), /work limit/);
});
