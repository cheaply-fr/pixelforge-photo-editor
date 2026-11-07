import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADIENT_BLEND_DEFAULT,
  GRADIENT_BLEND_LABELS,
  GRADIENT_BLEND_MODES,
  blendGradientChannel,
  compositeGradientPixels,
  normalizeGradientBlendMode,
  normalizeGradientOpacity,
  validGradientBlendMode,
  validGradientOpacity,
} from '../src/gradientBlend.ts';

const px = (...pixels) => new Uint8ClampedArray(pixels.flat());
const near = (actual, expected, tolerance = 1) =>
  assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance), `${Array.from(actual).join()} ≉ ${expected.join()}`);

test('modes and opacity validate and default to Normal at 100%', () => {
  assert.equal(GRADIENT_BLEND_DEFAULT, 'normal');
  assert.ok(GRADIENT_BLEND_MODES.includes('replace'));
  assert.ok(GRADIENT_BLEND_MODES.includes('screen'));
  assert.ok(GRADIENT_BLEND_MODES.includes('multiply'));
  for (const mode of GRADIENT_BLEND_MODES) assert.equal(typeof GRADIENT_BLEND_LABELS[mode], 'string');
  assert.equal(validGradientBlendMode('screen'), true);
  assert.equal(validGradientBlendMode('dissolve'), false);
  assert.equal(normalizeGradientBlendMode(undefined), 'normal');
  assert.equal(normalizeGradientBlendMode('bogus'), 'normal');
  assert.equal(validGradientOpacity(1), true);
  assert.equal(validGradientOpacity(100), true);
  assert.equal(validGradientOpacity(0), false);
  assert.equal(validGradientOpacity(101), false);
  assert.equal(normalizeGradientOpacity(undefined), 100);
  assert.equal(normalizeGradientOpacity(250), 100);
  assert.equal(normalizeGradientOpacity(42.4), 42);
});

test('Normal paints over existing pixels and a transparent gradient keeps them', () => {
  const layer = px([255, 0, 0, 255], [0, 0, 255, 255], [10, 20, 30, 0]);
  const gradient = px([0, 255, 0, 255], [0, 255, 0, 0], [0, 255, 0, 128]);
  const out = compositeGradientPixels(layer, gradient, 'normal');
  near(out.slice(0, 4), [0, 255, 0, 255]);
  near(out.slice(4, 8), [0, 0, 255, 255], 0);
  near(out.slice(8, 12), [0, 255, 0, 128]);
  // Half-transparent gradient over opaque red mixes the colours.
  near(compositeGradientPixels(px([255, 0, 0, 255]), px([0, 0, 255, 128]), 'normal'), [127, 0, 128, 255]);
  // Inputs are never modified.
  assert.deepEqual(Array.from(layer), [255, 0, 0, 255, 0, 0, 255, 255, 10, 20, 30, 0]);
});

test('Replace discards the layer pixels, including where the gradient is transparent', () => {
  const layer = px([255, 0, 0, 255], [0, 0, 255, 255]);
  const gradient = px([0, 255, 0, 255], [0, 255, 0, 0]);
  const out = compositeGradientPixels(layer, gradient, 'replace');
  assert.deepEqual(Array.from(out), [0, 255, 0, 255, 0, 0, 0, 0]);
  near(compositeGradientPixels(layer, gradient, 'replace', 0.5).slice(0, 4), [0, 255, 0, 128]);
});

test('Opacity scales the gradient contribution', () => {
  const layer = px([0, 0, 0, 255]);
  const gradient = px([255, 255, 255, 255]);
  near(compositeGradientPixels(layer, gradient, 'normal', 0.25), [64, 64, 64, 255]);
  near(compositeGradientPixels(layer, gradient, 'normal', 1), [255, 255, 255, 255]);
});

test('Screen and Linear dodge brighten (glow) while Multiply and Darken never brighten', () => {
  const layer = px([100, 50, 200, 255]);
  const gradient = px([120, 120, 120, 255]);
  const screen = compositeGradientPixels(layer, gradient, 'screen');
  const add = compositeGradientPixels(layer, gradient, 'linear-dodge');
  const multiply = compositeGradientPixels(layer, gradient, 'multiply');
  const darken = compositeGradientPixels(layer, gradient, 'darken');
  near(screen, [Math.round(255 * (100 / 255 + 120 / 255 - (100 * 120) / 255 / 255)), 147, 226, 255]);
  near(add, [220, 170, 255, 255]);
  near(multiply, [47, 24, 94, 255]);
  near(darken, [100, 50, 120, 255]);
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(screen[channel] >= layer[channel] && add[channel] >= screen[channel] - 1);
    assert.ok(multiply[channel] <= layer[channel] && darken[channel] <= layer[channel]);
  }
});

test('blend modes over transparent pixels fall back to the gradient colour', () => {
  for (const mode of GRADIENT_BLEND_MODES.filter((item) => item !== 'replace'))
    near(compositeGradientPixels(px([0, 0, 0, 0]), px([30, 60, 90, 255]), mode), [30, 60, 90, 255]);
});

test('separable blend functions match the W3C definitions at reference points', () => {
  assert.equal(blendGradientChannel('multiply', 0.5, 0.5), 0.25);
  assert.equal(blendGradientChannel('screen', 0.5, 0.5), 0.75);
  assert.equal(blendGradientChannel('overlay', 0.25, 0.5), 0.25);
  assert.equal(blendGradientChannel('hard-light', 0.5, 0.25), 0.25);
  assert.equal(blendGradientChannel('difference', 0.25, 0.75), 0.5);
  assert.equal(blendGradientChannel('exclusion', 0.5, 0.5), 0.5);
  assert.equal(blendGradientChannel('color-dodge', 0.5, 1), 1);
  assert.equal(blendGradientChannel('color-dodge', 0, 0.8), 0);
  assert.equal(blendGradientChannel('color-burn', 1, 0), 1);
  assert.equal(blendGradientChannel('color-burn', 0.5, 0), 0);
  assert.equal(blendGradientChannel('linear-dodge', 0.75, 0.75), 1);
  assert.equal(blendGradientChannel('soft-light', 0.5, 0.5), 0.5);
  for (const mode of GRADIENT_BLEND_MODES)
    for (const b of [0, 0.2, 0.5, 0.9, 1])
      for (const s of [0, 0.3, 0.5, 1]) {
        const value = blendGradientChannel(mode, b, s);
        assert.ok(value >= 0 && value <= 1, `${mode}(${b}, ${s}) = ${value}`);
      }
});

test('invalid inputs are rejected', () => {
  assert.throws(() => compositeGradientPixels(px([0, 0, 0, 0]), px([0, 0, 0, 0], [0, 0, 0, 0]), 'normal'));
  assert.throws(() => compositeGradientPixels(px([0, 0, 0, 0]), px([0, 0, 0, 0]), 'dissolve'));
  assert.throws(() => compositeGradientPixels(px([0, 0, 0, 0]), px([0, 0, 0, 0]), 'normal', 2));
});
