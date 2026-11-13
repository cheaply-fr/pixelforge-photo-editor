import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTER_RADIUS_MAX,
  GAUSSIAN_BLUR_MAX_RADIUS,
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  filterRadiusMax,
  gaussianBlurDownsampleFactor,
  gaussianBlurSliderMax,
  retypeFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { tiledNeighborhoodRadius } from '../src/tiledDocument.ts';

const gaussian = (data, width, height, radius, amount = 100) =>
  applyFilterEffectsPixels(data, width, height, { type: 'gaussian-blur', amount, radius });

/** Opaque scene with hard blocks, a ramp and a bright dot: strong low and high frequencies. */
function scene(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const block = ((Math.floor(x / 37) + Math.floor(y / 23)) & 1) * 180;
      data[offset] = block;
      data[offset + 1] = Math.round((x / width) * 255);
      data[offset + 2] = (x - width / 3) ** 2 + (y - height / 2) ** 2 < 400 ? 255 : 30;
      data[offset + 3] = 255;
    }
  return data;
}

/** Edge-renormalised separable Gaussian (sigma = radius / 3, support ±radius) on opaque RGB. */
function oracle(source, width, height, radius) {
  const sigma = radius / 3;
  const kernel = [];
  for (let offset = -radius; offset <= radius; offset += 1) kernel.push(Math.exp(-(offset * offset) / (2 * sigma * sigma)));
  const out = new Float64Array(width * height * 3);
  const tmp = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      const sum = [0, 0, 0];
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sx = x + offset;
        if (sx < 0 || sx >= width) continue;
        const weight = kernel[offset + radius];
        total += weight;
        for (let channel = 0; channel < 3; channel += 1) sum[channel] += source[(y * width + sx) * 4 + channel] * weight;
      }
      for (let channel = 0; channel < 3; channel += 1) tmp[(y * width + x) * 3 + channel] = sum[channel] / total;
    }
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      const sum = [0, 0, 0];
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sy = y + offset;
        if (sy < 0 || sy >= height) continue;
        const weight = kernel[offset + radius];
        total += weight;
        for (let channel = 0; channel < 3; channel += 1) sum[channel] += tmp[(sy * width + x) * 3 + channel] * weight;
      }
      for (let channel = 0; channel < 3; channel += 1) out[(y * width + x) * 3 + channel] = sum[channel] / total;
    }
  return out;
}

test('Gaussian Blur alone accepts radii up to 1000 px; every other filter keeps 64 px', () => {
  assert.equal(GAUSSIAN_BLUR_MAX_RADIUS, 1000);
  assert.equal(filterRadiusMax('gaussian-blur'), 1000);
  assert.equal(filterRadiusMax('box-blur'), FILTER_RADIUS_MAX);
  assert.equal(filterRadiusMax('mosaic'), 64);
  const big = effectiveFilterEffects({ type: 'gaussian-blur', amount: 100, radius: 640 });
  assert.equal(big.radius, 640);
  assert.ok(validFilterEffects(big));
  assert.equal(effectiveFilterEffects({ type: 'gaussian-blur', amount: 100, radius: 5000 }).radius, 1000);
  assert.equal(validFilterEffects({ ...big, radius: 1001 }), false);
  assert.equal(validFilterEffects({ ...big, radius: 250.5 }), false);
  // Other filters still clamp and reject above 64, including after a retype.
  assert.equal(effectiveFilterEffects({ type: 'box-blur', amount: 100, radius: 640 }).radius, 64);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects({ type: 'mosaic', amount: 100, radius: 8 }), radius: 65 }), false);
  assert.equal(retypeFilterEffects(big, { type: 'motion-blur' }).radius, 64);
});

test('slider range scales with the document: at least 250 px, a quarter of the long side, at most 1000 px', () => {
  assert.equal(gaussianBlurSliderMax(640, 480), 250);
  assert.equal(gaussianBlurSliderMax(2000, 1200), 500);
  assert.equal(gaussianBlurSliderMax(3000, 4000), 1000);
  assert.equal(gaussianBlurSliderMax(12000, 9000), 1000);
  assert.equal(gaussianBlurSliderMax(Number.NaN, 0), 250);
});

test('radii up to 64 keep the full-resolution path; larger radii downsample with a bounded reduced radius', () => {
  for (const radius of [1, 8, 9, 24, 64]) assert.equal(gaussianBlurDownsampleFactor(radius), 1, `radius ${radius}`);
  for (const radius of [65, 100, 250, 640, 1000]) {
    const factor = gaussianBlurDownsampleFactor(radius);
    assert.ok(factor >= 2, `radius ${radius}`);
    assert.ok(radius / factor <= 32.5, `radius ${radius}: reduced ${radius / factor}`);
    assert.ok(radius / factor >= 16, `radius ${radius}: reduced ${radius / factor}`);
  }
});

test('large-radius path matches an exact edge-renormalised Gaussian within a few levels', () => {
  const width = 240;
  const height = 180;
  const source = scene(width, height);
  for (const radius of [65, 96, 150]) {
    const output = gaussian(source, width, height, radius);
    const expected = oracle(source, width, height, radius);
    let max = 0;
    let total = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      assert.equal(output[pixel * 4 + 3], 255);
      for (let channel = 0; channel < 3; channel += 1) {
        const error = Math.abs(output[pixel * 4 + channel] - expected[pixel * 3 + channel]);
        max = Math.max(max, error);
        total += error;
      }
    }
    const mean = total / (width * height * 3);
    assert.ok(mean <= 1.5, `radius ${radius}: mean ${mean}`);
    assert.ok(max <= 8, `radius ${radius}: max ${max}`);
  }
});

test('large-radius path spreads alpha, keeps hidden RGB where nothing lands and blends by amount', () => {
  const width = 400;
  const height = 300;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < source.length; offset += 4) {
    source[offset] = 11;
    source[offset + 1] = 22;
    source[offset + 2] = 33;
  }
  // An opaque red square in the top-left corner on a transparent layer.
  for (let y = 20; y < 60; y += 1)
    for (let x = 20; x < 60; x += 1) source.set([250, 10, 10, 255], (y * width + x) * 4);
  const original = source.slice();
  const output = gaussian(source, width, height, 120);
  assert.deepEqual(source, original);
  const at = (x, y) => output.subarray((y * width + x) * 4, (y * width + x) * 4 + 4);
  // Coverage spreads well beyond the square but fades with distance.
  assert.ok(at(100, 40)[3] > 0);
  assert.ok(at(40, 40)[3] > at(100, 40)[3]);
  assert.ok(at(100, 40)[3] > at(150, 40)[3]);
  // Colour stays the square's colour (no dark halo from transparent black).
  assert.ok(at(100, 40)[0] >= 240 && at(100, 40)[1] <= 20, String([...at(100, 40)]));
  // Far away nothing lands: hidden RGB is preserved byte for byte.
  assert.deepEqual([...at(399, 299)], [11, 22, 33, 0]);
  // Amount 0 is neutral; amount 50 sits between source and full blur.
  assert.deepEqual(gaussian(source, width, height, 120, 0), source);
  const half = gaussian(source, width, height, 120, 50);
  const index = (40 * width + 40) * 4 + 3;
  assert.ok(half[index] <= 255 && half[index] >= output[index]);
});

test('large radii stay off the tiled path (its overlap is bounded) and use the full-frame renderer', () => {
  assert.equal(tiledNeighborhoodRadius({ type: 'gaussian-blur', amount: 100, radius: 64 }), 64);
  assert.equal(tiledNeighborhoodRadius({ type: 'gaussian-blur', amount: 100, radius: 65 }), undefined);
  assert.equal(tiledNeighborhoodRadius({ type: 'gaussian-blur', amount: 100, radius: 1000 }), undefined);
});

test('performance smoke: 3000x4000 Gaussian radius 1000 finishes in bounded time', () => {
  // Full resolution needed ~7 s here on a dev machine; the downsampled path
  // takes ~1.3 s. The bound is generous for slow CI hardware.
  const width = 3000;
  const height = 4000;
  const image = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < image.length; index += 1) image[index] = index % 4 === 3 ? 255 : (index * 2654435761) >>> 24;
  const started = performance.now();
  const output = gaussian(image, width, height, 1000);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 12_000, `took ${Math.round(elapsed)} ms`);
  assert.notDeepEqual(output.subarray(0, 4096), image.subarray(0, 4096));
});
