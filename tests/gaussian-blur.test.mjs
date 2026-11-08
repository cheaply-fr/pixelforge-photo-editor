import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels, gaussianBoxHalfWidths } from '../src/filterEffects.ts';
import { renderTiledNeighborhoodEffect } from '../src/tiledDocument.ts';
import { readTile } from '../src/tilePlan.ts';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampByte = (value) => clamp(Math.round(value), 0, 255);

/**
 * The historical per-pixel truncated Gaussian (sigma = radius / 3, support
 * ±radius, alpha-weighted, edge-renormalised) kept as the oracle, with the
 * alpha-spreading output: alpha is blurred too (weight / in-image kernel
 * mass) and colour blends in premultiplied space; an opaque pixel in an
 * opaque neighbourhood keeps the historical formula (see src/alphaSpread.ts).
 */
function referenceGaussian(source, width, height, radius, strength) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const sigma = Math.max(0.5, bounded / 3);
  const kernel = new Float32Array(bounded * 2 + 1);
  let kernelTotal = 0;
  for (let offset = -bounded; offset <= bounded; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + bounded] = weight;
    kernelTotal += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= kernelTotal;
  const count = width * height;
  // In-image kernel mass per column and row (summed in tap order).
  const mass = (index, length) => {
    let total = 0;
    for (let offset = -bounded; offset <= bounded; offset += 1)
      if (index + offset >= 0 && index + offset < length) total += kernel[offset + bounded];
    return total;
  };
  const coverageX = Array.from({ length: width }, (_, x) => mass(x, width));
  const coverageY = Array.from({ length: height }, (_, y) => mass(y, height));
  const horizontal = new Float32Array(count);
  const horizontalWeight = new Float32Array(count);
  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let offset = -bounded; offset <= bounded; offset += 1) {
          const sx = x + offset;
          if (sx < 0 || sx >= width) continue;
          const sourceOffset = (y * width + sx) * 4;
          const alpha = source[sourceOffset + 3] / 255;
          const kernelWeight = kernel[offset + bounded];
          sum += source[sourceOffset + channel] * alpha * kernelWeight;
          weight += alpha * kernelWeight;
        }
        horizontal[y * width + x] = sum;
        horizontalWeight[y * width + x] = weight;
      }
    for (let x = 0; x < width; x += 1)
      for (let y = 0; y < height; y += 1) {
        let sum = 0;
        let weight = 0;
        for (let offset = -bounded; offset <= bounded; offset += 1) {
          const sy = y + offset;
          if (sy < 0 || sy >= height) continue;
          const index = sy * width + x;
          sum += horizontal[index] * kernel[offset + bounded];
          weight += horizontalWeight[index] * kernel[offset + bounded];
        }
        const outputOffset = (y * width + x) * 4;
        const mix = clamp(strength, 0, 1);
        const alpha = source[outputOffset + 3];
        const coverage = coverageX[x] * coverageY[y];
        if (alpha === 255 && weight >= coverage * (1 - 1e-9)) {
          output[outputOffset + channel] = clampByte(source[outputOffset + channel] * (1 - mix) + (sum / weight) * mix);
          continue;
        }
        const blurred = Math.min(1, Math.max(0, weight / coverage));
        const alphaByte = clampByte(((alpha / 255) * (1 - mix) + blurred * mix) * 255);
        if (channel === 0) output[outputOffset + 3] = alphaByte;
        if (!alphaByte) continue;
        const keep = (alpha / 255) * (1 - mix) * coverage;
        if (keep + weight * mix > 0)
          output[outputOffset + channel] = clampByte(
            (source[outputOffset + channel] * keep + sum * mix) / (keep + weight * mix),
          );
      }
  }
  return output;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state >>> 24;
  };
}

/** Opaque noise: the hardest case for kernel-shape differences. */
function noise(width, height, seed = 7) {
  const next = random(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 1)
    data[index] = (index & 3) === 3 ? 255 : next();
  return data;
}

/** Opaque hard step and ramp: edge renormalisation and step response. */
function step(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const on = x > width / 2 ? 255 : 0;
      data.set([on, 255 - on, Math.floor((y * 255) / height), 255], offset);
    }
  return data;
}

/** Opaque disc, partial-alpha stripes, transparent pixels with hidden RGB. */
function alphaScene(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = (x - width / 2) ** 2 + (y - height / 2) ** 2 < (width / 4) ** 2;
      data.set([inside ? 240 : 13, (x * 5) & 255, (y * 3) & 255, inside ? 255 : x % 7 === 0 ? 90 : 0], offset);
    }
  return data;
}

/**
 * Visible (premultiplied) colour plus alpha: hidden RGB under near-zero alpha
 * carries no visible difference, so tolerances compare what is composited.
 */
function premultiplied(data) {
  const result = new Uint8ClampedArray(data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    for (let channel = 0; channel < 3; channel += 1)
      result[offset + channel] = Math.round((data[offset + channel] * alpha) / 255);
    result[offset + 3] = alpha;
  }
  return result;
}

function difference(a, b, source) {
  let max = 0;
  let opaqueMax = 0;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = Math.abs(a[index] - b[index]);
    max = Math.max(max, delta);
    if (source?.[(index & ~3) + 3] === 255) opaqueMax = Math.max(opaqueMax, delta);
    sum += delta;
  }
  return { max, opaqueMax, mean: sum / a.length };
}

const gaussian = (data, width, height, radius, amount = 100) =>
  applyFilterEffectsPixels(data, width, height, { type: 'gaussian-blur', amount, radius });

test('Gaussian radius 1..8 is bit-identical to the historical exact kernel', () => {
  const width = 41;
  const height = 33;
  for (const image of [noise(width, height), step(width, height), alphaScene(width, height)])
    for (let radius = 1; radius <= 8; radius += 1)
      for (const amount of [100, 37])
        assert.deepEqual(
          gaussian(image, width, height, radius, amount),
          referenceGaussian(image, width, height, radius, amount / 100),
          `radius ${radius} amount ${amount}`,
        );
});

test('large-radius Gaussian stays within the documented tolerance of the exact kernel', () => {
  // Documented in docs/performance-budgets.md: on opaque images every pixel
  // differs by at most 3 levels (mean <= 1.5; edge ramps under a radius near
  // the image size dominate the mean). Blur alpha is spread too, so the
  // alpha scene is compared as composited (premultiplied colour + alpha):
  // the cascade tail differs from the truncated Gaussian by at most 10
  // levels there (measured 8 at radius 64) and 2.5 on average.
  const width = 96;
  const height = 80;
  const cases = [
    ['noise', noise(width, height), 3, 1.5, 3],
    ['step', step(width, height), 3, 1.5, 3],
    ['alpha', alphaScene(width, height), 10, 2.5, 10],
  ];
  for (const radius of [9, 12, 17, 24, 33, 48, 64])
    for (const [name, image, maxTolerance, meanTolerance, opaqueTolerance] of cases) {
      const { max, opaqueMax, mean } = difference(
        premultiplied(gaussian(image, width, height, radius)),
        premultiplied(referenceGaussian(image, width, height, radius, 1)),
        image,
      );
      assert.ok(opaqueMax <= opaqueTolerance, `${String(name)} radius ${radius}: opaque max ${opaqueMax}`);
      assert.ok(max <= maxTolerance, `${String(name)} radius ${radius}: max ${max}`);
      assert.ok(mean <= meanTolerance, `${String(name)} radius ${radius}: mean ${mean}`);
    }
});

test('box cascade matches the kernel variance and never reaches past the radius', () => {
  for (let radius = 9; radius <= 64; radius += 1) {
    const halves = gaussianBoxHalfWidths(radius);
    assert.equal(halves.length, 3);
    assert.ok(halves.every((half) => Number.isInteger(half) && half >= 1));
    // The tiled renderer's overlap is the radius, so support must fit in it.
    assert.ok(halves.reduce((sum, half) => sum + half, 0) <= radius, `radius ${radius}`);
    const sigma = radius / 3;
    let total = 0;
    let variance = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
      total += weight;
      variance += weight * offset * offset;
    }
    variance /= total;
    const cascade = halves.reduce((sum, half) => sum + (half * (half + 1)) / 3, 0);
    assert.ok(Math.abs(cascade - variance) / variance < 0.12, `radius ${radius}: ${cascade} vs ${variance}`);
  }
});

test('Gaussian spreads alpha, keeps hidden RGB where nothing lands and never mutates the source', () => {
  const width = 70;
  const height = 50;
  const source = alphaScene(width, height);
  const original = source.slice();
  for (const radius of [3, 24, 64]) {
    const output = gaussian(source, width, height, radius);
    assert.deepEqual(source, original);
    let spread = 0;
    for (let offset = 0; offset < source.length; offset += 4) {
      if (!source[offset + 3] && output[offset + 3]) spread += 1;
      if (!output[offset + 3])
        assert.deepEqual(output.subarray(offset, offset + 3), source.subarray(offset, offset + 3));
    }
    // Transparent pixels next to covered ones receive blurred coverage.
    assert.ok(spread > 0, `radius ${radius}`);
  }
  // A lone opaque pixel on transparency keeps its colour and loses alpha
  // mass to its neighbours, symmetrically.
  const lone = new Uint8ClampedArray(9 * 9 * 4);
  lone.set([10, 200, 90, 255], (4 * 9 + 4) * 4);
  const blurred = gaussian(lone, 9, 9, 2);
  assert.ok(blurred[(4 * 9 + 4) * 4 + 3] < 255);
  assert.equal(blurred[(4 * 9 + 3) * 4 + 3], blurred[(4 * 9 + 5) * 4 + 3]);
  assert.equal(blurred[(3 * 9 + 4) * 4 + 3], blurred[(5 * 9 + 4) * 4 + 3]);
  assert.deepEqual([...blurred.subarray((4 * 9 + 5) * 4, (4 * 9 + 5) * 4 + 3)], [10, 200, 90]);
});

test('flat colour stays exact and no dark halo comes from transparent padding', () => {
  const width = 60;
  const height = 45;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    // Left half transparent with black hidden RGB; right half opaque orange,
    // with a partially transparent seam column.
    data.set(x < 30 ? [0, 0, 0, 0] : [250, 120, 10, x === 30 ? 60 : 255], index * 4);
  }
  for (const radius of [1, 8, 9, 31, 64]) {
    const output = gaussian(data, width, height, radius);
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      if (!data[offset + 3]) continue;
      assert.deepEqual([...output.subarray(offset, offset + 3)], [250, 120, 10], `radius ${radius} pixel ${index}`);
    }
  }
});

test('radius larger than the image is stable on tiny and thin images', () => {
  for (const [width, height] of [[1, 1], [3, 2], [1, 9], [17, 1]]) {
    const image = noise(width, height, width * 13 + height);
    for (const radius of [9, 64]) {
      const output = gaussian(image, width, height, radius);
      const reference = referenceGaussian(image, width, height, radius, 1);
      assert.ok(output.every((value) => Number.isInteger(value)));
      assert.ok(difference(output, reference).max <= 3, `${width}x${height} radius ${radius}`);
      if (width * height === 1) assert.deepEqual(output, image);
    }
  }
});

test('Gaussian is deterministic and smooths more as the radius grows', () => {
  const width = 128;
  const height = 96;
  const image = noise(width, height, 99);
  const spread = (data) => {
    let sum = 0;
    let squares = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      sum += data[offset];
      squares += data[offset] * data[offset];
    }
    const count = data.length / 4;
    return squares / count - (sum / count) ** 2;
  };
  let previous = spread(image);
  for (const radius of [2, 8, 9, 16, 32, 64]) {
    const first = gaussian(image, width, height, radius);
    assert.deepEqual(first, gaussian(image, width, height, radius));
    const current = spread(first);
    assert.ok(current < previous, `radius ${radius}: ${current} >= ${previous}`);
    previous = current;
  }
});

test('tiled large-radius Gaussian matches the full-frame render at seams', async () => {
  // Mixed tiles: the transparent corner makes one tile take the non-opaque
  // path while its neighbours take the opaque fast path.
  const width = 600;
  const height = 300;
  const source = noise(width, height, 5);
  for (let y = 0; y < 40; y += 1)
    for (let x = 0; x < 50; x += 1) source[(y * width + x) * 4 + 3] = (x * 7 + y) % 3 ? 128 : 0;
  for (const radius of [9, 24, 64]) {
    const effect = { type: 'gaussian-blur', amount: 100, radius };
    const expected = applyFilterEffectsPixels(source, width, height, effect);
    const destination = new Uint8ClampedArray(source.length);
    await renderTiledNeighborhoodEffect(
      width,
      height,
      effect,
      (tile) => readTile(source, width, height, tile),
      (output, tile) => {
        for (let row = 0; row < tile.height; row += 1) {
          const from = ((tile.y - tile.readY + row) * tile.readWidth + (tile.x - tile.readX)) * 4;
          destination.set(output.subarray(from, from + tile.width * 4), ((tile.y + row) * width + tile.x) * 4);
        }
      },
      { revision: `gaussian-${radius}`, tileSize: 256, maxWorkingBytes: 4 * 1024 * 1024 },
    );
    assert.deepEqual(destination, expected, `radius ${radius}`);
  }
});

test('performance smoke: 2000x2000 Gaussian radius 64 finishes in bounded time', () => {
  // The previous O(radius) kernel needed ~30 s here on a dev machine; the box
  // cascade is radius independent (~1 s). The bound is deliberately generous
  // for slow CI hardware while still failing an O(radius) regression.
  const width = 2000;
  const height = 2000;
  const image = noise(width, height, 3);
  const started = performance.now();
  const output = gaussian(image, width, height, 64);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 15_000, `took ${Math.round(elapsed)} ms`);
  assert.notDeepEqual(output.subarray(0, 4096), image.subarray(0, 4096));
});
