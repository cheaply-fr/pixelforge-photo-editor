import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayerStylesPixels,
  effectiveLayerStyles,
  isNeutralLayerStyles,
  neutralLayerStyles,
  validLayerStyles,
} from '../src/layerStyles.ts';

const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

test('Layer Style metadata is bounded and legacy values normalize safely', () => {
  const value = effectiveLayerStyles({
    dropShadow: {
      enabled: true,
      color: '#223344',
      opacity: 4,
      offsetX: 999,
      offsetY: -999,
      blur: 99,
    },
    outline: {
      enabled: true,
      color: '#abcdef',
      opacity: -1,
      width: 99,
    },
  });
  assert.deepEqual(value.dropShadow, {
    enabled: true,
    color: '#223344',
    opacity: neutralLayerStyles.dropShadow.opacity,
    offsetX: neutralLayerStyles.dropShadow.offsetX,
    offsetY: neutralLayerStyles.dropShadow.offsetY,
    blur: neutralLayerStyles.dropShadow.blur,
  });
  assert.deepEqual(value.outline, {
    enabled: true,
    color: '#abcdef',
    opacity: neutralLayerStyles.outline.opacity,
    width: neutralLayerStyles.outline.width,
  });
  assert.deepEqual(value.colorOverlay, neutralLayerStyles.colorOverlay);
  assert.deepEqual(value.gradientOverlay, neutralLayerStyles.gradientOverlay);
  assert.deepEqual(value.bevelEmboss, neutralLayerStyles.bevelEmboss);
  assert.equal(validLayerStyles(value), true);
  assert.equal(validLayerStyles({ ...value, outline: { ...value.outline, width: 0 } }), false);
  assert.equal(validLayerStyles({ ...value, dropShadow: { ...value.dropShadow, color: 'red' } }), false);
  assert.equal(validLayerStyles({ ...value, colorOverlay: { ...value.colorOverlay, opacity: 2 } }), false);
  assert.equal(validLayerStyles({ ...value, gradientOverlay: { ...value.gradientOverlay, angle: 181 } }), false);
  assert.equal(validLayerStyles({ ...value, innerShadow: { ...value.innerShadow, distance: 0 } }), false);
  assert.equal(validLayerStyles({ ...value, bevelEmboss: { ...value.bevelEmboss, depth: 0 } }), false);
  assert.equal(isNeutralLayerStyles(undefined), true);
});

test('Layer Style pixels are deterministic, source-safe and alpha-preserving', () => {
  const source = new Uint8ClampedArray(5 * 5 * 4);
  source.set([255, 255, 255, 255], (2 * 5 + 2) * 4);
  const original = source.slice();
  const style = {
    dropShadow: {
      ...neutralLayerStyles.dropShadow,
      enabled: true,
      color: '#000000',
      opacity: 1,
      offsetX: 1,
      offsetY: 0,
      blur: 0,
    },
    outline: {
      ...neutralLayerStyles.outline,
      enabled: true,
      color: '#ff0000',
      opacity: 1,
      width: 1,
    },
    colorOverlay: {
      ...neutralLayerStyles.colorOverlay,
      enabled: true,
      color: '#00ff00',
      opacity: 0.5,
    },
  };
  const first = applyLayerStylesPixels(source, 5, 5, style);
  const second = applyLayerStylesPixels(source, 5, 5, style);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(first, 5, 2, 2), [128, 255, 128, 255]);
  assert.equal(pixel(first, 5, 3, 2)[3], 255);
  assert.equal(pixel(first, 5, 1, 2)[0], 255);
  assert.equal(pixel(first, 5, 1, 2)[1], 0);
  assert.equal(pixel(first, 5, 1, 2)[2], 0);
  assert.ok(pixel(first, 5, 2, 2)[1] > 128, 'overlay blends the source colour');
  assert.deepEqual(
    applyLayerStylesPixels(source, 5, 5, undefined),
    source,
  );
});

test('Gradient Overlay interpolates endpoints, respects angle/reverse and preserves source bytes', () => {
  const source = new Uint8ClampedArray(4 * 2 * 4);
  source.set([255, 255, 255, 255], 0);
  source.set([255, 255, 255, 255], 12);
  const original = source.slice();
  const style = {
    gradientOverlay: {
      ...neutralLayerStyles.gradientOverlay,
      enabled: true,
      startColor: '#0000ff',
      endColor: '#ff0000',
      opacity: 1,
      angle: 0,
      reverse: false,
    },
  };
  const first = applyLayerStylesPixels(source, 4, 2, style);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(first, 4, 0, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(first, 4, 3, 0), [255, 0, 0, 255]);
  const reversed = applyLayerStylesPixels(source, 4, 2, {
    gradientOverlay: { ...style.gradientOverlay, reverse: true },
  });
  assert.deepEqual(pixel(reversed, 4, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(reversed, 4, 3, 0), [0, 0, 255, 255]);
});

test('Inner Shadow stays inside the source alpha and leaves the centre unchanged', () => {
  const source = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 1; y <= 3; y += 1)
    for (let x = 1; x <= 3; x += 1)
      source.set([255, 255, 255, 255], (y * 5 + x) * 4);
  const original = source.slice();
  const output = applyLayerStylesPixels(source, 5, 5, {
    innerShadow: {
      ...neutralLayerStyles.innerShadow,
      enabled: true,
      color: '#000000',
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      blur: 0,
      distance: 1,
    },
  });
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(output, 5, 2, 2), [255, 255, 255, 255]);
  assert.deepEqual(pixel(output, 5, 1, 1), [0, 0, 0, 255]);
  assert.deepEqual(pixel(output, 5, 0, 0), [0, 0, 0, 0]);
});

test('Bevel and Emboss shades directional alpha edges without mutating source bytes', () => {
  const source = new Uint8ClampedArray(5 * 3 * 4);
  for (let y = 0; y < 3; y += 1)
    for (let x = 1; x <= 3; x += 1)
      source.set([128, 128, 128, 255], (y * 5 + x) * 4);
  const original = source.slice();
  const output = applyLayerStylesPixels(source, 5, 3, {
    bevelEmboss: {
      ...neutralLayerStyles.bevelEmboss,
      enabled: true,
      opacity: 1,
      angle: 0,
      depth: 1,
      blur: 0,
    },
  });
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(output, 5, 1, 1), [0, 0, 0, 255]);
  assert.deepEqual(pixel(output, 5, 3, 1), [255, 255, 255, 255]);
  assert.deepEqual(pixel(output, 5, 2, 1), [128, 128, 128, 255]);
});
