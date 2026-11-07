/**
 * Fast kernels for the neighbourhood filters that used to dominate large
 * renders (Smart Blur / Smart Sharpen, Surface Blur, Shape Blur, Reduce
 * Noise, Lens Blur and the Radial / Spin / Path blurs).
 *
 * Each kernel keeps the arithmetic of the per-pixel implementation it
 * replaced; `tests/fast-remaining-filters.test.mjs` keeps those originals as
 * oracles. Surface Blur, Reduce Noise, Lens Blur, Zoom Radial Blur and both
 * Path Blur modes are byte-identical. Documented exceptions:
 *
 * - Smart Blur (and Smart Sharpen, which uses it as its reference) factors
 *   the range weight `exp(-|Lq - Lp| / s)` into per-pixel exponentials, so
 *   sums differ from the original in the last floating-point bits and a
 *   channel can round one level differently.
 * - Shape Blur sums exact integers, so a weighted mean that sits on a .5
 *   rounding tie can round one level differently from the old
 *   floating-point sum.
 * - Spin-style Radial Blur and Spin Blur rotate the pixel offset with a
 *   per-sample cosine/sine table instead of calling `cos`/`sin` of the summed
 *   angle, so a sample coordinate within ~1e-12 px of a rounding boundary can
 *   select the neighbouring source pixel.
 *
 * Hot loops live in per-row functions: V8 then optimises them as ordinary
 * functions instead of repeatedly entering and leaving on-stack-replaced
 * loops. Every kernel only reads its own fixed neighbourhood and clips at the
 * image bounds, so tiled and full-frame renders stay identical. None mutates
 * `source`; `output` starts as a copy of `source`.
 */

import type { BlurPathPoint, SpinBlurEllipse } from './filterEffects.ts';

const clampUnit = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const clampByte = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/** `byte / 255` for every byte value, computed exactly like the originals. */
const UNIT_ALPHA = (() => {
  const table = new Float64Array(256);
  for (let index = 0; index < 256; index += 1) table[index] = index / 255;
  return table;
})();

/** Rows processed per band; auxiliary planes are allocated per band only. */
const BAND_ROWS = 64;

/* ------------------------------------------------------------------ */
/* Padded bands shared by the bilateral-style kernels                  */
/* ------------------------------------------------------------------ */

/**
 * Planar float copies of one band of rows, padded by `pad` pixels on every
 * side. Padding (and any row outside the image) has alpha 0, so the inner
 * loops can always walk the full (2·pad + 1)² window: an out-of-image
 * sample contributes weight +0, exactly like the original bounds checks
 * that skipped it, while fixed loop bounds keep V8's inner loop tight.
 */
type PaddedBand = {
  pad: number;
  stride: number;
  luma: Float64Array;
  alpha: Float64Array;
  red: Float64Array;
  green: Float64Array;
  blue: Float64Array;
};

function createPaddedBand(width: number, height: number, pad: number): PaddedBand {
  const stride = width + pad * 2;
  const size = stride * (Math.min(BAND_ROWS, height) + pad * 2);
  return {
    pad,
    stride,
    luma: new Float64Array(size),
    alpha: new Float64Array(size),
    red: new Float64Array(size),
    green: new Float64Array(size),
    blue: new Float64Array(size),
  };
}

/** Load image rows [bandStart - pad, bandEnd + pad) into the padded band. */
function fillPaddedBand(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  bandStart: number,
  bandEnd: number,
  band: PaddedBand,
): void {
  const { pad, stride, luma, alpha, red, green, blue } = band;
  const rows = bandEnd - bandStart + pad * 2;
  luma.fill(0, 0, rows * stride);
  alpha.fill(0, 0, rows * stride);
  red.fill(0, 0, rows * stride);
  green.fill(0, 0, rows * stride);
  blue.fill(0, 0, rows * stride);
  for (let row = 0; row < rows; row += 1) {
    const y = bandStart - pad + row;
    if (y < 0 || y >= height) continue;
    let plane = row * stride + pad;
    for (let x = 0, offset = y * width * 4; x < width; x += 1, offset += 4, plane += 1) {
      const r = source[offset], g = source[offset + 1], b = source[offset + 2];
      luma[plane] = r * 0.2126 + g * 0.7152 + b * 0.0722;
      alpha[plane] = UNIT_ALPHA[source[offset + 3]];
      red[plane] = r;
      green[plane] = g;
      blue[plane] = b;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Smart Blur                                                          */
/* ------------------------------------------------------------------ */

function smartBlurRow(
  source: Uint8ClampedArray,
  width: number,
  y: number,
  bandStart: number,
  band: PaddedBand,
  range: Float64Array,
  factors: Float64Array,
  spatial: Float64Array,
  scale: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const { pad, stride, luma, red: reds, green: greens, blue: blues } = band;
  const keep = 1 - strength;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    const centre = (y - bandStart + pad) * stride + x + pad;
    const target = luma[centre];
    // factors[0] scales samples at or below the target luma, factors[1]
    // samples above it: exp(-|Lq - Lp|/s) = factors[above]·range[2q + above].
    factors[0] = Math.exp(-target / scale);
    factors[1] = Math.exp(target / scale);
    let red = 0, green = 0, blue = 0, weight = 0, tap = 0;
    for (let dy = -pad; dy <= pad; dy += 1) {
      let sample = centre + dy * stride - pad;
      for (let dx = -pad; dx <= pad; dx += 1, sample += 1, tap += 1) {
        // Branch-free side selection: the luma comparison is unpredictable
        // on textured images, and a mispredicted branch costs more than
        // the two table reads.
        const above = +(luma[sample] > target);
        const sampleWeight = spatial[tap] * range[sample * 2 + above] * factors[above];
        red += reds[sample] * sampleWeight;
        green += greens[sample] * sampleWeight;
        blue += blues[sample] * sampleWeight;
        weight += sampleWeight;
      }
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * keep + (red / weight) * strength);
    output[destination + 1] = clampByte(source[destination + 1] * keep + (green / weight) * strength);
    output[destination + 2] = clampByte(source[destination + 2] * keep + (blue / weight) * strength);
  }
}

/**
 * Edge-preserving bilateral blur (Smart Blur). The spatial Gaussian is
 * tabulated and the Laplacian range weight is factored per pixel:
 * exp(-|Lq - Lp| / s) = exp(-Lp / s)·exp(Lq / s) when Lq ≤ Lp, and
 * exp(Lp / s)·exp(-Lq / s) otherwise. The inner loop therefore needs no
 * transcendental call and no data-dependent branch.
 */
export function fastSmartBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const scale = 18 + bounded * 2;
  const side = bounded * 2 + 1;
  const spatial = new Float64Array(side * side);
  for (let dy = -bounded; dy <= bounded; dy += 1)
    for (let dx = -bounded; dx <= bounded; dx += 1)
      spatial[(dy + bounded) * side + dx + bounded] = Math.exp(-(dx * dx + dy * dy) / (2 * bounded * bounded));
  const band = createPaddedBand(width, height, bounded);
  // Interleaved per sample: [alpha·exp(L/s), alpha·exp(-L/s)]; padding is 0.
  const range = new Float64Array(band.luma.length * 2);
  const factors = new Float64Array(2);
  for (let bandStart = 0; bandStart < height; bandStart += BAND_ROWS) {
    const bandEnd = Math.min(height, bandStart + BAND_ROWS);
    fillPaddedBand(source, width, height, bandStart, bandEnd, band);
    const count = (bandEnd - bandStart + bounded * 2) * band.stride;
    for (let sample = 0; sample < count; sample += 1) {
      const alpha = band.alpha[sample], value = band.luma[sample];
      range[sample * 2] = alpha ? alpha * Math.exp(value / scale) : 0;
      range[sample * 2 + 1] = alpha ? alpha * Math.exp(-value / scale) : 0;
    }
    for (let y = bandStart; y < bandEnd; y += 1)
      smartBlurRow(source, width, y, bandStart, band, range, factors, spatial, scale, output, strength);
  }
}

/* ------------------------------------------------------------------ */
/* Surface Blur                                                        */
/* ------------------------------------------------------------------ */

function surfaceBlurRow(
  source: Uint8ClampedArray,
  width: number,
  y: number,
  bandStart: number,
  band: PaddedBand,
  spatial: Float64Array,
  threshold: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const { pad, stride, luma, alpha, red: reds, green: greens, blue: blues } = band;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (!source[destination + 3]) continue;
    const centre = (y - bandStart + pad) * stride + x + pad;
    const target = luma[centre];
    let red = 0, green = 0, blue = 0, weight = 0, tap = 0;
    for (let dy = -pad; dy <= pad; dy += 1) {
      let sample = centre + dy * stride - pad;
      for (let dx = -pad; dx <= pad; dx += 1, sample += 1, tap += 1) {
        // Branch-free threshold: tonal noise makes this test unpredictable.
        // A rejected, transparent or out-of-image sample gets weight +0,
        // which leaves every sum unchanged, and ×1 keeps a weight exact.
        const inside = +(Math.abs(luma[sample] - target) <= threshold);
        const sampleWeight = spatial[tap] * alpha[sample] * inside;
        red += reds[sample] * sampleWeight;
        green += greens[sample] * sampleWeight;
        blue += blues[sample] * sampleWeight;
        weight += sampleWeight;
      }
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * (1 - strength) + (red / weight) * strength);
    output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / weight) * strength);
    output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / weight) * strength);
  }
}

/**
 * Surface Blur with a hard luminance threshold. Byte-identical to the
 * per-pixel original: every accepted sample uses the same operands in the
 * same accumulation order, and every skipped sample now adds +0.
 */
export function fastSurfaceBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const threshold = 12 + bounded * 3;
  const side = bounded * 2 + 1;
  const spatial = new Float64Array(side * side);
  for (let dy = -bounded; dy <= bounded; dy += 1)
    for (let dx = -bounded; dx <= bounded; dx += 1)
      spatial[(dy + bounded) * side + dx + bounded] = 1 / (1 + dx * dx + dy * dy);
  const band = createPaddedBand(width, height, bounded);
  for (let bandStart = 0; bandStart < height; bandStart += BAND_ROWS) {
    const bandEnd = Math.min(height, bandStart + BAND_ROWS);
    fillPaddedBand(source, width, height, bandStart, bandEnd, band);
    for (let y = bandStart; y < bandEnd; y += 1)
      surfaceBlurRow(source, width, y, bandStart, band, spatial, threshold, output, strength);
  }
}

/* ------------------------------------------------------------------ */
/* Shape Blur                                                          */
/* ------------------------------------------------------------------ */

/** Fill one ring slot with the double prefix sums S2 of a source row. */
function shapePrefixRow(
  source: Uint8ClampedArray,
  width: number,
  row: number,
  pad: number,
  length: number,
  ring: Float64Array,
  base: number,
): void {
  let s1r = 0, s1g = 0, s1b = 0, s1a = 0;
  let s2r = 0, s2g = 0, s2b = 0, s2a = 0;
  // S2[0] = 0; S2[i + 1] = S2[i] + S1[i]; S1[i + 1] = S1[i] + I[i - pad].
  ring[base] = 0; ring[base + 1] = 0; ring[base + 2] = 0; ring[base + 3] = 0;
  const rowOffset = row * width * 4;
  for (let index = 0; index < length; index += 1) {
    s2r += s1r; s2g += s1g; s2b += s1b; s2a += s1a;
    const out = base + (index + 1) * 4;
    ring[out] = s2r; ring[out + 1] = s2g; ring[out + 2] = s2b; ring[out + 3] = s2a;
    const x = index - pad;
    if (x >= 0 && x < width) {
      const offset = rowOffset + x * 4;
      const alpha = source[offset + 3];
      if (alpha) {
        s1r += source[offset] * alpha;
        s1g += source[offset + 1] * alpha;
        s1b += source[offset + 2] * alpha;
        s1a += alpha;
      }
    }
  }
}

function shapeBlurRow(
  source: Uint8ClampedArray,
  width: number,
  y: number,
  rowMin: number,
  rowMax: number,
  bounded: number,
  pad: number,
  stride: number,
  ring: Float64Array,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const ringSize = bounded * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (!source[destination + 3]) continue;
    const position = x + pad;
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let row = rowMin; row <= rowMax; row += 1) {
      const tent = bounded + 1 - (row < y ? y - row : row - y);
      const base = (row % ringSize) * stride;
      const ahead = base + (position + tent + 1) * 4;
      const middle = base + (position + 1) * 4;
      const behind = base + (position - tent + 1) * 4;
      red += ring[ahead] - 2 * ring[middle] + ring[behind];
      green += ring[ahead + 1] - 2 * ring[middle + 1] + ring[behind + 1];
      blue += ring[ahead + 2] - 2 * ring[middle + 2] + ring[behind + 2];
      weight += ring[ahead + 3] - 2 * ring[middle + 3] + ring[behind + 3];
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * (1 - strength) + (red / weight) * strength);
    output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / weight) * strength);
    output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / weight) * strength);
  }
}

/**
 * Shape Blur: alpha-weighted diamond pyramid kernel (b + 1 - |dx| - |dy|).
 * Each kernel row is a 1-D tent of half-width m = b + 1 - |dy|, and a tent is
 * a second difference of the row's double prefix sum:
 * Σ (m - |j|)·I[x + j] = S2[x + m + 1] - 2·S2[x + 1] + S2[x - m + 1].
 * Sums are exact integers (premultiplied colour and alpha bytes), so the
 * cost is O(radius) per pixel and independent of tiling.
 */
export function fastShapeBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(12, Math.round(radius)));
  const pad = bounded + 2;
  const length = width + pad * 2;
  const stride = (length + 1) * 4;
  const ringSize = bounded * 2 + 1;
  // Ring of double prefix sums, interleaved [R·A, G·A, B·A, A] per position.
  const ring = new Float64Array(ringSize * stride);
  const ringRow = new Int32Array(ringSize).fill(-1);
  for (let y = 0; y < height; y += 1) {
    const rowMin = Math.max(0, y - bounded), rowMax = Math.min(height - 1, y + bounded);
    for (let row = rowMin; row <= rowMax; row += 1) {
      const slot = row % ringSize;
      if (ringRow[slot] === row) continue;
      ringRow[slot] = row;
      shapePrefixRow(source, width, row, pad, length, ring, slot * stride);
    }
    shapeBlurRow(source, width, y, rowMin, rowMax, bounded, pad, stride, ring, output, strength);
  }
}

/* ------------------------------------------------------------------ */
/* Reduce Noise                                                        */
/* ------------------------------------------------------------------ */

/** Colour given to transparent / padding samples so they never look similar. */
const HIDDEN_COLOUR = 1024;

function reduceNoiseRow(
  source: Uint8ClampedArray,
  width: number,
  y: number,
  bandStart: number,
  band: PaddedBand,
  similarity: Float64Array,
  spatial: Float64Array,
  output: Uint8ClampedArray,
  mix: number,
): void {
  const { pad, stride, red: reds, green: greens, blue: blues } = band;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (!source[destination + 3]) continue;
    const baseR = source[destination], baseG = source[destination + 1], baseB = source[destination + 2];
    const centre = (y - bandStart + pad) * stride + x + pad;
    let sumR = 0, sumG = 0, sumB = 0, weight = 0, tap = 0;
    for (let dy = -pad; dy <= pad; dy += 1) {
      let sample = centre + dy * stride - pad;
      for (let dx = -pad; dx <= pad; dx += 1, sample += 1, tap += 1) {
        const red = reds[sample], green = greens[sample], blue = blues[sample];
        // No branches: transparent and out-of-image samples carry the
        // HIDDEN_COLOUR sentinel, so their distance always lands on a zero
        // similarity. A zero weight adds +0, which leaves every sum unchanged.
        const distance = Math.abs(red - baseR) + Math.abs(green - baseG) + Math.abs(blue - baseB);
        const sampleWeight = similarity[distance] * spatial[tap];
        sumR += red * sampleWeight;
        sumG += green * sampleWeight;
        sumB += blue * sampleWeight;
        weight += sampleWeight;
      }
    }
    if (!weight) continue;
    output[destination] = clampByte(baseR + (sumR / weight - baseR) * mix);
    output[destination + 1] = clampByte(baseG + (sumG / weight - baseG) * mix);
    output[destination + 2] = clampByte(baseB + (sumB / weight - baseB) * mix);
  }
}

/**
 * Reduce Noise: colour-distance-weighted kernel. The L1 colour distance is
 * an integer, so the similarity ramp is a lookup table, and the spatial
 * weight is tabulated with the same `Math.hypot` call. Byte-identical.
 */
export function fastReduceNoise(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radiusValue: number,
  thresholdValue: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const radius = Math.max(1, Math.min(8, Math.round(radiusValue)));
  const preserve = Math.max(1, Math.min(255, Math.round(thresholdValue)));
  const mix = clampUnit(strength);
  // Any distance from a visible colour to the sentinel exceeds 765 ≥ 3·preserve.
  const similarity = new Float64Array(HIDDEN_COLOUR * 3 + 1);
  for (let distance = 0; distance < similarity.length; distance += 1)
    similarity[distance] = Math.max(0, 1 - distance / (preserve * 3));
  const side = radius * 2 + 1;
  const spatial = new Float64Array(side * side);
  for (let dy = -radius; dy <= radius; dy += 1)
    for (let dx = -radius; dx <= radius; dx += 1)
      spatial[(dy + radius) * side + dx + radius] = 1 / (1 + Math.hypot(dx, dy));
  const band = createPaddedBand(width, height, radius);
  for (let bandStart = 0; bandStart < height; bandStart += BAND_ROWS) {
    const bandEnd = Math.min(height, bandStart + BAND_ROWS);
    fillPaddedBand(source, width, height, bandStart, bandEnd, band);
    const count = (bandEnd - bandStart + radius * 2) * band.stride;
    for (let sample = 0; sample < count; sample += 1)
      if (!band.alpha[sample]) {
        band.red[sample] = HIDDEN_COLOUR;
        band.green[sample] = HIDDEN_COLOUR;
        band.blue[sample] = HIDDEN_COLOUR;
      }
    for (let y = bandStart; y < bandEnd; y += 1)
      reduceNoiseRow(source, width, y, bandStart, band, similarity, spatial, output, mix);
  }
}

/* ------------------------------------------------------------------ */
/* Lens Blur                                                           */
/* ------------------------------------------------------------------ */

function lensBlurRow(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  reach: number,
  tapX: Int32Array,
  tapY: Int32Array,
  tapWeight: Int32Array,
  tapOffset: Int32Array,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const count = tapX.length;
  const rowInside = y - reach >= 0 && y + reach < height;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    let red = 0, green = 0, blue = 0, weight = 0;
    if (rowInside && x - reach >= 0 && x + reach < width) {
      for (let tap = 0; tap < count; tap += 1) {
        const offset = destination + tapOffset[tap];
        const alpha = source[offset + 3] * tapWeight[tap];
        red += source[offset] * alpha;
        green += source[offset + 1] * alpha;
        blue += source[offset + 2] * alpha;
        weight += alpha;
      }
    } else {
      for (let tap = 0; tap < count; tap += 1) {
        let sx = x + tapX[tap], sy = y + tapY[tap];
        sx = sx < 0 ? 0 : sx >= width ? width - 1 : sx;
        sy = sy < 0 ? 0 : sy >= height ? height - 1 : sy;
        const offset = (sy * width + sx) * 4;
        const alpha = source[offset + 3] * tapWeight[tap];
        red += source[offset] * alpha;
        green += source[offset + 1] * alpha;
        blue += source[offset + 2] * alpha;
        weight += alpha;
      }
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * (1 - strength) + red / weight * strength);
    output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + green / weight * strength);
    output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + blue / weight * strength);
  }
}

/**
 * Lens Blur over the fixed 49-sample golden-angle aperture. Sums are exact
 * integers, so duplicate offsets are merged into integer weights and interior
 * pixels use precomputed linear offsets without clamping. Byte-identical.
 */
export function fastLensBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  offsets: ReadonlyArray<readonly [number, number]>,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const merged = new Map<string, [number, number, number]>();
  for (const [dx, dy] of offsets) {
    const key = `${dx},${dy}`;
    const entry = merged.get(key);
    if (entry) entry[2] += 1;
    else merged.set(key, [dx, dy, 1]);
  }
  const taps = [...merged.values()];
  const tapX = new Int32Array(taps.length), tapY = new Int32Array(taps.length);
  const tapWeight = new Int32Array(taps.length), tapOffset = new Int32Array(taps.length);
  let reach = 0;
  taps.forEach(([dx, dy, weight], index) => {
    tapX[index] = dx; tapY[index] = dy; tapWeight[index] = weight;
    tapOffset[index] = (dy * width + dx) * 4;
    reach = Math.max(reach, Math.abs(dx), Math.abs(dy));
  });
  for (let y = 0; y < height; y += 1)
    lensBlurRow(source, width, height, y, reach, tapX, tapY, tapWeight, tapOffset, output, strength);
}

/* ------------------------------------------------------------------ */
/* Radial (spin / zoom) and Spin Blur                                  */
/* ------------------------------------------------------------------ */

/**
 * Integrate one row of a spin blur. Each of the 17 taps rotates the centre
 * offset (dx, dy) by a fixed angle from a cosine/sine table, then rounds to
 * the nearest clamped source pixel like the original polar sampler. When
 * `ellipse` is set (Spin Blur), the blend is masked by a rotated, feathered
 * ellipse exactly like the original gallery kernel.
 */
function spinRow(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  centerPixelX: number,
  centerPixelY: number,
  cosines: Float64Array,
  sines: Float64Array,
  output: Uint8ClampedArray,
  mix: number,
  ellipse: Float64Array | undefined,
): void {
  const maxX = width - 1, maxY = height - 1;
  const taps = cosines.length;
  const dy = y - centerPixelY;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    const dx = x - centerPixelX;
    let blend = mix;
    if (ellipse) {
      // [cos, sin, radiusX, radiusY, feather]
      const rotatedX = dx * ellipse[0] + dy * ellipse[1];
      const rotatedY = -dx * ellipse[1] + dy * ellipse[0];
      const ellipseDistance = Math.hypot(rotatedX / ellipse[2], rotatedY / ellipse[3]);
      if (ellipseDistance >= 1) continue;
      const feather = ellipse[4];
      if (!(feather <= 0 || ellipseDistance <= 1 - feather)) blend = mix * clampUnit((1 - ellipseDistance) / feather);
    }
    if (Math.hypot(dx, dy) < 0.5) continue;
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let tap = 0; tap < taps; tap += 1) {
      const cosine = cosines[tap], sine = sines[tap];
      let sx = Math.round(centerPixelX + dx * cosine - dy * sine);
      let sy = Math.round(centerPixelY + dx * sine + dy * cosine);
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      const offset = (sy * width + sx) * 4;
      const alpha = UNIT_ALPHA[source[offset + 3]];
      if (!alpha) continue;
      red += source[offset] * alpha;
      green += source[offset + 1] * alpha;
      blue += source[offset + 2] * alpha;
      weight += alpha;
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * (1 - blend) + (red / weight) * blend);
    output[destination + 1] = clampByte(source[destination + 1] * (1 - blend) + (green / weight) * blend);
    output[destination + 2] = clampByte(source[destination + 2] * (1 - blend) + (blue / weight) * blend);
    output[destination + 3] = source[destination + 3];
  }
}

/** One row of the zoom variant: taps scale the centre offset. */
function zoomRow(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  centerPixelX: number,
  centerPixelY: number,
  scales: Float64Array,
  output: Uint8ClampedArray,
  mix: number,
): void {
  const maxX = width - 1, maxY = height - 1;
  const taps = scales.length;
  const dy = y - centerPixelY;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    const dx = x - centerPixelX;
    if (Math.hypot(dx, dy) < 0.5) continue;
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let tap = 0; tap < taps; tap += 1) {
      const scale = scales[tap];
      let sx = Math.round(centerPixelX + dx * scale);
      let sy = Math.round(centerPixelY + dy * scale);
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      const offset = (sy * width + sx) * 4;
      const alpha = UNIT_ALPHA[source[offset + 3]];
      if (!alpha) continue;
      red += source[offset] * alpha;
      green += source[offset + 1] * alpha;
      blue += source[offset + 2] * alpha;
      weight += alpha;
    }
    if (!weight) continue;
    output[destination] = clampByte(source[destination] * (1 - mix) + (red / weight) * mix);
    output[destination + 1] = clampByte(source[destination + 1] * (1 - mix) + (green / weight) * mix);
    output[destination + 2] = clampByte(source[destination + 2] * (1 - mix) + (blue / weight) * mix);
    output[destination + 3] = source[destination + 3];
  }
}

function spinTaps(radius: number): [Float64Array, Float64Array] {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const sampleCount = 8;
  const sweep = (bounded * Math.PI) / 180;
  const cosines = new Float64Array(sampleCount * 2 + 1), sines = new Float64Array(sampleCount * 2 + 1);
  for (let sampleIndex = -sampleCount; sampleIndex <= sampleCount; sampleIndex += 1) {
    const angle = (sweep * sampleIndex) / sampleCount;
    cosines[sampleIndex + sampleCount] = Math.cos(angle);
    sines[sampleIndex + sampleCount] = Math.sin(angle);
  }
  return [cosines, sines];
}

/** Spin-mode Radial Blur around an editable centre (rotation-table taps). */
export function fastSpinRadialBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const [cosines, sines] = spinTaps(radius);
  const centerPixelX = clampUnit(centerX) * (width - 1), centerPixelY = clampUnit(centerY) * (height - 1);
  const mix = clampUnit(strength);
  for (let y = 0; y < height; y += 1)
    spinRow(source, width, height, y, centerPixelX, centerPixelY, cosines, sines, output, mix, undefined);
}

/** Blur Gallery Spin Blur limited to a rotated, feathered ellipse. */
export function fastEllipseSpinBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
  ellipse: SpinBlurEllipse,
): void {
  const [cosines, sines] = spinTaps(radius);
  const rotation = (ellipse.rotation * Math.PI) / 180;
  const shape = Float64Array.of(
    Math.cos(rotation),
    Math.sin(rotation),
    Math.max(1, ellipse.radiusX * width),
    Math.max(1, ellipse.radiusY * height),
    clampUnit(ellipse.feather),
  );
  const centerPixelX = clampUnit(centerX) * (width - 1), centerPixelY = clampUnit(centerY) * (height - 1);
  const mix = clampUnit(strength);
  for (let y = 0; y < height; y += 1)
    spinRow(source, width, height, y, centerPixelX, centerPixelY, cosines, sines, output, mix, shape);
}

/** Zoom-mode Radial Blur. Byte-identical: only allocation-free sampling. */
export function fastZoomRadialBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const sampleCount = 8;
  const spread = bounded / 64 * 0.65;
  const scales = new Float64Array(sampleCount * 2 + 1);
  for (let sampleIndex = -sampleCount; sampleIndex <= sampleCount; sampleIndex += 1)
    scales[sampleIndex + sampleCount] = 1 + (spread * sampleIndex) / sampleCount;
  const centerPixelX = clampUnit(centerX) * (width - 1), centerPixelY = clampUnit(centerY) * (height - 1);
  const mix = clampUnit(strength);
  for (let y = 0; y < height; y += 1)
    zoomRow(source, width, height, y, centerPixelX, centerPixelY, scales, output, mix);
}

/* ------------------------------------------------------------------ */
/* Path Blur                                                           */
/* ------------------------------------------------------------------ */

/**
 * Allocation-free equivalent of the original premultiplied bilinear sampler
 * followed by the path integrator's `alpha / 255` weighting. It reproduces
 * the sampler's rounded byte result exactly and accumulates into `sums`
 * ([red, green, blue, weight]).
 */
function accumulateBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  sums: Float64Array,
  rowOffset = 0,
): void {
  // `height` and `y` are in full-image rows; `source` may hold only a band
  // of rows starting at `rowOffset` (which must cover every sampled row).
  const maxX = width - 1, maxY = height - 1;
  const sampleX = x < 0 ? 0 : x > maxX ? maxX : x;
  const sampleY = y < 0 ? 0 : y > maxY ? maxY : y;
  const left = Math.floor(sampleX), top = Math.floor(sampleY);
  const right = left + 1 < maxX ? left + 1 : maxX;
  const bottom = top + 1 < maxY ? top + 1 : maxY;
  const tx = sampleX - left, ty = sampleY - top;
  const topRow = (top - rowOffset) * width, bottomRow = (bottom - rowOffset) * width;
  let alpha = 0, red = 0, green = 0, blue = 0;
  let offset = (topRow + left) * 4;
  let weight = (1 - tx) * (1 - ty) * UNIT_ALPHA[source[offset + 3]];
  alpha += weight; red += source[offset] * weight; green += source[offset + 1] * weight; blue += source[offset + 2] * weight;
  offset = (topRow + right) * 4;
  weight = tx * (1 - ty) * UNIT_ALPHA[source[offset + 3]];
  alpha += weight; red += source[offset] * weight; green += source[offset + 1] * weight; blue += source[offset + 2] * weight;
  offset = (bottomRow + left) * 4;
  weight = (1 - tx) * ty * UNIT_ALPHA[source[offset + 3]];
  alpha += weight; red += source[offset] * weight; green += source[offset + 1] * weight; blue += source[offset + 2] * weight;
  offset = (bottomRow + right) * 4;
  weight = tx * ty * UNIT_ALPHA[source[offset + 3]];
  alpha += weight; red += source[offset] * weight; green += source[offset + 1] * weight; blue += source[offset + 2] * weight;
  if (alpha <= 0) return;
  const sampleAlpha = UNIT_ALPHA[clampByte(alpha * 255)];
  if (!sampleAlpha) return;
  sums[0] += clampByte(red / alpha) * sampleAlpha;
  sums[1] += clampByte(green / alpha) * sampleAlpha;
  sums[2] += clampByte(blue / alpha) * sampleAlpha;
  sums[3] += sampleAlpha;
}

function blendSums(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  destination: number,
  sums: Float64Array,
  blend: number,
): void {
  const weight = sums[3];
  if (!weight) return;
  output[destination] = clampByte(source[destination] * (1 - blend) + (sums[0] / weight) * blend);
  output[destination + 1] = clampByte(source[destination + 1] * (1 - blend) + (sums[1] / weight) * blend);
  output[destination + 2] = clampByte(source[destination + 2] * (1 - blend) + (sums[2] / weight) * blend);
  output[destination + 3] = source[destination + 3];
}

type PathSegments = {
  count: number;
  startX: Float64Array; startY: Float64Array;
  deltaX: Float64Array; deltaY: Float64Array;
  lengthSquared: Float64Array; lengths: Float64Array;
  speedStart: Float64Array; speedEnd: Float64Array;
  tangentX: Float64Array; tangentY: Float64Array;
  totalLength: number;
};

function pathBlurRow(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  segments: PathSegments,
  bounded: number,
  first: number,
  steps: Float64Array,
  taperAmount: number,
  sums: Float64Array,
  output: Uint8ClampedArray,
  mix: number,
): void {
  const { count, startX, startY, deltaX, deltaY, lengthSquared, lengths, speedStart, speedEnd, tangentX, tangentY, totalLength } = segments;
  const reach = Math.max(1, bounded * 2);
  const sampleCount = (steps.length - 1) / 2;
  for (let x = 0; x < width; x += 1) {
    const destination = (y * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    let bestDistance = Infinity, bestT = 0, best = 0, distanceAlong = 0, bestDistanceAlong = 0;
    for (let segment = 0; segment < count; segment += 1) {
      const projection = clampUnit(((x - startX[segment]) * deltaX[segment] + (y - startY[segment]) * deltaY[segment]) / lengthSquared[segment]);
      const nearestX = startX[segment] + deltaX[segment] * projection;
      const nearestY = startY[segment] + deltaY[segment] * projection;
      const distance = Math.hypot(x - nearestX, y - nearestY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = projection;
        best = segment;
        bestDistanceAlong = distanceAlong + lengths[segment] * projection;
      }
      distanceAlong += lengths[segment];
    }
    const influence = clampUnit(1 - bestDistance / reach);
    if (influence <= 0) continue;
    const speed = (speedStart[best] + (speedEnd[best] - speedStart[best]) * bestT) / 100;
    const taperDistance = totalLength > 0 ? bestDistanceAlong / totalLength : 0;
    const taper = 1 - taperAmount * Math.max(taperDistance, 1 - taperDistance);
    const length = bounded * Math.max(0, speed) * taper;
    if (length < 0.5) continue;
    const stepX = tangentX[best] * length, stepY = tangentY[best] * length;
    sums[0] = 0; sums[1] = 0; sums[2] = 0; sums[3] = 0;
    for (let index = first; index <= sampleCount; index += 1) {
      const t = steps[index + sampleCount];
      accumulateBilinear(source, width, height, x + stepX * t, y + stepY * t, sums);
    }
    blendSums(source, output, destination, sums, mix * influence);
  }
}

/** Path Blur along authored points. Byte-identical to the original. */
export function fastPathBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  angle: number,
  output: Uint8ClampedArray,
  strength: number,
  path: BlurPathPoint[],
  pathCentered: boolean,
  pathTaper: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const points = path.map((point) => ({ x: point.x * (width - 1), y: point.y * (height - 1), speed: point.speed }));
  const count = points.length - 1;
  const segments: PathSegments = {
    count,
    startX: new Float64Array(count), startY: new Float64Array(count),
    deltaX: new Float64Array(count), deltaY: new Float64Array(count),
    lengthSquared: new Float64Array(count), lengths: new Float64Array(count),
    speedStart: new Float64Array(count), speedEnd: new Float64Array(count),
    tangentX: new Float64Array(count), tangentY: new Float64Array(count),
    totalLength: 0,
  };
  for (let index = 0; index < count; index += 1) {
    const start = points[index], end = points[index + 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    segments.startX[index] = start.x; segments.startY[index] = start.y;
    segments.deltaX[index] = dx; segments.deltaY[index] = dy;
    segments.lengthSquared[index] = Math.max(1e-6, dx * dx + dy * dy);
    segments.lengths[index] = Math.hypot(dx, dy);
    segments.speedStart[index] = start.speed; segments.speedEnd[index] = end.speed;
    // The tangent depends only on the segment, so cos/sin run once per segment.
    const direction = Math.atan2(dy, dx) + (angle * Math.PI) / 180;
    segments.tangentX[index] = Math.cos(direction); segments.tangentY[index] = Math.sin(direction);
  }
  for (let index = 0; index < count; index += 1) segments.totalLength += segments.lengths[index];
  const sampleCount = 8;
  const steps = new Float64Array(sampleCount * 2 + 1);
  for (let index = -sampleCount; index <= sampleCount; index += 1) steps[index + sampleCount] = index / sampleCount;
  const sums = new Float64Array(4);
  const mix = clampUnit(strength), taperAmount = clampUnit(pathTaper);
  const first = pathCentered ? -sampleCount : 0;
  for (let y = 0; y < height; y += 1)
    pathBlurRow(source, width, height, y, segments, bounded, first, steps, taperAmount, sums, output, mix);
}

function legacyPathRow(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  rowOffset: number,
  y: number,
  reachX: number,
  reachY: number,
  normalX: number,
  normalY: number,
  centrePixelX: number,
  centrePixelY: number,
  maxDimension: number,
  bounded: number,
  steps: Float64Array,
  sums: Float64Array,
  output: Uint8ClampedArray,
  mix: number,
): void {
  const taps = steps.length;
  for (let x = 0; x < width; x += 1) {
    const destination = ((y - rowOffset) * width + x) * 4;
    if (source[destination + 3] === 0) continue;
    // Points farther from the centre bend more strongly.
    const centreOffset = ((x - centrePixelX) * normalX + (y - centrePixelY) * normalY) / maxDimension;
    const curve = Math.max(-1, Math.min(1, centreOffset)) * bounded * 0.85;
    const bendX = normalX * curve, bendY = normalY * curve;
    sums[0] = 0; sums[1] = 0; sums[2] = 0; sums[3] = 0;
    for (let tap = 0; tap < taps; tap += 1) {
      const t = steps[tap];
      accumulateBilinear(source, width, height, x + reachX * t + bendX * t * t, y + reachY * t + bendY * t * t, sums, rowOffset);
    }
    blendSums(source, output, destination, sums, mix);
  }
}

/**
 * Vertical reach of legacy Path Blur in rows: the tangent moves a sample by
 * at most `bounded` rows and the bend by at most 0.85·`bounded`, plus one row
 * for the bilinear neighbour.
 */
export function legacyPathBlurReach(radius: number): number {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  return Math.ceil(bounded * 1.85) + 2;
}

/**
 * Legacy centre/angle Path Blur (records without points). Byte-identical.
 *
 * With `band`, `source`/`output` hold only image rows
 * [band.rowOffset, band.rowOffset + height) of an image `band.fullHeight`
 * rows tall, and only rows [band.start, band.end) are rendered. Geometry is
 * computed in full-image coordinates, so a band whose rows cover
 * `legacyPathBlurReach` around its output rows matches the full render.
 */
export function fastLegacyPathBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  angle: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
  band?: { rowOffset: number; fullHeight: number; start: number; end: number },
): void {
  const rowOffset = band?.rowOffset ?? 0;
  const fullHeight = band?.fullHeight ?? height;
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const radians = (angle * Math.PI) / 180;
  const tangentX = Math.cos(radians), tangentY = Math.sin(radians);
  const normalX = -tangentY, normalY = tangentX;
  const centrePixelX = clampUnit(centerX) * (width - 1);
  const centrePixelY = clampUnit(centerY) * (fullHeight - 1);
  const maxDimension = Math.max(1, Math.max(width, fullHeight));
  const sampleCount = 8;
  const steps = new Float64Array(sampleCount * 2 + 1);
  for (let index = -sampleCount; index <= sampleCount; index += 1) steps[index + sampleCount] = index / sampleCount;
  const sums = new Float64Array(4);
  const mix = clampUnit(strength);
  const start = band?.start ?? 0, end = band?.end ?? height;
  for (let y = start; y < end; y += 1)
    legacyPathRow(
      source, width, fullHeight, rowOffset, y, tangentX * bounded, tangentY * bounded, normalX, normalY,
      centrePixelX, centrePixelY, maxDimension, bounded, steps, sums, output, mix,
    );
}
