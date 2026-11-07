import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';
import { renderTiledNeighborhoodEffect } from '../src/tiledDocument.ts';
import { readTile } from '../src/tilePlan.ts';

// Smart Blur, Smart Sharpen, Surface Blur, Shape Blur, Reduce Noise, Lens,
// Radial (spin and zoom), Spin and Path Blur were rewritten for speed. The
// functions below are the previous per-pixel implementations, kept as
// oracles. Most of the new kernels are byte-identical; the documented
// exceptions are asserted with explicit tolerances.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampByte = (value) => clamp(Math.round(value), 0, 255);
const luma = (source, offset) => source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;

function sourcePixel(source, width, height, x, y) {
  const offset = (clamp(Math.round(y), 0, height - 1) * width + clamp(Math.round(x), 0, width - 1)) * 4;
  return [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
}

function sourcePixelBilinear(source, width, height, x, y) {
  const sampleX = clamp(x, 0, width - 1), sampleY = clamp(y, 0, height - 1);
  const left = Math.floor(sampleX), top = Math.floor(sampleY);
  const right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
  const tx = sampleX - left, ty = sampleY - top;
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  const offsets = [(top * width + left) * 4, (top * width + right) * 4, (bottom * width + left) * 4, (bottom * width + right) * 4];
  let alpha = 0, red = 0, green = 0, blue = 0;
  for (let index = 0; index < 4; index += 1) {
    const pixelAlpha = source[offsets[index] + 3] / 255, weight = weights[index] * pixelAlpha;
    alpha += weights[index] * pixelAlpha;
    red += source[offsets[index]] * weight;
    green += source[offsets[index] + 1] * weight;
    blue += source[offsets[index] + 2] * weight;
  }
  if (alpha <= 0) return [0, 0, 0, 0];
  return [clampByte(red / alpha), clampByte(green / alpha), clampByte(blue / alpha), clampByte(alpha * 255)];
}

function blendWeighted(output, source, destination, sums, weight, mix) {
  for (let channel = 0; channel < 3; channel += 1)
    output[destination + channel] = clampByte(source[destination + channel] * (1 - mix) + (sums[channel] / weight) * mix);
}

function referenceSmartBlur(source, width, height, radius, strength, output = new Uint8ClampedArray(source)) {
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const scale = 18 + bounded * 2;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const target = luma(source, destination);
      const sums = [0, 0, 0];
      let weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1)
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sample = (sy * width + sx) * 4;
          const alpha = source[sample + 3] / 255;
          if (!alpha) continue;
          const spatial = Math.exp(-(dx * dx + dy * dy) / (2 * bounded * bounded));
          const similarity = Math.exp(-Math.abs(luma(source, sample) - target) / scale);
          const sampleWeight = spatial * similarity * alpha;
          for (let channel = 0; channel < 3; channel += 1) sums[channel] += source[sample + channel] * sampleWeight;
          weight += sampleWeight;
        }
      if (weight) blendWeighted(output, source, destination, sums, weight, strength);
    }
  return output;
}

function referenceSmartSharpen(source, width, height, radius, amount) {
  const output = new Uint8ClampedArray(source);
  const reference = referenceSmartBlur(source, width, height, radius, 1, new Uint8ClampedArray(source.length));
  const strength = clamp(amount, 0, 100) / 100;
  for (let offset = 0; offset < source.length; offset += 4) {
    if (!source[offset + 3]) continue;
    const contrast = clamp(Math.abs(luma(source, offset) - luma(reference, offset)) / 24, 0, 1);
    for (let channel = 0; channel < 3; channel += 1)
      output[offset + channel] = clampByte(source[offset + channel] + (source[offset + channel] - reference[offset + channel]) * strength * contrast);
  }
  return output;
}

function referenceSurfaceBlur(source, width, height, radius, strength) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const threshold = 12 + bounded * 3;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const target = luma(source, destination);
      const sums = [0, 0, 0];
      let weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1)
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sample = (sy * width + sx) * 4;
          const alpha = source[sample + 3] / 255;
          if (!alpha) continue;
          if (Math.abs(luma(source, sample) - target) > threshold) continue;
          const sampleWeight = (1 / (1 + dx * dx + dy * dy)) * alpha;
          for (let channel = 0; channel < 3; channel += 1) sums[channel] += source[sample + channel] * sampleWeight;
          weight += sampleWeight;
        }
      if (weight) blendWeighted(output, source, destination, sums, weight, strength);
    }
  return output;
}

function referenceShapeBlur(source, width, height, radius, strength) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(12, Math.round(radius)));
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const sums = [0, 0, 0];
      let weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1)
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance > bounded) continue;
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sample = (sy * width + sx) * 4;
          const alpha = source[sample + 3] / 255;
          if (!alpha) continue;
          const sampleWeight = (bounded + 1 - distance) * alpha;
          for (let channel = 0; channel < 3; channel += 1) sums[channel] += source[sample + channel] * sampleWeight;
          weight += sampleWeight;
        }
      if (weight) blendWeighted(output, source, destination, sums, weight, strength);
    }
  return output;
}

function referenceReduceNoise(source, width, height, radiusValue, thresholdValue, strength) {
  const output = new Uint8ClampedArray(source);
  const radius = clamp(Math.round(radiusValue), 1, 8);
  const preserve = clamp(Math.round(thresholdValue), 1, 255);
  const mix = clamp(strength, 0, 1);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const base = [source[destination], source[destination + 1], source[destination + 2]];
      const sums = [0, 0, 0];
      let weight = 0;
      for (let sy = Math.max(0, y - radius); sy <= Math.min(height - 1, y + radius); sy += 1)
        for (let sx = Math.max(0, x - radius); sx <= Math.min(width - 1, x + radius); sx += 1) {
          const sample = (sy * width + sx) * 4;
          if (!source[sample + 3]) continue;
          const distance = Math.abs(source[sample] - base[0]) + Math.abs(source[sample + 1] - base[1]) + Math.abs(source[sample + 2] - base[2]);
          const sampleWeight = Math.max(0, 1 - distance / (preserve * 3)) * (1 / (1 + Math.hypot(sx - x, sy - y)));
          for (let channel = 0; channel < 3; channel += 1) sums[channel] += source[sample + channel] * sampleWeight;
          weight += sampleWeight;
        }
      if (!weight) continue;
      for (let channel = 0; channel < 3; channel += 1)
        output[destination + channel] = clampByte(base[channel] + (sums[channel] / weight - base[channel]) * mix);
    }
  return output;
}

function referenceLensBlur(source, width, height, radius, strength) {
  const output = new Uint8ClampedArray(source);
  const offsets = [[0, 0]];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let sample = 0; sample < 48; sample += 1) {
    const distance = radius * Math.sqrt((sample + 0.5) / 48);
    offsets.push([Math.round(Math.cos(sample * goldenAngle) * distance), Math.round(Math.sin(sample * goldenAngle) * distance)]);
  }
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      let red = 0, green = 0, blue = 0, weight = 0;
      for (const [dx, dy] of offsets) {
        const offset = (clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)) * 4;
        const alpha = source[offset + 3];
        red += source[offset] * alpha;
        green += source[offset + 1] * alpha;
        blue += source[offset + 2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + red / weight * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + green / weight * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + blue / weight * strength);
    }
  return output;
}

function integrate(source, width, height, positions) {
  const sums = [0, 0, 0];
  let weight = 0;
  for (const sample of positions) {
    const alpha = sample[3] / 255;
    if (!alpha) continue;
    for (let channel = 0; channel < 3; channel += 1) sums[channel] += sample[channel] * alpha;
    weight += alpha;
  }
  return { sums, weight };
}

function referenceRadial(source, width, height, effect, ellipse) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(64, Math.round(effect.radius)));
  const cx = clamp(effect.centerX, 0, 1) * (width - 1), cy = clamp(effect.centerY, 0, 1) * (height - 1);
  const mix = clamp(effect.amount / 100, 0, 1);
  const zoom = effect.radialMode === 'zoom';
  const sweep = (bounded * Math.PI) / 180, spread = bounded / 64 * 0.65;
  const rotation = ellipse ? (ellipse.rotation * Math.PI) / 180 : 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const dx = x - cx, dy = y - cy;
      let mask = 1;
      if (ellipse) {
        const rx = dx * Math.cos(rotation) + dy * Math.sin(rotation), ry = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
        const d = Math.hypot(rx / Math.max(1, ellipse.radiusX * width), ry / Math.max(1, ellipse.radiusY * height));
        if (d >= 1) continue;
        const feather = clamp(ellipse.feather, 0, 1);
        mask = feather <= 0 || d <= 1 - feather ? 1 : clamp((1 - d) / feather, 0, 1);
      }
      const distance = Math.hypot(dx, dy);
      if (distance < 0.5) continue;
      const base = Math.atan2(dy, dx);
      const samples = [];
      for (let index = -8; index <= 8; index += 1) {
        if (zoom) {
          const scale = 1 + (spread * index) / 8;
          samples.push(sourcePixel(source, width, height, cx + dx * scale, cy + dy * scale));
        } else {
          const angle = base + (sweep * index) / 8;
          samples.push(sourcePixel(source, width, height, cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance));
        }
      }
      const { sums, weight } = integrate(source, width, height, samples);
      if (weight) blendWeighted(output, source, destination, sums, weight, mix * mask);
    }
  return output;
}

function referencePath(source, width, height, effect) {
  const output = new Uint8ClampedArray(source);
  const bounded = Math.max(1, Math.min(64, Math.round(effect.radius)));
  const mix = clamp(effect.amount / 100, 0, 1);
  if (!effect.path) {
    const radians = (effect.angle * Math.PI) / 180;
    const tangentX = Math.cos(radians), tangentY = Math.sin(radians), normalX = -tangentY, normalY = tangentX;
    const cx = clamp(effect.centerX, 0, 1) * (width - 1), cy = clamp(effect.centerY, 0, 1) * (height - 1);
    const maxDimension = Math.max(1, Math.max(width, height));
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const destination = (y * width + x) * 4;
        if (!source[destination + 3]) continue;
        const curve = clamp(((x - cx) * normalX + (y - cy) * normalY) / maxDimension, -1, 1) * bounded * 0.85;
        const samples = [];
        for (let index = -8; index <= 8; index += 1) {
          const t = index / 8;
          samples.push(sourcePixelBilinear(source, width, height,
            x + tangentX * bounded * t + normalX * curve * t * t,
            y + tangentY * bounded * t + normalY * curve * t * t));
        }
        const { sums, weight } = integrate(source, width, height, samples);
        if (weight) blendWeighted(output, source, destination, sums, weight, mix);
      }
    return output;
  }
  const points = effect.path.map((point) => ({ x: point.x * (width - 1), y: point.y * (height - 1), speed: point.speed }));
  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    return { start, end, dx, dy, lengthSquared: Math.max(1e-6, dx * dx + dy * dy), length: Math.hypot(dx, dy) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const centred = effect.pathCentered !== false, taperAmount = effect.pathTaper ?? 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      let bestDistance = Infinity, bestT = 0, best = segments[0], along = 0, bestAlong = 0;
      for (const segment of segments) {
        const projection = clamp(((x - segment.start.x) * segment.dx + (y - segment.start.y) * segment.dy) / segment.lengthSquared, 0, 1);
        const distance = Math.hypot(x - (segment.start.x + segment.dx * projection), y - (segment.start.y + segment.dy * projection));
        if (distance < bestDistance) {
          bestDistance = distance; bestT = projection; best = segment; bestAlong = along + segment.length * projection;
        }
        along += segment.length;
      }
      const influence = clamp(1 - bestDistance / Math.max(1, bounded * 2), 0, 1);
      if (influence <= 0) continue;
      const speed = (best.start.speed + (best.end.speed - best.start.speed) * bestT) / 100;
      const taperDistance = totalLength > 0 ? bestAlong / totalLength : 0;
      const taper = 1 - clamp(taperAmount, 0, 1) * Math.max(taperDistance, 1 - taperDistance);
      const length = bounded * Math.max(0, speed) * taper;
      if (length < 0.5) continue;
      const direction = Math.atan2(best.dy, best.dx) + (effect.angle * Math.PI) / 180;
      const tangentX = Math.cos(direction), tangentY = Math.sin(direction);
      const samples = [];
      for (let index = centred ? -8 : 0; index <= 8; index += 1) {
        const t = index / 8;
        samples.push(sourcePixelBilinear(source, width, height, x + tangentX * length * t, y + tangentY * length * t));
      }
      const { sums, weight } = integrate(source, width, height, samples);
      if (weight) blendWeighted(output, source, destination, sums, weight, mix * influence);
    }
  return output;
}

/** Noisy RGBA with hard edges, transparent holes and partial alpha. */
function fixture(width, height, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state >>> 24;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const edge = (x * 3 + y * 2) % 23 < 11;
      for (let channel = 0; channel < 3; channel += 1)
        data[index + channel] = clampByte((edge ? 200 : 50) + channel * 9 + (next() & 31) - 16);
      const alpha = next();
      data[index + 3] = alpha < 40 ? 0 : alpha < 90 ? alpha : 255;
    }
  return data;
}

function difference(actual, expected) {
  assert.equal(actual.length, expected.length);
  let max = 0, total = 0, changed = 0, alpha = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    if ((index & 3) === 3) { if (delta) alpha += 1; continue; }
    if (delta) changed += 1;
    max = Math.max(max, delta);
    total += delta;
  }
  return { max, mean: total / (actual.length * 0.75), changed, alpha };
}

const sizes = [[1, 1], [5, 3], [2, 9], [37, 23], [64, 48]];

test('Shape Blur row-tent prefix sums match the diamond kernel within rounding', () => {
  // Integer prefix sums give the exact weighted mean; the old kernel summed
  // byte/255 fractions in floating point, so a mean that lands on a .5
  // rounding tie can round one level differently. Nothing else may change.
  let channels = 0, changed = 0;
  for (const [width, height] of sizes)
    for (const radius of [1, 2, 5, 12, 40])
      for (const amount of [100, 37]) {
        const source = fixture(width, height, width * 13 + height + radius);
        const result = difference(
          applyFilterEffectsPixels(source, width, height, { type: 'shape-blur', amount, radius }),
          referenceShapeBlur(source, width, height, radius, amount / 100),
        );
        assert.equal(result.alpha, 0);
        assert.ok(result.max <= 1, `${width}x${height} radius ${radius} amount ${amount} max ${result.max}`);
        channels += width * height * 3;
        changed += result.changed;
      }
  assert.ok(changed / channels < 0.002, `${changed} of ${channels} channels changed`);
});

test('Surface Blur and Reduce Noise are byte-identical to their per-pixel kernels', () => {
  for (const [width, height] of [...sizes, [70, 140]])
    for (const radius of [1, 3, 8, 30]) {
      const source = fixture(width, height, width + height * 7 + radius);
      assert.deepEqual(
        applyFilterEffectsPixels(source, width, height, { type: 'surface-blur', amount: 90, radius }),
        referenceSurfaceBlur(source, width, height, radius, 0.9),
        `surface ${width}x${height} radius ${radius}`,
      );
      for (const threshold of [1, 25, 255])
        assert.deepEqual(
          applyFilterEffectsPixels(source, width, height, { type: 'reduce-noise', amount: 75, radius, threshold }),
          referenceReduceNoise(source, width, height, radius, threshold, 0.75),
          `reduce noise ${width}x${height} radius ${radius} threshold ${threshold}`,
        );
    }
});

test('Lens Blur merged taps and interior offsets are byte-identical', () => {
  for (const [width, height] of [...sizes, [130, 90]])
    for (const radius of [1, 2, 7, 33, 64]) {
      const source = fixture(width, height, radius * 5 + width);
      assert.deepEqual(
        applyFilterEffectsPixels(source, width, height, { type: 'lens-blur', amount: 80, radius }),
        referenceLensBlur(source, width, height, radius, 0.8),
        `${width}x${height} radius ${radius}`,
      );
    }
});

test('Zoom Radial Blur and both Path Blur modes are byte-identical', () => {
  const path = [{ x: 0.1, y: 0.2, speed: 80 }, { x: 0.5, y: 0.7, speed: 20 }, { x: 0.95, y: 0.35, speed: 100 }];
  for (const [width, height] of [...sizes, [96, 72]])
    for (const radius of [1, 9, 64]) {
      const source = fixture(width, height, radius + height);
      for (const centre of [[0.5, 0.5], [0.13, 0.81], [1, 0]]) {
        const zoom = { type: 'radial-blur', radialMode: 'zoom', amount: 70, radius, centerX: centre[0], centerY: centre[1] };
        assert.deepEqual(applyFilterEffectsPixels(source, width, height, zoom), referenceRadial(source, width, height, zoom),
          `zoom ${width}x${height} radius ${radius} centre ${centre.join(',')}`);
        const legacy = { type: 'path-blur', amount: 90, radius, angle: 33, centerX: centre[0], centerY: centre[1] };
        assert.deepEqual(applyFilterEffectsPixels(source, width, height, legacy), referencePath(source, width, height, legacy),
          `legacy path ${width}x${height} radius ${radius} centre ${centre.join(',')}`);
      }
      for (const [pathCentered, pathTaper] of [[true, 0], [false, 0.6]]) {
        const authored = { type: 'path-blur', amount: 100, radius, angle: -15, centerX: 0.5, centerY: 0.5, path, pathCentered, pathTaper };
        assert.deepEqual(applyFilterEffectsPixels(source, width, height, authored), referencePath(source, width, height, authored),
          `path ${width}x${height} radius ${radius} centred ${pathCentered}`);
      }
    }
});

test('Spin Radial Blur and Spin Blur differ only at sample-rounding ties', () => {
  // The rotation table moves a sample coordinate by ~1e-12 px at most, so a
  // pixel can only change when a coordinate sits on a .5 rounding boundary,
  // where it may take the neighbouring source pixel instead.
  const ellipse = { radiusX: 0.45, radiusY: 0.3, rotation: 25, feather: 0.4 };
  let pixels = 0, changed = 0;
  for (const [width, height] of [...sizes, [96, 72], [128, 128]])
    for (const radius of [1, 12, 64])
      for (const centre of [[0.5, 0.5], [0.37, 0.61], [0, 1]]) {
        const source = fixture(width, height, radius * 3 + width);
        const spin = { type: 'radial-blur', amount: 100, radius, centerX: centre[0], centerY: centre[1] };
        const gallery = { type: 'spin-blur', amount: 80, radius, centerX: centre[0], centerY: centre[1], spinEllipse: ellipse };
        for (const [effect, reference] of [
          [spin, referenceRadial(source, width, height, spin)],
          [gallery, referenceRadial(source, width, height, { ...gallery, radialMode: 'spin' }, ellipse)],
        ]) {
          const result = difference(applyFilterEffectsPixels(source, width, height, effect), reference);
          assert.equal(result.alpha, 0, 'alpha is source-owned');
          assert.ok(result.mean < 0.05, `${effect.type} ${width}x${height} r${radius} mean ${result.mean}`);
          pixels += width * height * 3;
          changed += result.changed;
        }
      }
  assert.ok(changed / pixels < 0.002, `${changed} of ${pixels} channels changed`);
});

test('Smart Blur and Smart Sharpen stay within one level of the exp-per-sample kernel', () => {
  for (const [width, height] of [...sizes, [90, 70]])
    for (const radius of [1, 3, 8, 20]) {
      const source = fixture(width, height, width * 3 + radius);
      const blur = difference(
        applyFilterEffectsPixels(source, width, height, { type: 'smart-blur', amount: 85, radius }),
        referenceSmartBlur(source, width, height, radius, 0.85),
      );
      assert.equal(blur.alpha, 0);
      assert.ok(blur.max <= 1, `blur ${width}x${height} radius ${radius} max ${blur.max}`);
      assert.ok(blur.mean < 0.01, `blur mean ${blur.mean}`);
      const sharpen = difference(
        applyFilterEffectsPixels(source, width, height, { type: 'smart-sharpen', amount: 100, radius }),
        referenceSmartSharpen(source, width, height, radius, 100),
      );
      assert.equal(sharpen.alpha, 0);
      // A one-level change in the bilateral reference moves the contrast gate
      // by 1/24, so a sharpened channel may move a few levels in rare spots.
      assert.ok(sharpen.max <= 12, `sharpen ${width}x${height} radius ${radius} max ${sharpen.max}`);
      assert.ok(sharpen.mean < 0.05, `sharpen mean ${sharpen.mean}`);
    }
});

test('fast kernels leave transparent pixels and the source buffer untouched', () => {
  const width = 40, height = 30;
  const source = fixture(width, height, 99);
  const copy = new Uint8ClampedArray(source);
  for (const effect of [
    { type: 'smart-blur', radius: 8 }, { type: 'smart-sharpen', radius: 8 }, { type: 'surface-blur', radius: 8 },
    { type: 'shape-blur', radius: 12 }, { type: 'reduce-noise', radius: 8 }, { type: 'lens-blur', radius: 20 },
    { type: 'radial-blur', radius: 30 }, { type: 'spin-blur', radius: 30 }, { type: 'path-blur', radius: 30 },
  ]) {
    const output = applyFilterEffectsPixels(source, width, height, { ...effect, amount: 100 });
    assert.deepEqual(source, copy, `${effect.type} must not mutate its input`);
    for (let offset = 0; offset < source.length; offset += 4) {
      assert.equal(output[offset + 3], source[offset + 3], `${effect.type} alpha`);
      if (!source[offset + 3])
        assert.deepEqual([...output.subarray(offset, offset + 4)], [...source.subarray(offset, offset + 4)], `${effect.type} hidden RGB`);
    }
  }
});

test('tiled renders of the fast local blurs match the full-frame result exactly', async () => {
  const width = 520, height = 300;
  const source = fixture(width, height, 7);
  for (const effect of [
    { type: 'smart-blur', amount: 100, radius: 8 },
    { type: 'surface-blur', amount: 100, radius: 8 },
    { type: 'shape-blur', amount: 100, radius: 12 },
    { type: 'lens-blur', amount: 100, radius: 21 },
  ]) {
    const destination = new Uint8ClampedArray(source.length);
    await renderTiledNeighborhoodEffect(
      width,
      height,
      effect,
      (tile) => readTile(source, width, height, tile),
      (pixels, tile) => {
        for (let row = 0; row < tile.height; row += 1) {
          const from = ((tile.y - tile.readY + row) * tile.readWidth + (tile.x - tile.readX)) * 4;
          destination.set(pixels.subarray(from, from + tile.width * 4), ((tile.y + row) * width + tile.x) * 4);
        }
      },
      { revision: `fast-${effect.type}`, tileSize: 256, maxWorkingBytes: 2 * 512 * 512 * 4 },
    );
    assert.deepEqual(destination, applyFilterEffectsPixels(source, width, height, effect), effect.type);
  }
});

test('performance smoke: 1000x1000 Smart Blur, Reduce Noise and Shape Blur at their caps', () => {
  // On a development machine these took 11-14 s (Smart Blur, Reduce Noise)
  // and ~4 s (Shape Blur) before; generous bounds tolerate slow CI runners.
  const source = fixture(1000, 1000, 5);
  for (const [effect, bound] of [
    [{ type: 'smart-blur', amount: 100, radius: 8 }, 15_000],
    [{ type: 'reduce-noise', amount: 100, radius: 8 }, 15_000],
    [{ type: 'shape-blur', amount: 100, radius: 12 }, 6_000],
    [{ type: 'radial-blur', amount: 100, radius: 64 }, 6_000],
  ]) {
    const started = performance.now();
    applyFilterEffectsPixels(source, 1000, 1000, effect);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < bound, `${effect.type} took ${Math.round(elapsed)} ms`);
  }
});
