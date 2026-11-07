import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CENTERED_FILTER_TYPES,
  filterCenterFromFrame,
  filterCenterFromPercent,
  filterCenterPercent,
  filterCenterToFrame,
  isCenteredFilter,
  nudgeFilterCenter,
  roundFilterCenter,
} from '../src/filterCenter.ts';
import { applyFilterEffectsPixels, FILTER_EFFECT_TYPES, validFilterEffects } from '../src/filterEffects.ts';

const identity = [1, 0, 0, 1, 0, 0];

test('centred filters include radial, twirl, pinch, spherize, polar and lens flare', () => {
  for (const type of ['radial-blur', 'spin-blur', 'twirl', 'pinch', 'spherize', 'polar-coordinates', 'lens-flare'])
    assert.equal(isCenteredFilter(type), true, type);
  assert.equal(isCenteredFilter('gaussian-blur'), false);
  for (const type of CENTERED_FILTER_TYPES) assert.ok(FILTER_EFFECT_TYPES.includes(type), type);
});

test('centres keep sub-percent precision instead of whole percentages', () => {
  // On a 4096 px layer, 1 % is ~41 px; stored precision is now 1e-6 of the span.
  const pixel = 1234.5 / 4095;
  const stored = roundFilterCenter(pixel);
  assert.ok(Math.abs(stored * 4095 - 1234.5) < 0.01);
  assert.equal(filterCenterPercent(stored), 30.15);
  assert.equal(filterCenterFromPercent(30.15), 0.3015);
  assert.equal(filterCenterPercent(0.5), 50);
  assert.equal(roundFilterCenter(-1), 0);
  assert.equal(roundFilterCenter(2), 1);
  assert.equal(roundFilterCenter(Number.NaN), 0.5);
  assert.equal(validFilterEffects({ type: 'radial-blur', amount: 50, radius: 10, angle: 0, centerX: stored, centerY: 0.123457, seed: 1 }), true);
});

test('frame ↔ layer centre mapping round-trips through translated, scaled and rotated layers', () => {
  const angle = (25 * Math.PI) / 180;
  const matrices = [
    identity,
    [1, 0, 0, 1, 140, -30],
    [2.5, 0, 0, 0.5, 10, 20],
    [Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, -Math.sin(angle) * 1.5, Math.cos(angle) * 1.5, 300, 40],
  ];
  for (const matrix of matrices)
    for (const [centerX, centerY] of [[0.5, 0.5], [0.123456, 0.987654], [0, 1]]) {
      const point = filterCenterToFrame(matrix, 4096, 2646, centerX, centerY);
      const back = filterCenterFromFrame(matrix, 4096, 2646, point);
      assert.ok(back);
      assert.ok(Math.abs(back.centerX - centerX) <= 1e-6, `${matrix.join(",")} ${String(centerX)}`);
      assert.ok(Math.abs(back.centerY - centerY) <= 1e-6, `${matrix.join(",")} ${String(centerY)}`);
    }
  // Layer-local pixel convention matches the renderers: centre × (size − 1).
  assert.deepEqual(filterCenterToFrame(identity, 101, 51, 0.5, 0.5), { x: 50, y: 25 });
  assert.deepEqual(filterCenterFromFrame(identity, 101, 51, { x: 25, y: 50 }), { centerX: 0.25, centerY: 1 });
  // Points outside the layer clamp to its edge; a degenerate matrix is refused.
  assert.deepEqual(filterCenterFromFrame(identity, 101, 51, { x: -40, y: 900 }), { centerX: 0, centerY: 1 });
  assert.equal(filterCenterFromFrame([0, 0, 0, 0, 0, 0], 10, 10, { x: 1, y: 1 }), null);
  assert.deepEqual(filterCenterFromFrame(identity, 1, 1, { x: 0, y: 0 }), { centerX: 0.5, centerY: 0.5 });
});

test('keyboard nudges move one or ten layer pixels and Home recentres', () => {
  const start = { centerX: 0.5, centerY: 0.5 };
  const right = nudgeFilterCenter(start, 4097, 2001, 'ArrowRight');
  assert.ok(Math.abs(right.centerX * 4096 - 2049) < 0.01);
  assert.equal(right.centerY, 0.5);
  const up = nudgeFilterCenter(start, 4097, 2001, 'ArrowUp', true);
  assert.ok(Math.abs(up.centerY * 2000 - 990) < 0.01);
  assert.deepEqual(nudgeFilterCenter({ centerX: 1, centerY: 0 }, 10, 10, 'ArrowRight'), { centerX: 1, centerY: 0 });
  assert.deepEqual(nudgeFilterCenter({ centerX: 0.1, centerY: 0.9 }, 10, 10, 'Home'), start);
  assert.equal(nudgeFilterCenter(start, 10, 10, 'Enter'), null);
});

test('a fractional centre changes Radial Blur output compared with the rounded percentage', () => {
  const width = 200;
  const height = 120;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      source.set([(x * 9) & 255, (y * 13) & 255, ((x ^ y) * 5) & 255, 255], (y * width + x) * 4);
  const base = { type: 'radial-blur', amount: 100, radius: 12, angle: 0, centerY: 0.5, seed: 1 };
  const precise = applyFilterEffectsPixels(source, width, height, { ...base, centerX: 0.3333 });
  const rounded = applyFilterEffectsPixels(source, width, height, { ...base, centerX: 0.33 });
  assert.notDeepEqual(precise, rounded);
  assert.deepEqual(precise, applyFilterEffectsPixels(source, width, height, { ...base, centerX: 0.3333 }));
});
