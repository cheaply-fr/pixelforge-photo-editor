import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';

// Median, Dust & Scratches, Reflection Removal and Motion Blur were sped up
// (sliding histograms / precomputed taps) without changing a single output
// byte. These oracles are the original per-pixel sort and sampling loops.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampByte = (value) => clamp(Math.round(value), 0, 255);

function windowMedians(source, width, height, x, y, span, excludeCenter) {
  const channels = [[], [], []];
  for (let sy = Math.max(0, y - span); sy <= Math.min(height - 1, y + span); sy += 1)
    for (let sx = Math.max(0, x - span); sx <= Math.min(width - 1, x + span); sx += 1) {
      const sample = (sy * width + sx) * 4;
      if (!source[sample + 3] || (excludeCenter && sx === x && sy === y)) continue;
      for (let channel = 0; channel < 3; channel += 1) channels[channel].push(source[sample + channel]);
    }
  if (!channels[0].length) return undefined;
  return channels.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
}

function referenceMedian(source, width, height, radius, strength) {
  const output = new Uint8ClampedArray(source);
  const span = Math.min(8, Math.max(1, Math.round(radius)));
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!source[offset + 3]) continue;
      const median = windowMedians(source, width, height, x, y, span, false);
      for (let channel = 0; channel < 3; channel += 1)
        output[offset + channel] = clampByte(source[offset + channel] + (median[channel] - source[offset + channel]) * strength);
    }
  return output;
}

function referenceDust(source, width, height, radiusValue, thresholdValue, strength) {
  const output = new Uint8ClampedArray(source);
  const radius = clamp(Math.round(radiusValue), 1, 8);
  const threshold = clamp(Math.round(thresholdValue), 0, 255);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!source[offset + 3]) continue;
      const median = windowMedians(source, width, height, x, y, radius, false);
      const distance = Math.max(...[0, 1, 2].map((channel) => Math.abs(source[offset + channel] - median[channel])));
      if (distance <= threshold) continue;
      for (let channel = 0; channel < 3; channel += 1)
        output[offset + channel] = clampByte(source[offset + channel] + (median[channel] - source[offset + channel]) * clamp(strength, 0, 1));
    }
  return output;
}

function referenceReflection(source, width, height, radiusValue, thresholdValue, strength) {
  const output = new Uint8ClampedArray(source);
  const radius = clamp(Math.round(radiusValue), 1, 8);
  const threshold = clamp(Math.round(thresholdValue), 0, 255);
  const luma = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!source[offset + 3]) continue;
      const median = windowMedians(source, width, height, x, y, radius, true);
      if (!median) continue;
      const [r, g, b] = source.subarray(offset, offset + 3);
      const currentLuma = luma(r, g, b);
      const highlight = clamp((currentLuma - 160) / 95, 0, 1);
      const neutrality = 1 - clamp((Math.max(r, g, b) - Math.min(r, g, b)) / 96, 0, 1);
      const outlier = clamp((currentLuma - luma(...median) - threshold) / 80, 0, 1);
      const mix = clamp(strength, 0, 1) * highlight * neutrality * outlier;
      if (mix <= 0) continue;
      for (let channel = 0; channel < 3; channel += 1)
        output[offset + channel] = clampByte(source[offset + channel] + (median[channel] - source[offset + channel]) * mix);
    }
  return output;
}

function referenceMotion(source, width, height, radius, angle, strength) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const dx = Math.cos((angle * Math.PI) / 180);
  const dy = Math.sin((angle * Math.PI) / 180);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const sums = [0, 0, 0];
      let weight = 0;
      for (let step = -bounded; step <= bounded; step += 1) {
        // Offsets are rounded once per tap, so every pixel (and every tile or
        // band of a larger image) samples the same pattern.
        const sx = clamp(x + Math.round(dx * step), 0, width - 1);
        const sy = clamp(y + Math.round(dy * step), 0, height - 1);
        const offset = (sy * width + sx) * 4;
        const alpha = source[offset + 3] / 255;
        if (!alpha) continue;
        for (let channel = 0; channel < 3; channel += 1) sums[channel] += source[offset + channel] * alpha;
        weight += alpha;
      }
      // Alpha-spreading output (src/alphaSpread.ts): every tap counts.
      const mix = clamp(strength, 0, 1), coverage = bounded * 2 + 1, alpha = source[destination + 3];
      if (alpha === 255 && weight >= coverage * (1 - 1e-9)) {
        for (let channel = 0; channel < 3; channel += 1)
          output[destination + channel] = clampByte(source[destination + channel] * (1 - mix) + (sums[channel] / weight) * mix);
        continue;
      }
      const alphaByte = clampByte(((alpha / 255) * (1 - mix) + Math.min(1, weight / coverage) * mix) * 255);
      output[destination + 3] = alphaByte;
      if (!alphaByte) continue;
      const keep = (alpha / 255) * (1 - mix) * coverage;
      for (let channel = 0; channel < 3; channel += 1)
        output[destination + channel] = clampByte(
          (source[destination + channel] * keep + sums[channel] * mix) / (keep + weight * mix),
        );
    }
  return output;
}

function fixture(width, height, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state >>> 24;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    const bright = next() < 40;
    for (let channel = 0; channel < 3; channel += 1) data[index + channel] = bright ? 245 - (next() & 7) : next();
    const alpha = next();
    data[index + 3] = alpha < 50 ? 0 : alpha < 90 ? alpha : 255;
  }
  return data;
}

const sizes = [[1, 1], [6, 4], [33, 21], [80, 70]];

test('sliding-histogram Median is identical to the sorted-window median', () => {
  for (const [width, height] of sizes)
    for (const radius of [1, 2, 5, 8, 64])
      for (const amount of [100, 45]) {
        const source = fixture(width, height, width * 7 + height);
        assert.deepEqual(
          applyFilterEffectsPixels(source, width, height, { type: 'median', amount, radius }),
          referenceMedian(source, width, height, radius, amount / 100),
          `${width}x${height} radius ${radius} amount ${amount}`,
        );
      }
});

test('Dust & Scratches keeps its sorted-median output', () => {
  for (const [width, height] of sizes)
    for (const radius of [1, 3, 8])
      for (const threshold of [0, 12, 60]) {
        const source = fixture(width, height, width + height * 3);
        assert.deepEqual(
          applyFilterEffectsPixels(source, width, height, { type: 'dust-scratches', amount: 80, radius, threshold }),
          referenceDust(source, width, height, radius, threshold, 0.8),
          `${width}x${height} radius ${radius} threshold ${threshold}`,
        );
      }
});

test('Reflection Removal keeps its neighbour median (destination excluded)', () => {
  for (const [width, height] of sizes)
    for (const radius of [1, 4, 8]) {
      const source = fixture(width, height, 11 + width);
      assert.deepEqual(
        applyFilterEffectsPixels(source, width, height, { type: 'reflection-removal', amount: 90, radius, threshold: 6 }),
        referenceReflection(source, width, height, radius, 6, 0.9),
        `${width}x${height} radius ${radius}`,
      );
    }
});

test('Motion Blur fast interior taps match clamped nearest sampling at every angle', () => {
  const width = 150;
  const height = 140;
  const source = fixture(width, height, 3);
  // Multiples of 9 plus the half-pixel tie angles (±30, ±60, ±150…) that used
  // to drop to the slow per-pixel rounding path.
  const angles = [...Array.from({ length: 41 }, (_, index) => -180 + index * 9), -150, -60, -30, 30, 60, 120, 150];
  for (const angle of angles)
    for (const radius of [1, 6, 64]) {
      assert.deepEqual(
        applyFilterEffectsPixels(source, width, height, { type: 'motion-blur', amount: 100, radius, angle }),
        referenceMotion(source, width, height, radius, angle, 1),
        `angle ${angle} radius ${radius}`,
      );
    }
});

test('performance smoke: 1000x1000 Median radius 8 is no longer a per-pixel sort', () => {
  // The sort-based version took ~175 s here on a dev machine; the sliding
  // histogram takes ~1 s. The bound tolerates slow CI hardware.
  const source = fixture(1000, 1000, 5);
  const started = performance.now();
  applyFilterEffectsPixels(source, 1000, 1000, { type: 'median', amount: 100, radius: 8 });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 20_000, `took ${Math.round(elapsed)} ms`);
});
