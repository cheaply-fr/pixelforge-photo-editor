import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SELECTION_FEATHER,
  formatSelectionFeather,
  normalizeSelectionFeather,
  parseSelectionFeather,
  FEATHER_BOX_PASSES,
  extendedBoxKernel,
  featherAlpha,
  validSelectionFeather,
} from '../src/selectionFeather.ts';
import { commonLayer, validateFrame } from '../src/document.ts';

test('feather input accepts decimal radii with a point or a comma', () => {
  assert.equal(parseSelectionFeather('1.2'), 1.2);
  assert.equal(parseSelectionFeather('1,2'), 1.2);
  assert.equal(parseSelectionFeather(' 0.5 '), 0.5);
  assert.equal(parseSelectionFeather('.3'), 0.3);
  assert.equal(parseSelectionFeather('18'), 18);
  assert.equal(parseSelectionFeather('0'), 0);
  assert.equal(parseSelectionFeather('1000'), MAX_SELECTION_FEATHER);
  // Precision is 0.1 px.
  assert.equal(parseSelectionFeather('1.24'), 1.2);
  assert.equal(parseSelectionFeather('1.25'), 1.3);
});

test('feather input rejects malformed and out-of-range values', () => {
  for (const value of ['', ' ', '-1', '1000.1', '1001', 'abc', '1.2.3', '1,2,3', 'NaN', 'Infinity', '1e2', '1 2'])
    assert.equal(parseSelectionFeather(value), null, value);
  assert.ok(Number.isNaN(normalizeSelectionFeather(-0.1)));
  assert.ok(Number.isNaN(normalizeSelectionFeather(Number.POSITIVE_INFINITY)));
});

const softness = (row) => row.reduce((total, value) => total + Math.min(value, 255 - value), 0);

/** A 40x41 plane with a hard vertical edge at x = 20 (white to the right). */
const edge = () => {
  const plane = new Uint8ClampedArray(40 * 41);
  for (let y = 0; y < 41; y += 1) for (let x = 20; x < 40; x += 1) plane[y * 40 + x] = 255;
  return plane;
};
const middle = (plane) => Array.from(plane.subarray(20 * 40, 21 * 40));

test('fractional feather radii render distinct alpha (1.2 is neither 1 nor 2)', () => {
  const rows = [1, 1.2, 2].map((sigma) => middle(featherAlpha(edge(), 40, 41, sigma)));
  assert.notDeepEqual(rows[1], rows[0]);
  assert.notDeepEqual(rows[1], rows[2]);
  const [one, decimal, two] = rows.map(softness);
  assert.ok(one > 0 && decimal > one && two > decimal, `${one} < ${decimal} < ${two}`);
  // Softness grows smoothly with the radius in 0.1 px steps.
  let previous = 0;
  for (let tenths = 1; tenths <= 30; tenths += 1) {
    const value = softness(middle(featherAlpha(edge(), 40, 41, tenths / 10)));
    assert.ok(value >= previous, `radius ${tenths / 10}`);
    previous = value;
  }
});

test('extended box passes reproduce the requested Gaussian variance', () => {
  for (const sigma of [0.3, 1, 1.2, 2.5, 7.7, 40]) {
    const { radius, alpha } = extendedBoxKernel(sigma);
    assert.ok(alpha >= 0 && alpha <= 1);
    const weight = 1 / (2 * radius + 1 + 2 * alpha);
    let variance = 0;
    for (let x = -radius; x <= radius; x += 1) variance += weight * x * x;
    variance += 2 * weight * alpha * (radius + 1) ** 2;
    assert.ok(Math.abs(variance * FEATHER_BOX_PASSES - sigma * sigma) < 1e-9, String(sigma));
  }
  // A blurred impulse keeps its mass and has the requested spread.
  const size = 81, plane = new Float32Array(size);
  plane[40] = 255;
  const blurred = featherAlpha(plane, size, 1, 0);
  assert.equal(blurred[40], 255);
  const wide = new Uint8ClampedArray(201);
  wide[100] = 255;
  const spread = featherAlpha(wide, 201, 1, 1.2);
  assert.ok(spread[100] < 255 && spread[99] > 0 && spread[99] === spread[101]);
});

test('feathering leaves hard 0 and 255 regions intact away from the edge', () => {
  const out = middle(featherAlpha(edge(), 40, 41, 1.2));
  assert.equal(out[2], 0);
  assert.equal(out[30], 255);
  assert.deepEqual([...featherAlpha(edge(), 40, 41, 0)], [...edge()]);
});

test('formatting shows whole numbers plainly and decimals to one place', () => {
  assert.equal(formatSelectionFeather(18), '18');
  assert.equal(formatSelectionFeather(1.2), '1.2');
  assert.equal(formatSelectionFeather(0.1 + 0.2), '0.3');
  assert.equal(validSelectionFeather(1.2), true);
  assert.equal(validSelectionFeather(-1), false);
  assert.equal(validSelectionFeather('1.2'), false);
});

test('documents accept and validate fractional selection feather without migration', () => {
  const asset = '11111111-1111-4111-8111-111111111111';
  const layer = { ...commonLayer('Base'), kind: 'raster', asset };
  const assets = {
    [asset]: {
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=',
      w: 1,
      h: 1,
    },
  };
  const frame = (feather) => ({
    w: 40,
    h: 30,
    layers: [layer],
    active: layer.id,
    selection: { shape: 'rectangle', x: 2, y: 3, w: 10, h: 12, feather, inverted: false },
  });
  for (const feather of [0, 1, 1.2, 2, 0.1, 999.9, 1000])
    assert.doesNotThrow(() => validateFrame(frame(feather), assets), String(feather));
  for (const feather of [-0.5, 1000.5, Number.NaN])
    assert.throws(() => validateFrame(frame(feather), assets), /Invalid layer document/);
});
