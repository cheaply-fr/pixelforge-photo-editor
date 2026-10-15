import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePuppetPins,
  planPuppetWarp,
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
