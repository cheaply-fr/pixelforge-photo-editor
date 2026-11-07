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
      offsetX: 1001,
      offsetY: -1001,
      blur: 251,
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
  assert.deepEqual(value.patternOverlay, neutralLayerStyles.patternOverlay);
  assert.deepEqual(value.bevelEmboss, neutralLayerStyles.bevelEmboss);
  assert.equal(validLayerStyles(value), true);
  assert.equal(validLayerStyles({ ...value, outline: { ...value.outline, width: 0 } }), false);
  assert.equal(validLayerStyles({ ...value, dropShadow: { ...value.dropShadow, color: 'red' } }), false);
  assert.equal(validLayerStyles({ ...value, colorOverlay: { ...value.colorOverlay, opacity: 2 } }), false);
  assert.equal(validLayerStyles({ ...value, gradientOverlay: { ...value.gradientOverlay, angle: 181 } }), false);
  assert.equal(validLayerStyles({ ...value, innerShadow: { ...value.innerShadow, distance: 0 } }), false);
  assert.equal(validLayerStyles({ ...value, bevelEmboss: { ...value.bevelEmboss, depth: 0 } }), false);
  assert.equal(validLayerStyles({ ...value, patternOverlay: { ...value.patternOverlay, tileSize: 3 } }), false);
  assert.equal(validLayerStyles({ ...value, patternOverlay: { ...value.patternOverlay, pattern: 'unknown' } }), false);
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

test('Pattern Overlay repeats a bounded local tile, blends alpha and preserves source bytes', () => {
  const source = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < source.length; i += 4) source.set([255, 255, 255, 255], i);
  source.set([9, 8, 7, 0], (1 * 4 + 3) * 4);
  const original = source.slice();
  const style = {
    patternOverlay: {
      ...neutralLayerStyles.patternOverlay,
      enabled: true,
      pattern: 'checker',
      foregroundColor: '#ff0000',
      backgroundColor: '#0000ff',
      opacity: 1,
      tileSize: 4,
    },
  };
  const output = applyLayerStylesPixels(source, 4, 2, style);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(output, 4, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(output, 4, 1, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(output, 4, 2, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(output, 4, 3, 1), [9, 8, 7, 0]);
  const half = applyLayerStylesPixels(source, 4, 2, {
    patternOverlay: { ...style.patternOverlay, opacity: 0.5, foregroundColor: '#000000' },
  });
  assert.deepEqual(pixel(half, 4, 0, 0), [128, 128, 128, 255]);
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

const square = (width, height, x0, y0, x1, y1, rgba = [255, 255, 255, 255]) => {
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) source.set(rgba, (y * width + x) * 4);
  return source;
};

test('Glow metadata is bounded, validated and optional for legacy documents', () => {
  const value = effectiveLayerStyles({
    outerGlow: { enabled: true, color: '#00ff00', opacity: 2, size: 251, spread: 101, blend: 'lighter' },
    innerGlow: { enabled: true, color: 'red', opacity: 0.4, size: 30, choke: 50, source: 'middle', blend: 'color-dodge' },
  });
  assert.deepEqual(value.outerGlow, {
    ...neutralLayerStyles.outerGlow,
    enabled: true,
    color: '#00ff00',
  });
  assert.deepEqual(value.innerGlow, {
    enabled: true,
    color: neutralLayerStyles.innerGlow.color,
    opacity: 0.4,
    size: 30,
    choke: 50,
    source: 'edge',
    blend: 'color-dodge',
  });
  assert.equal(neutralLayerStyles.outerGlow.blend, 'screen');
  assert.equal(neutralLayerStyles.innerGlow.blend, 'screen');
  assert.equal(validLayerStyles(value), true);
  const { outerGlow: _outer, innerGlow: _inner, ...legacy } = value;
  assert.equal(validLayerStyles(legacy), true, 'documents saved before glows still load');
  assert.equal(validLayerStyles({ ...value, outerGlow: { ...value.outerGlow, size: 251 } }), false);
  assert.equal(validLayerStyles({ ...value, outerGlow: { ...value.outerGlow, blend: 'normal' } }), false);
  assert.equal(validLayerStyles({ ...value, innerGlow: { ...value.innerGlow, choke: -1 } }), false);
  assert.equal(validLayerStyles({ ...value, innerGlow: { ...value.innerGlow, source: 'middle' } }), false);
  assert.equal(isNeutralLayerStyles({ outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true } }), false);
  assert.equal(isNeutralLayerStyles({ innerGlow: { ...neutralLayerStyles.innerGlow, enabled: true } }), false);
});

test('Shadow ranges scale to large documents', () => {
  const big = {
    ...neutralLayerStyles,
    dropShadow: { ...neutralLayerStyles.dropShadow, offsetX: 1000, offsetY: -1000, blur: 250 },
    innerShadow: { ...neutralLayerStyles.innerShadow, offsetX: -1000, blur: 250, distance: 250 },
  };
  assert.equal(validLayerStyles(big), true);
  assert.deepEqual(effectiveLayerStyles(big).dropShadow, big.dropShadow);
  assert.deepEqual(effectiveLayerStyles(big).innerShadow, big.innerShadow);
  assert.equal(validLayerStyles({ ...big, innerShadow: { ...big.innerShadow, distance: 251 } }), false);
  assert.equal(validLayerStyles({ ...big, dropShadow: { ...big.dropShadow, blur: 251 } }), false);
});

test('Outer Glow falls off monotonically outside the shape and spread hardens it', () => {
  const width = 80, height = 40;
  const source = square(width, height, 30, 10, 49, 29, [0, 0, 255, 255]);
  const original = source.slice();
  const glow = { ...neutralLayerStyles.outerGlow, enabled: true, color: '#ff0000', opacity: 1, size: 18, spread: 0, blend: 'source-over' };
  const output = applyLayerStylesPixels(source, width, height, { outerGlow: glow });
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(output, width, 40, 20), [0, 0, 255, 255]);
  const alphas = [50, 53, 56, 60, 64, 68].map((x) => pixel(output, width, x, 20)[3]);
  for (let i = 1; i < alphas.length; i += 1) assert.ok(alphas[i] <= alphas[i - 1], `falloff ${alphas.join(",")}`);
  assert.ok(alphas[0] > 64 && alphas.at(-1) < alphas[0], `falloff ${alphas.join(",")}`);
  assert.deepEqual(pixel(output, width, 50, 20).slice(0, 3), [255, 0, 0]);
  assert.equal(pixel(output, width, 79, 0)[3], 0, 'beyond the glow extent stays transparent');
  const spread = applyLayerStylesPixels(source, width, height, { outerGlow: { ...glow, spread: 60 } });
  assert.ok(pixel(spread, width, 56, 20)[3] > pixel(output, width, 56, 20)[3]);
  const hard = applyLayerStylesPixels(source, width, height, { outerGlow: { ...glow, spread: 100 } });
  assert.equal(pixel(hard, width, 52, 20)[3], 255);
  // Screen over the layer's own transparent area behaves as Normal.
  const screened = applyLayerStylesPixels(source, width, height, { outerGlow: { ...glow, blend: 'screen' } });
  assert.deepEqual(pixel(screened, width, 53, 20), pixel(output, width, 53, 20));
});

test('Inner Glow stays inside source alpha, follows edge/center source and its blend mode', () => {
  const width = 60, height = 60;
  const source = square(width, height, 10, 10, 49, 49, [0, 0, 128, 255]);
  const glow = { ...neutralLayerStyles.innerGlow, enabled: true, color: '#ffff00', opacity: 1, size: 9, choke: 0, source: 'edge', blend: 'source-over' };
  const output = applyLayerStylesPixels(source, width, height, { innerGlow: glow });
  assert.deepEqual(pixel(output, width, 5, 5), [0, 0, 0, 0], 'never paints transparent pixels');
  const red = (x) => pixel(output, width, x, 30)[0];
  assert.ok(red(10) > red(14) && red(14) > red(18) && red(18) >= red(29), 'edge glow fades inward');
  assert.equal(red(29), 0);
  const center = applyLayerStylesPixels(source, width, height, { innerGlow: { ...glow, source: 'center' } });
  assert.ok(pixel(center, width, 29, 30)[0] > pixel(center, width, 10, 30)[0]);
  const screen = applyLayerStylesPixels(source, width, height, { innerGlow: { ...glow, blend: 'screen', color: '#808080' } });
  const edge = pixel(screen, width, 10, 30);
  assert.ok(edge[2] > 128, 'screen lightens the blue source');
  assert.equal(edge[3], 255);
});

test('Large inner-shadow distance uses separable erosion identical to the square window', () => {
  const width = 40, height = 30;
  const source = square(width, height, 3, 2, 30, 25, [200, 200, 200, 255]);
  for (let i = 0; i < 6; i += 1) source[((2 + i) * width + 3 + i) * 4 + 3] = 40 * i;
  const distance = 5;
  const output = applyLayerStylesPixels(source, width, height, {
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, opacity: 1, offsetX: 0, offsetY: 0, blur: 0, distance },
  });
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const own = source[(y * width + x) * 4 + 3];
      if (own === 0) continue;
      let minimum = 255;
      for (let oy = -distance; oy <= distance; oy += 1)
        for (let ox = -distance; ox <= distance; ox += 1) {
          const nx = x + ox, ny = y + oy;
          minimum = Math.min(minimum, nx >= 0 && nx < width && ny >= 0 && ny < height ? source[(ny * width + nx) * 4 + 3] : 0);
        }
      const amount = (own - minimum) * (own / 255);
      const actual = pixel(output, width, x, y);
      if (amount < 0.5) assert.deepEqual(actual.slice(0, 3), [200, 200, 200], `${x},${y}`);
      else assert.ok(actual[0] < 200, `${x},${y}`);
    }
  const large = square(1200, 900, 100, 100, 1100, 800);
  const started = performance.now();
  applyLayerStylesPixels(large, 1200, 900, {
    innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true, blur: 250, distance: 250 },
    dropShadow: { ...neutralLayerStyles.dropShadow, enabled: true, blur: 250, offsetX: 400 },
    outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true, size: 250, spread: 30 },
    innerGlow: { ...neutralLayerStyles.innerGlow, enabled: true, size: 250 },
  });
  assert.ok(performance.now() - started < 15_000, 'large-radius styles stay bounded');
});
