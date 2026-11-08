import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_DIFFERENCE_CLOUD_SCALE_MAX,
  MAX_CLOUD_RENDER_SCALE,
  MIN_CLOUD_RENDER_SCALE,
  applyFilterEffectsPixels,
  cloudField,
  cloudOctaves,
  differenceCloudScale,
  effectiveFilterEffects,
  forEachCloudRow,
  retypeFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { filterActionParameters } from '../src/filterActionParameters.ts';
import { applyLevelsPixels, levelsChannel, neutral, validAdjustments } from '../src/document.ts';

const diff = (patch = {}) =>
  effectiveFilterEffects({ type: 'difference-clouds', amount: 100, radius: 18, seed: 7, ...patch });
const transparent = (width, height) => new Uint8ClampedArray(width * height * 4);
const solid = (width, height, rgba) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return data;
};

/** Mean |horizontal gradient| of the red channel on columns matching `select`. */
function meanGradient(data, width, height, select) {
  let total = 0, count = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x + 1 < width; x += 1) {
      if (!select(x)) continue;
      total += Math.abs(data[(y * width + x + 1) * 4] - data[(y * width + x) * 4]);
      count += 1;
    }
  return total / count;
}

test('Difference Clouds on a transparent layer renders the clouds (transparent counts as black)', () => {
  const width = 96, height = 64;
  const output = applyFilterEffectsPixels(transparent(width, height), width, height, diff({ cloudScale: 32 }));
  let low = 255, high = 0;
  for (let offset = 0; offset < output.length; offset += 4) {
    assert.equal(output[offset + 3], 255);
    // |black − cloud| is the grey cloud itself.
    assert.equal(output[offset], output[offset + 1]);
    assert.equal(output[offset + 1], output[offset + 2]);
    low = Math.min(low, output[offset]);
    high = Math.max(high, output[offset]);
  }
  // Stretched to the full black-to-white range like colour Clouds.
  assert.ok(low <= 1 && high >= 254, `${low}..${high}`);
  const field = cloudField(width, height, 32, 7, true);
  for (let index = 0; index < field.length; index += 97)
    assert.ok(Math.abs(output[index * 4] - field[index] * 255) <= 0.5 + 1e-6);
});

test('Difference Clouds on black equals the clouds; on white it is their inverse', () => {
  const width = 64, height = 48, effect = diff({ cloudScale: 24 });
  const onBlack = applyFilterEffectsPixels(solid(width, height, [0, 0, 0, 255]), width, height, effect);
  const onEmpty = applyFilterEffectsPixels(transparent(width, height), width, height, effect);
  const onWhite = applyFilterEffectsPixels(solid(width, height, [255, 255, 255, 255]), width, height, effect);
  assert.deepEqual(onBlack, onEmpty);
  for (let offset = 0; offset < onBlack.length; offset += 4) {
    assert.ok(Math.abs(onWhite[offset] - (255 - onBlack[offset])) <= 1);
    assert.equal(onWhite[offset + 3], 255);
  }
});

test('Difference Clouds amount blends coverage and colour in premultiplied space', () => {
  const width = 16, height = 16;
  const half = applyFilterEffectsPixels(transparent(width, height), width, height, diff({ cloudScale: 8, amount: 50 }));
  const full = applyFilterEffectsPixels(transparent(width, height), width, height, diff({ cloudScale: 8 }));
  for (let offset = 0; offset < half.length; offset += 4) {
    assert.equal(half[offset + 3], 128);
    // Colour equals the full-strength cloud (only coverage halves).
    assert.ok(Math.abs(half[offset] - full[offset]) <= 1);
  }
  // Opaque source keeps the historical opaque formula c·(1 − s) + |c − cloud|·s.
  const source = solid(width, height, [200, 100, 30, 255]);
  const blended = applyFilterEffectsPixels(source, width, height, diff({ cloudScale: 8, amount: 40 }));
  const field = cloudField(width, height, 8, 7, true);
  for (let index = 0; index < field.length; index += 1) {
    const cloud = field[index] * 255;
    const expected = [200, 100, 30].map((value) => Math.round(value * 0.6 + Math.abs(value - cloud) * 0.4));
    assert.deepEqual([...blended.subarray(index * 4, index * 4 + 3)], expected);
    assert.equal(blended[index * 4 + 3], 255);
  }
});

test('Difference Clouds noise is smooth fractal noise with no lattice-aligned grid', () => {
  const width = 256, height = 128;
  for (const scale of [16, 32, 64]) {
    const output = applyFilterEffectsPixels(transparent(width, height), width, height, diff({ cloudScale: scale }));
    const onGrid = meanGradient(output, width, height, (x) => x % scale === scale - 1 || x % scale === 0);
    const all = meanGradient(output, width, height, () => true);
    // The aligned smoothstep lattice of the old renderer flattened every
    // octave on the same columns; offset octaves keep gradients there.
    assert.ok(onGrid > all * 0.8, `scale ${scale}: grid ${onGrid.toFixed(2)} vs mean ${all.toFixed(2)}`);
    // Smooth: neighbouring pixels differ by a few levels, not white noise.
    assert.ok(all < 12, `scale ${scale}: mean gradient ${all}`);
    let max = 0;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x + 1 < width; x += 1)
        max = Math.max(max, Math.abs(output[(y * width + x + 1) * 4] - output[(y * width + x) * 4]));
    assert.ok(max < 64, `scale ${scale}: max step ${max}`);
    // Fractal: more than one octave contributes.
    assert.ok(cloudOctaves(scale) >= 4);
  }
});

test('the aligned Clouds lattice flattens gradients on grid columns (why Difference Clouds offsets octaves)', () => {
  const width = 256, height = 64, scale = 32;
  const aligned = new Float64Array(width * height), offset = new Float64Array(width * height);
  forEachCloudRow(width, height, scale, 7, cloudOctaves(scale), (y, sums) => aligned.set(sums, y * width));
  forEachCloudRow(width, height, scale, 7, cloudOctaves(scale), (y, sums) => offset.set(sums, y * width), true);
  const gradient = (field, select) => {
    let total = 0, count = 0;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x + 1 < width; x += 1)
        if (select(x)) {
          total += Math.abs(field[y * width + x + 1] - field[y * width + x]);
          count += 1;
        }
    return total / count;
  };
  // Steps that touch a multiple of the cloud size (measured ~0.5 aligned, ~1 offset).
  const grid = (x) => x % scale === 0 || x % scale === scale - 1;
  assert.ok(gradient(aligned, grid) < gradient(aligned, () => true) * 0.7);
  assert.ok(gradient(offset, grid) > gradient(offset, () => true) * 0.85);
});

test('Difference Clouds scale range matches Clouds and legacy radius records migrate', () => {
  assert.equal(validFilterEffects(diff({ cloudScale: MAX_CLOUD_RENDER_SCALE })), true);
  assert.equal(validFilterEffects(diff({ cloudScale: MIN_CLOUD_RENDER_SCALE })), true);
  assert.equal(diff({ cloudScale: 5000 }).cloudScale, MAX_CLOUD_RENDER_SCALE);
  assert.equal(diff({ cloudScale: 1 }).cloudScale, MIN_CLOUD_RENDER_SCALE);
  assert.equal(diff({ cloudScale: 300.4 }).cloudScale, 300);
  for (const invalid of [2049, 1, 12.5, Number.NaN])
    assert.equal(validFilterEffects({ ...diff(), cloudScale: invalid }), false, String(invalid));
  // Only Difference Clouds records carry cloudScale.
  assert.equal(validFilterEffects({ ...effectiveFilterEffects({ type: 'clouds', amount: 50, radius: 8 }), cloudScale: 64 }), false);
  assert.equal(effectiveFilterEffects({ type: 'clouds', amount: 50, radius: 8, cloudScale: 64 }).cloudScale, undefined);
  assert.equal(retypeFilterEffects(diff({ cloudScale: 400 }), { type: 'gaussian-blur', radius: 4 }).cloudScale, undefined);
  // Legacy records (no cloudScale) render with the new generator at their radius.
  const legacy = diff({ radius: 40 });
  assert.equal(legacy.cloudScale, undefined);
  assert.equal(validFilterEffects(legacy), true);
  assert.equal(differenceCloudScale(legacy), 40);
  assert.equal(differenceCloudScale(diff({ radius: 1 })), 2);
  assert.equal(differenceCloudScale(diff({ radius: 64 })), LEGACY_DIFFERENCE_CLOUD_SCALE_MAX);
  assert.equal(differenceCloudScale(diff({ radius: 5, cloudScale: 900 })), 900);
  const width = 40, height = 30;
  assert.deepEqual(
    applyFilterEffectsPixels(transparent(width, height), width, height, legacy),
    applyFilterEffectsPixels(transparent(width, height), width, height, diff({ radius: 3, cloudScale: 40 })),
  );
  // Larger scale gives broader clouds (smaller gradients).
  const small = applyFilterEffectsPixels(transparent(200, 100), 200, 100, diff({ cloudScale: 8 }));
  const large = applyFilterEffectsPixels(transparent(200, 100), 200, 100, diff({ cloudScale: 400 }));
  assert.ok(meanGradient(large, 200, 100, () => true) < meanGradient(small, 200, 100, () => true));
  // Recorded Actions keep the size.
  assert.equal(JSON.parse(filterActionParameters(diff({ cloudScale: 777 })).filterExtra).cloudScale, 777);
});

test('Difference Clouds stays deterministic per seed and source-safe', () => {
  const width = 48, height = 32;
  const source = solid(width, height, [10, 120, 240, 200]);
  const copy = source.slice();
  const first = applyFilterEffectsPixels(source, width, height, diff({ cloudScale: 20, seed: 3 }));
  assert.deepEqual(first, applyFilterEffectsPixels(source, width, height, diff({ cloudScale: 20, seed: 3 })));
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, width, height, diff({ cloudScale: 20, seed: 4 })));
  assert.deepEqual(source, copy);
});

test('reversed Levels output inverts tones; ordered ranges are unchanged', () => {
  // 255 → 0 output is a straight inversion.
  for (const value of [0, 1, 64, 128, 200, 255]) assert.equal(levelsChannel(value, 0, 255, 1, 255, 0), 255 - value);
  // Partial reversed range.
  assert.equal(levelsChannel(0, 0, 255, 1, 200, 40), 200);
  assert.equal(levelsChannel(255, 0, 255, 1, 200, 40), 40);
  assert.equal(levelsChannel(128, 0, 255, 1, 200, 40), Math.round(200 - (128 / 255) * 160));
  // Gamma and input points still apply before the reversed output.
  assert.equal(levelsChannel(64, 0, 255, 2, 255, 0), 255 - levelsChannel(64, 0, 255, 2, 0, 255));
  assert.equal(levelsChannel(10, 20, 220, 1, 255, 0), 255);
  // Equal endpoints flatten.
  for (const value of [0, 90, 255]) assert.equal(levelsChannel(value, 0, 255, 1, 128, 128), 128);
  // Ordered ranges are byte-identical to the previous span (max(1, white − black)).
  for (let black = 0; black < 255; black += 37)
    for (let white = black + 1; white <= 255; white += 41)
      for (const value of [0, 33, 127, 254, 255]) {
        const corrected = value / 255;
        assert.equal(levelsChannel(value, 0, 255, 1, black, white), Math.round(black + corrected * Math.max(1, white - black)));
      }
});

test('applyLevelsPixels inverts with reversed output and keeps alpha and hidden RGB', () => {
  const source = new Uint8ClampedArray([0, 64, 255, 255, 200, 100, 50, 128, 9, 19, 29, 0]);
  const inverted = applyLevelsPixels(source, { ...neutral, levelsOutputBlack: 255, levelsOutputWhite: 0 });
  assert.deepEqual([...inverted], [255, 191, 0, 255, 55, 155, 205, 128, 9, 19, 29, 0]);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 255, levelsOutputWhite: 0 }), true);
  // Old documents (ordered output) render exactly as before.
  const ordered = applyLevelsPixels(source, { ...neutral, levelsOutputBlack: 32, levelsOutputWhite: 224 });
  assert.deepEqual([...ordered.subarray(0, 4)], [32, 80, 224, 255]);
});
