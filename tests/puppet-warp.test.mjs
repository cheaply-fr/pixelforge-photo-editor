import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePuppetPins,
  planPuppetWarp,
  puppetPinRadius,
  puppetSourcePoint,
  validPuppetWarpPlan,
  warpPuppetRgba,
} from '../src/puppetWarp.ts';

function fixture(width = 5, height = 5) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = x * 30;
      pixels[offset + 1] = y * 40;
      pixels[offset + 2] = 120;
      pixels[offset + 3] = 255;
    }
  }
  pixels[0] = 240;
  pixels[1] = 240;
  pixels[2] = 240;
  pixels[3] = 0;
  return pixels;
}

test('Puppet Warp pins normalize to bounded local coordinates and eight pins', () => {
  const pins = normalizePuppetPins(
    Array.from({ length: 10 }, (_, index) => ({ x: -10 + index, y: 100, dx: 1000, dy: -1000, influence: 0 })),
    5,
    4,
  );
  assert.equal(pins.length, 8);
  assert.deepEqual(pins[0], { x: 0, y: 3, dx: 5, dy: -5, influence: 1 });
  assert.equal(normalizePuppetPins(undefined, 5, 4).length, 0);
});

test('Puppet Warp identity is detached and preserves transparent RGB safety', () => {
  const source = fixture();
  const output = warpPuppetRgba(source, 5, 5, planPuppetWarp(5, 5, []));
  assert.notEqual(output, source);
  assert.deepEqual(Array.from(output), Array.from(source).map((value, index) => (index < 3 ? 0 : value)));
  assert.deepEqual(Array.from(source.slice(0, 4)), [240, 240, 240, 0]);
});

test('Puppet Warp moves a pin deterministically without mutating its source', () => {
  const source = fixture();
  const before = new Uint8ClampedArray(source);
  const plan = planPuppetWarp(5, 5, [{ x: 2, y: 2, dx: 1, dy: 0, influence: 4 }]);
  const first = warpPuppetRgba(source, 5, 5, plan);
  const second = warpPuppetRgba(source, 5, 5, plan);
  assert.deepEqual(Array.from(first), Array.from(second));
  assert.notDeepEqual(Array.from(first), Array.from(before));
  assert.deepEqual(Array.from(source), Array.from(before));
  const centre = (2 * 5 + 2) * 4;
  assert.equal(first[centre], 30);
  assert.equal(first[centre + 3], 255);
});

test('Puppet Warp validates dimensions, buffers and plan bounds before processing', () => {
  assert.throws(() => planPuppetWarp(0, 5, []), /dimensions/);
  assert.throws(() => warpPuppetRgba(new Uint8ClampedArray(4), 2, 2, planPuppetWarp(2, 2, [])), /dimensions or plan/);
  assert.equal(validPuppetWarpPlan({ width: 5, height: 5, pins: [{ x: 5, y: 1, dx: 0, dy: 0, influence: 2 }] }), false);
  assert.throws(() => warpPuppetRgba(fixture(), 5, 5, { width: 5, height: 5, pins: [{ x: 5, y: 1, dx: 0, dy: 0, influence: 2 }] }), /dimensions or plan/);
});

test('a single pin bends locally: its pixel reaches the target and far pixels stay put', () => {
  const width = 200, height = 120;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    source[offset] = x; source[offset + 1] = y; source[offset + 2] = 7; source[offset + 3] = 255;
  }
  const plan = planPuppetWarp(width, height, [{ x: 100, y: 60, dx: 14, dy: -6, influence: 30 }]);
  const radius = puppetPinRadius(plan.pins[0]);
  assert.equal(radius, 30);
  const output = warpPuppetRgba(source, width, height, plan);
  const at = (x, y) => Array.from(output.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
  // The pinned pixel lands exactly on its target.
  assert.deepEqual(at(114, 54), [100, 60, 7, 255]);
  // Beyond the radius from the target nothing moves, so the layer is not shifted
  // as a whole and no transparent strips open at its edges.
  for (const [x, y] of [[0, 0], [199, 119], [0, 119], [199, 0], [114 + 31, 54], [114, 54 + 31], [60, 60]])
    assert.deepEqual(at(x, y), [x, y, 7, 255], `${x},${y}`);
  for (let index = 3; index < output.length; index += 4) assert.equal(output[index], 255);
  // Displacement fades smoothly with distance from the target.
  const moves = [0, 10, 20, 29].map((distance) => 114 + distance - puppetSourcePoint(114 + distance, 54, plan).x);
  assert.equal(moves[0], 14);
  for (let index = 1; index < moves.length; index += 1) assert.ok(moves[index] < moves[index - 1] && moves[index] > 0);
  assert.equal(puppetSourcePoint(114 + 30, 54, plan).x, 144);
});

test('large pin moves widen the radius so the warp never folds over itself', () => {
  const plan = planPuppetWarp(400, 400, [{ x: 100, y: 200, dx: 100, dy: 0, influence: 20 }]);
  assert.equal(puppetPinRadius(plan.pins[0]), 160);
  // The inverse map is monotonic along the move, so no source pixel repeats.
  let previous = -Infinity;
  for (let x = 0; x < 400; x += 1) {
    const sourceX = puppetSourcePoint(x, 200, plan).x;
    assert.ok(sourceX > previous, `x=${x}`);
    previous = sourceX;
  }
});

test('overlapping pins blend without exceeding either move', () => {
  const plan = planPuppetWarp(300, 100, [
    { x: 100, y: 50, dx: 10, dy: 0, influence: 60 },
    { x: 140, y: 50, dx: 10, dy: 0, influence: 60 },
  ]);
  for (let x = 0; x < 300; x += 1) {
    const move = x - puppetSourcePoint(x, 50, plan).x;
    assert.ok(move >= 0 && move <= 10 + 1e-9, `x=${x} moved ${move}`);
  }
  assert.ok(Math.abs(130 - puppetSourcePoint(130, 50, plan).x - 10) < 1e-9);
});
