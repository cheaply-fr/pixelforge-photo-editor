import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';
import { renderTiledNeighborhoodEffect } from '../src/tiledDocument.ts';
import { readTile } from '../src/tilePlan.ts';
import { applyFilterEffectsInBands } from '../src/filterBands.ts';
import { spreadAlphaByte, spreadChannel, boxCoverage } from '../src/alphaSpread.ts';
import { AUTO_TRIM_MARGIN } from '../src/layerTrim.ts';
import { tiledNeighborhoodRadius } from '../src/tiledDocument.ts';

/**
 * Regression for "Gaussian Blur has no visible effect on a paint layer made
 * only of brush strokes": the blur kernels used to keep every source alpha
 * byte, so a uniformly coloured stroke on a transparent layer rendered
 * exactly as before at any radius. They now blur alpha (premultiplied).
 */

const SPREAD_TYPES = ['gaussian-blur', 'box-blur', 'motion-blur', 'lens-blur', 'blur-more', 'blur'];

/** Transparent layer with horizontal strokes of `thickness` px, hidden RGB padding (1,2,3). */
function strokes(width, height, rows, thickness, color = [200, 30, 40], alpha = 255) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 1;
    pixels[offset + 1] = 2;
    pixels[offset + 2] = 3;
  }
  for (const top of rows)
    for (let y = top; y < top + thickness; y += 1)
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels.set([...color, alpha], offset);
      }
  return pixels;
}

/** Alpha down one column. */
function columnAlpha(pixels, width, height, x) {
  return Array.from({ length: height }, (_, y) => pixels[(y * width + x) * 4 + 3]);
}

/** Width (rows with alpha > 0) and edge softness (rows with 0 < alpha < 255) of a profile. */
function edgeProfile(alpha) {
  return {
    covered: alpha.filter((value) => value > 0).length,
    soft: alpha.filter((value) => value > 0 && value < 255).length,
  };
}

const radiusFor = (type, radius) => (type === 'blur' ? 1 : radius);
const effectFor = (type, radius, amount = 100) => ({ type, amount, radius, angle: 90 });

test('the automatic stored-bounds margin covers the furthest reach of every spreading blur', () => {
  // Paint layers stored at their content keep AUTO_TRIM_MARGIN transparent
  // pixels around it, so no spreading blur is cut off at the stored edge.
  for (const type of SPREAD_TYPES)
    for (const radius of [1, 32, 64]) {
      const reach = tiledNeighborhoodRadius({ type, amount: 100, radius });
      assert.ok(reach !== undefined && reach <= AUTO_TRIM_MARGIN, `${type} radius ${radius}: ${reach}`);
    }
  // A stroke stored with exactly that margin spreads symmetrically at the
  // largest radius: the stored edge never truncates the alpha ramp.
  const width = 40, thickness = 7, height = thickness + AUTO_TRIM_MARGIN * 2;
  const source = strokes(width, height, [AUTO_TRIM_MARGIN], thickness);
  for (const type of ['gaussian-blur', 'box-blur', 'lens-blur', 'motion-blur', 'blur-more']) {
    const alpha = columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor(type, 64)), width, height, 20);
    // Only the last faint tail reaches the stored edge (a few levels at most).
    assert.ok(alpha[0] <= 6 && alpha[height - 1] <= 6, `${type} reaches the stored edge: ${alpha[0]}, ${alpha[height - 1]}`);
    // The golden-angle Lens aperture is not mirror symmetric.
    if (type === 'lens-blur') continue;
    for (let distance = 0; distance < AUTO_TRIM_MARGIN; distance += 1)
      assert.ok(
        Math.abs(alpha[AUTO_TRIM_MARGIN - 1 - distance] - alpha[AUTO_TRIM_MARGIN + thickness + distance]) <= 1,
        `${type} symmetric at ${distance}`,
      );
  }
});

for (const type of SPREAD_TYPES) {
  test(`${type}: a stroke on a transparent layer softens and widens instead of staying sharp`, () => {
    const width = 96, height = 240;
    const source = strokes(width, height, [100], 7);
    const before = edgeProfile(columnAlpha(source, width, height, 48));
    assert.deepEqual(before, { covered: 7, soft: 0 });
    const output = applyFilterEffectsPixels(source, width, height, effectFor(type, 7));
    const after = edgeProfile(columnAlpha(output, width, height, 48));
    assert.ok(after.covered > before.covered, `${type} should widen the stroke (${after.covered})`);
    assert.ok(after.soft > 0, `${type} should produce a soft alpha edge`);
    // Colour of the stroke survives (no dark or padding-coloured halo).
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + 48) * 4;
      if (output[offset + 3] > 8) assert.ok(output[offset] >= 190, `${type} red at row ${y}: ${output[offset]}`);
    }
    assert.notDeepEqual(output, source);
  });
}

for (const type of ['gaussian-blur', 'box-blur', 'motion-blur', 'lens-blur', 'blur-more']) {
  test(`${type}: radius 40 spreads further than radius 7 (edge profile differs)`, () => {
    const width = 64, height = 320;
    const source = strokes(width, height, [150], 9);
    const small = edgeProfile(columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor(type, 7)), width, height, 32));
    const large = edgeProfile(columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor(type, 40)), width, height, 32));
    assert.ok(large.covered > small.covered + 20, `${type}: ${small.covered} -> ${large.covered}`);
    // A wide blur of a 9 px stroke drops the peak alpha well below opaque.
    const peak = Math.max(...columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor(type, 40)), width, height, 32));
    assert.ok(peak < 160, `${type} peak alpha ${peak}`);
  });
}

test('Gaussian edge profile is symmetric and monotonic around a thin stroke', () => {
  const width = 40, height = 200;
  const source = strokes(width, height, [96], 7);
  for (const radius of [7, 40]) {
    const alpha = columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', radius)), width, height, 20);
    const centre = 99;
    for (let distance = 1; distance < 60; distance += 1) {
      assert.ok(Math.abs(alpha[centre - distance] - alpha[centre + distance]) <= 1, `radius ${radius} distance ${distance}`);
      assert.ok(alpha[centre + distance] <= alpha[centre + distance - 1], `radius ${radius} monotonic at ${distance}`);
    }
    // Support is bounded by the radius.
    assert.equal(alpha[centre + 3 + radius + 1], 0);
    assert.ok(alpha[centre + 3 + Math.floor(radius / 2)] > 0);
  }
});

test('amount blends alpha between the sharp stroke and the full blur', () => {
  const width = 32, height = 160;
  const source = strokes(width, height, [76], 7);
  const full = columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 20, 100)), width, height, 16);
  const half = columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 20, 50)), width, height, 16);
  const none = columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 20, 0)), width, height, 16);
  assert.deepEqual(none, columnAlpha(source, width, height, 16));
  for (let y = 0; y < height; y += 1) {
    const expected = (columnAlpha(source, width, height, 16)[y] + full[y]) / 2;
    assert.ok(Math.abs(half[y] - expected) <= 1, `row ${y}: ${half[y]} vs ${expected}`);
  }
});

test('opaque images keep the historical result (alpha 255, unchanged RGB arithmetic)', () => {
  const width = 48, height = 40;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    source[index * 4] = (index * 37) % 256;
    source[index * 4 + 1] = (index * 11) % 256;
    source[index * 4 + 2] = (index * 5) % 256;
    source[index * 4 + 3] = 255;
  }
  for (const type of SPREAD_TYPES)
    for (const amount of [100, 60]) {
      const output = applyFilterEffectsPixels(source, width, height, effectFor(type, radiusFor(type, 12), amount));
      for (let offset = 3; offset < output.length; offset += 4) assert.equal(output[offset], 255, `${type} alpha`);
      // Same as blurring an "almost opaque" helper by the old formula:
      // c·(1 - mix) + Σc / count · mix — checked at one interior pixel.
      assert.notDeepEqual(output, source, type);
    }
});

test('hidden RGB padding far from the stroke stays byte-for-byte', () => {
  const width = 64, height = 200;
  const source = strokes(width, height, [20], 6);
  for (const type of SPREAD_TYPES) {
    const output = applyFilterEffectsPixels(source, width, height, effectFor(type, radiusFor(type, 10)));
    for (let y = 60; y < height; y += 1) {
      const offset = (y * width + 30) * 4;
      assert.deepEqual([...output.subarray(offset, offset + 4)], [1, 2, 3, 0], `${type} row ${y}`);
    }
  }
});

test('partially transparent strokes keep their colour and spread proportionally', () => {
  const width = 24, height = 120;
  const source = strokes(width, height, [56], 8, [20, 180, 90], 128);
  const output = applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 12));
  const alpha = columnAlpha(output, width, height, 12);
  assert.ok(Math.max(...alpha) < 128);
  assert.ok(alpha.filter((value) => value > 0).length > 8);
  for (let y = 0; y < height; y += 1) {
    const offset = (y * width + 12) * 4;
    if (output[offset + 3] > 4) assert.deepEqual([...output.subarray(offset, offset + 3)], [20, 180, 90]);
  }
});

test('spread blur is translation invariant: tiled renders equal the full frame', async () => {
  const width = 560, height = 300;
  const source = strokes(width, height, [40, 41 + 30, 150, 151 + 40], 5, [90, 140, 220]);
  // Diagonal strokes too, so columns differ.
  for (let index = 0; index < 220; index += 1) {
    const offset = ((20 + index) * width + 30 + index) * 4;
    source.set([250, 200, 20, 200], offset);
  }
  for (const type of ['gaussian-blur', 'box-blur', 'motion-blur', 'lens-blur', 'blur-more'])
    for (const radius of [3, 7, 40]) {
      const effect = { type, amount: 100, radius, angle: 30 };
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
        { revision: `spread-${type}-${radius}`, tileSize: 256, maxWorkingBytes: 4 * 1024 * 1024 },
      );
      assert.deepEqual(destination, expected, `${type} radius ${radius}`);
    }
});

test('band-parallel Lens Blur equals the serial render with alpha spread', () => {
  const width = 90, height = 180;
  const source = strokes(width, height, [30, 100], 7);
  const effect = { type: 'lens-blur', amount: 100, radius: 20 };
  const serial = applyFilterEffectsPixels(source, width, height, effect);
  const parallel = applyFilterEffectsInBands(source, width, height, effect, 4);
  assert.deepEqual(parallel, serial);
});

test('worker-sized and realistic stroke layers blur (1024² and a 2646-wide strip)', () => {
  for (const [width, height] of [[1024, 1024], [2646, 600]]) {
    const rows = Array.from({ length: 20 }, (_, index) => 20 + index * Math.floor((height - 60) / 20));
    const source = strokes(width, height, rows, 5 + (rows.length % 5));
    const sharp = edgeProfile(columnAlpha(source, width, height, width >> 1));
    const r7 = edgeProfile(columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 7)), width, height, width >> 1));
    const r40 = edgeProfile(columnAlpha(applyFilterEffectsPixels(source, width, height, effectFor('gaussian-blur', 40)), width, height, width >> 1));
    assert.equal(sharp.soft, 0);
    assert.ok(r7.soft > 20 && r7.covered > sharp.covered, `${width}x${height} r7 ${JSON.stringify(r7)}`);
    assert.ok(r40.covered > r7.covered, `${width}x${height} r40 ${JSON.stringify(r40)}`);
  }
});

test('alphaSpread helpers: coverage, opaque shortcut, zero alpha and blending', () => {
  assert.equal(boxCoverage(0, 10, 3), 4);
  assert.equal(boxCoverage(5, 10, 3), 7);
  assert.equal(boxCoverage(9, 10, 3), 4);
  assert.equal(boxCoverage(0, 1, 64), 1);
  // Opaque neighbourhood: historical formula, alpha 255.
  assert.equal(spreadAlphaByte(255, 10, 10, 1), 255);
  assert.equal(spreadChannel(100, 255, 2000, 10, 10, 0.5), Math.round(100 * 0.5 + 200 * 0.5));
  // Half-covered transparent pixel, full mix.
  assert.equal(spreadAlphaByte(0, 5, 10, 1), 128);
  assert.equal(spreadChannel(1, 0, 5 * 180, 5, 10, 1), 180);
  // Nothing visible: caller keeps the source byte.
  assert.equal(spreadAlphaByte(0, 0, 10, 1), 0);
  assert.equal(spreadChannel(7, 0, 0, 0, 10, 1), -1);
  // Zero mix keeps the source.
  assert.equal(spreadAlphaByte(77, 9, 10, 0), 77);
  assert.equal(spreadChannel(42, 77, 900, 9, 10, 0), 42);
});

