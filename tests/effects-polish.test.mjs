import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayerStylesPixels,
  effectiveLayerStyles,
  layerStyleBackdropPasses,
  neutralLayerStyles,
  shadowGaussianHalfWidths,
  STYLE_MAX_BLUR,
  validLayerStyles,
  withLayerStylePart,
} from '../src/layerStyles.ts';
import {
  replaceSmartFilter,
  smartFilterEntries,
  trackedSmartFilterIndex,
  validSmartFilters,
} from '../src/smartFilters.ts';
import { layerFilterCacheKey } from '../src/layerFilterCache.ts';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';

// ---------------------------------------------------------------------------
// Fixtures

/** An opaque `size`×`size` square of `rgb` centred in a transparent canvas. */
function square(width, height, size, rgb = [200, 40, 40]) {
  const data = new Uint8ClampedArray(width * height * 4);
  const left = Math.floor((width - size) / 2), top = Math.floor((height - size) / 2);
  for (let y = top; y < top + size; y += 1)
    for (let x = left; x < left + size; x += 1) data.set([...rgb, 255], (y * width + x) * 4);
  return { data, left, top, right: left + size - 1, bottom: top + size - 1 };
}

const alphaAt = (data, width, x, y) => data[(y * width + x) * 4 + 3];

/** Shadow-only styles with the given extra drop-shadow fields. */
const shadowStyles = (extra) => ({
  ...neutralLayerStyles,
  dropShadow: { ...neutralLayerStyles.dropShadow, enabled: true, opacity: 1, offsetX: 0, offsetY: 0, ...extra },
});

// ---------------------------------------------------------------------------
// Gaussian shadow falloff

test('Gaussian shadow half-widths cover every blur up to 250 px within the blur support', () => {
  assert.deepEqual(shadowGaussianHalfWidths(0), []);
  for (const blur of [1, 2, 7, 12, 40, 64, 65, 100, 180, STYLE_MAX_BLUR]) {
    const halves = shadowGaussianHalfWidths(blur);
    assert.equal(halves.length, 3, `blur ${blur}`);
    const support = halves.reduce((sum, half) => sum + half, 0);
    assert.ok(support <= blur, `support ${support} exceeds blur ${blur}`);
    // Matched variance: sigma = blur / 3 (a centred box of half-width k has
    // variance k(k + 1) / 3). Within 15% of the truncated Gaussian above 4 px.
    const variance = halves.reduce((sum, half) => sum + (half * (half + 1)) / 3, 0);
    if (blur >= 4) {
      const target = (blur / 3) ** 2;
      assert.ok(Math.abs(variance - target) / target < 0.15, `blur ${blur}: variance ${variance} vs ${target}`);
    }
  }
  // Large radii are no longer capped at the Gaussian Blur filter's 64 px.
  const big = shadowGaussianHalfWidths(240).reduce((sum, half) => sum + half, 0);
  assert.ok(big > 150, `blur 240 support ${big}`);
});

test('Gaussian drop shadow has a bell-shaped falloff where the box shadow is a linear ramp', () => {
  const width = 360, height = 260, blur = 60;
  const { data, right, top, bottom } = square(width, height, 120);
  const row = Math.floor((top + bottom) / 2);
  const box = applyLayerStylesPixels(data, width, height, shadowStyles({ blur, falloff: 'box' }));
  const gaussian = applyLayerStylesPixels(data, width, height, shadowStyles({ blur, falloff: 'gaussian' }));
  // Outside the square only the shadow is visible; sample the profile there.
  const profile = (pixels) => Array.from({ length: blur + 4 }, (_, step) => alphaAt(pixels, width, right + 1 + step, row));
  const linear = profile(box), bell = profile(gaussian);
  // The box ramp falls by a constant ~255 / (2 * blur + 1) per pixel.
  const boxSlopes = linear.slice(0, blur - 1).map((value, i) => value - linear[i + 1]);
  for (const slope of boxSlopes) assert.ok(slope >= 1 && slope <= 3, `box slope ${slope}`);
  // Both reach zero at the same visible extent (the blur radius).
  assert.equal(linear[blur], 0);
  assert.equal(bell[blur], 0);
  assert.ok(bell[blur - 8] <= 3, `gaussian tail ${bell[blur - 8]}`);
  // A Gaussian edge is ~50% at the edge, then decays faster than the ramp and
  // flattens into a long soft tail: its slope peaks near the edge.
  assert.ok(Math.abs(bell[0] - 128) <= 12, `gaussian edge ${bell[0]}`);
  const bellSlopes = bell.slice(0, blur - 1).map((value, i) => value - bell[i + 1]);
  const peak = bellSlopes.indexOf(Math.max(...bellSlopes));
  assert.ok(peak < blur / 4, `gaussian slope peaks at ${peak}`);
  assert.ok(Math.max(...bellSlopes) >= 4, 'gaussian falloff is steeper than the ramp near the edge');
  assert.ok(bellSlopes[Math.floor(blur * 0.7)] <= 1, 'gaussian tail is flat');
  assert.ok(bell[Math.floor(blur / 2)] < linear[Math.floor(blur / 2)], 'gaussian is darker than the ramp mid-way out');
  // Monotonic and inside the square the source still covers the shadow.
  for (let i = 1; i < bell.length; i += 1) assert.ok(bell[i] <= bell[i - 1]);
  assert.deepEqual(Array.from(gaussian.slice((row * width + right) * 4, (row * width + right) * 4 + 4)), [200, 40, 40, 255]);
});

test('legacy shadows without a falloff keep the box pass; new layers default to Gaussian', () => {
  const width = 80, height = 60;
  const { data } = square(width, height, 20);
  const legacyShadow = { enabled: true, color: '#000000', opacity: 0.8, offsetX: 3, offsetY: 4, blur: 9 };
  const legacy = applyLayerStylesPixels(data, width, height, { dropShadow: legacyShadow, outline: neutralLayerStyles.outline });
  const box = applyLayerStylesPixels(data, width, height, { dropShadow: { ...legacyShadow, falloff: 'box' } });
  const gaussian = applyLayerStylesPixels(data, width, height, { dropShadow: { ...legacyShadow, falloff: 'gaussian' } });
  assert.deepEqual(legacy, box);
  assert.notDeepEqual(legacy, gaussian);
  assert.equal(effectiveLayerStyles({ dropShadow: legacyShadow }).dropShadow.falloff, 'box');
  assert.equal(effectiveLayerStyles({ dropShadow: legacyShadow }).dropShadow.blend, 'source-over');
  // Layers without a stored style object start from the Gaussian defaults.
  assert.equal(effectiveLayerStyles(undefined).dropShadow.falloff, 'gaussian');
  assert.equal(effectiveLayerStyles(undefined).innerShadow.falloff, 'gaussian');
  assert.equal(neutralLayerStyles.dropShadow.falloff, 'gaussian');
  // Inner shadow: legacy object keeps box, explicit gaussian differs.
  const inner = { enabled: true, color: '#000000', opacity: 1, offsetX: 0, offsetY: 0, blur: 6, distance: 6 };
  const innerLegacy = applyLayerStylesPixels(data, width, height, { dropShadow: neutralLayerStyles.dropShadow, innerShadow: inner });
  const innerBox = applyLayerStylesPixels(data, width, height, { dropShadow: neutralLayerStyles.dropShadow, innerShadow: { ...inner, falloff: 'box' } });
  const innerGaussian = applyLayerStylesPixels(data, width, height, { dropShadow: neutralLayerStyles.dropShadow, innerShadow: { ...inner, falloff: 'gaussian' } });
  assert.deepEqual(innerLegacy, innerBox);
  assert.notDeepEqual(innerLegacy, innerGaussian);
});

test('shadow blend and falloff validate and reject unknown values', () => {
  const styles = effectiveLayerStyles(undefined);
  assert.equal(validLayerStyles(styles), true);
  assert.equal(validLayerStyles({ ...styles, dropShadow: { ...styles.dropShadow, blend: 'screen' } }), true);
  assert.equal(validLayerStyles({ ...styles, dropShadow: { ...styles.dropShadow, blend: 'glow' } }), false);
  assert.equal(validLayerStyles({ ...styles, dropShadow: { ...styles.dropShadow, falloff: 'cubic' } }), false);
  assert.equal(validLayerStyles({ ...styles, innerShadow: { ...styles.innerShadow, falloff: 3 } }), false);
  const { blend: _blend, falloff: _falloff, ...legacyShadow } = styles.dropShadow;
  assert.equal(validLayerStyles({ ...styles, dropShadow: legacyShadow }), true);
  // Invalid stored values fall back safely when rendering.
  const fallback = effectiveLayerStyles({ dropShadow: { ...styles.dropShadow, blend: 'nope', falloff: 'nope' } });
  assert.equal(fallback.dropShadow.blend, 'source-over');
  assert.equal(fallback.dropShadow.falloff, 'box');
});

test('Gaussian shadow at the 250 px bound stays within a fixed time budget', () => {
  const width = 900, height = 700;
  const { data } = square(width, height, 300);
  const started = performance.now();
  const out = applyLayerStylesPixels(data, width, height, shadowStyles({ blur: STYLE_MAX_BLUR, falloff: 'gaussian', offsetX: 40, offsetY: 40 }));
  const elapsed = performance.now() - started;
  assert.ok(out[3] >= 0);
  assert.ok(elapsed < 4000, `Gaussian 250 px shadow took ${elapsed.toFixed(0)} ms`);
});

// ---------------------------------------------------------------------------
// Backdrop passes for outer effects

test('outer effects split into backdrop passes only when one uses a non-Normal mode', () => {
  const base = effectiveLayerStyles(undefined);
  assert.deepEqual(layerStyleBackdropPasses(base), []);
  const normalGlow = { ...base, outerGlow: { ...base.outerGlow, enabled: true, blend: 'source-over' } };
  assert.deepEqual(layerStyleBackdropPasses(normalGlow), []);
  const screenGlow = { ...base, outerGlow: { ...base.outerGlow, enabled: true, blend: 'screen' } };
  assert.deepEqual(layerStyleBackdropPasses(screenGlow), [{ part: 'outer-glow', blend: 'screen' }]);
  // A Normal shadow is split out too so it stays beneath the glow.
  const both = { ...screenGlow, dropShadow: { ...base.dropShadow, enabled: true } };
  assert.deepEqual(layerStyleBackdropPasses(both), [
    { part: 'drop-shadow', blend: 'source-over' },
    { part: 'outer-glow', blend: 'screen' },
  ]);
  const multiplyShadow = { ...base, dropShadow: { ...base.dropShadow, enabled: true, blend: 'multiply' } };
  assert.deepEqual(layerStyleBackdropPasses(multiplyShadow), [{ part: 'drop-shadow', blend: 'multiply' }]);
  // Invisible effects need no pass; tagged render copies never split again.
  assert.deepEqual(layerStyleBackdropPasses({ ...screenGlow, outerGlow: { ...screenGlow.outerGlow, opacity: 0 } }), []);
  assert.deepEqual(layerStyleBackdropPasses(withLayerStylePart(both, 'body')), []);
  assert.deepEqual(layerStyleBackdropPasses(withLayerStylePart(both, 'outer-glow')), []);
});

test('style parts isolate each outer effect and recompose to the single pass for Normal modes', () => {
  const width = 70, height = 50;
  const { data } = square(width, height, 16, [30, 160, 220]);
  const base = effectiveLayerStyles(undefined);
  const styles = {
    ...base,
    dropShadow: { ...base.dropShadow, enabled: true, opacity: 0.7, offsetX: 5, offsetY: 3, blur: 4 },
    outerGlow: { ...base.outerGlow, enabled: true, opacity: 0.8, size: 9, blend: 'source-over' },
    outline: { ...base.outline, enabled: true, width: 2 },
  };
  const all = applyLayerStylesPixels(data, width, height, styles);
  const shadow = applyLayerStylesPixels(data, width, height, withLayerStylePart(styles, 'drop-shadow'));
  const glow = applyLayerStylesPixels(data, width, height, withLayerStylePart(styles, 'outer-glow'));
  const body = applyLayerStylesPixels(data, width, height, withLayerStylePart(styles, 'body'));
  // The body is the decorated layer without its outer effects.
  assert.deepEqual(body, applyLayerStylesPixels(data, width, height, {
    ...styles,
    dropShadow: { ...styles.dropShadow, enabled: false },
    outerGlow: { ...styles.outerGlow, enabled: false },
  }));
  // An effect pass has no source colour: far from the layer it is transparent
  // and the source square's centre carries only effect colour.
  const centre = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  assert.notDeepEqual(Array.from(glow.slice(centre, centre + 3)), [30, 160, 220]);
  assert.equal(shadow[3], 0);
  assert.equal(glow[3], 0);
  // Shadow then glow then body, each source-over, reproduces the single pass.
  const composed = new Uint8ClampedArray(width * height * 4);
  const over = (layer) => {
    for (let i = 0; i < composed.length; i += 4) {
      const sa = layer[i + 3] / 255, da = composed[i + 3] / 255, oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      for (let c = 0; c < 3; c += 1)
        composed[i + c] = Math.round((layer[i + c] * sa + composed[i + c] * da * (1 - sa)) / oa);
      composed[i + 3] = Math.round(oa * 255);
    }
  };
  over(shadow);
  over(glow);
  over(body);
  // Compare premultiplied values: straight RGB of nearly transparent pixels
  // amplifies byte rounding without being visible.
  let worst = 0;
  for (let i = 0; i < all.length; i += 4) {
    worst = Math.max(worst, Math.abs(all[i + 3] - composed[i + 3]));
    for (let c = 0; c < 3; c += 1)
      worst = Math.max(worst, Math.abs((all[i + c] * all[i + 3]) / 255 - (composed[i + c] * composed[i + 3]) / 255));
  }
  assert.ok(worst <= 3, `recomposed parts differ by ${worst}`);
  // Parts never mutate the source.
  assert.deepEqual(data, square(width, height, 16, [30, 160, 220]).data);
});

test('style part tags are part of the local filter-cache key', () => {
  const asset = 'source';
  const assets = { [asset]: { url: 'data:image/png;base64,AAAA', w: 4, h: 4 } };
  const styles = {
    ...effectiveLayerStyles(undefined),
    outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true, blend: 'screen' },
  };
  const layer = (layerStyles) => ({
    kind: 'raster',
    asset,
    styles: layerStyles,
    adjustments: { filterEffects: { type: 'mosaic', amount: 80, radius: 4, angle: 0, centerX: 0.5, centerY: 0.5, seed: 2 } },
  });
  const whole = layerFilterCacheKey(layer(styles), assets);
  const body = layerFilterCacheKey(layer(withLayerStylePart(styles, 'body')), assets);
  const glow = layerFilterCacheKey(layer(withLayerStylePart(styles, 'outer-glow')), assets);
  assert.ok(whole && body && glow);
  assert.equal(new Set([whole, body, glow]).size, 3);
});

// ---------------------------------------------------------------------------
// Editing stacked filters in place

const effect = (type, extra = {}) => ({
  type, amount: 80, radius: 4, angle: 0, centerX: 0.5, centerY: 0.5, seed: 2, ...extra,
});

test('a stacked entry can be edited in place, keeping its position and hidden state', () => {
  const stack = [effect('mosaic'), { ...effect('wind'), enabled: false }, effect('gaussian-blur')];
  const edited = replaceSmartFilter(stack, 0, { ...effect('mosaic'), radius: 12 });
  assert.equal(validSmartFilters(edited), true);
  assert.deepEqual(edited.map((entry) => entry.type), ['mosaic', 'wind', 'gaussian-blur']);
  assert.equal(edited[0].radius, 12);
  // Hidden stays hidden after an edit; a stray enabled flag on the input is ignored.
  const hidden = replaceSmartFilter(stack, 1, { ...effect('wind', { amount: 40 }), enabled: true });
  assert.equal(hidden[1].enabled, false);
  assert.equal(hidden[1].amount, 40);
  // Changing the type in place is allowed; the input stack is never mutated.
  const retyped = replaceSmartFilter(stack, 2, effect('emboss'));
  assert.equal(retyped[2].type, 'emboss');
  assert.equal(stack[2].type, 'gaussian-blur');
  assert.equal(stack[0].radius, 4);
  assert.deepEqual(smartFilterEntries(edited).map(({ enabled }) => enabled), [true, false, true]);
});

test('editing a stacked entry rejects out-of-range indexes, invalid effects and clearing', () => {
  const stack = [effect('mosaic')];
  assert.throws(() => replaceSmartFilter(stack, 1, effect('mosaic')), RangeError);
  assert.throws(() => replaceSmartFilter(stack, -1, effect('mosaic')), RangeError);
  assert.throws(() => replaceSmartFilter(stack, 0.5, effect('mosaic')), RangeError);
  assert.throws(() => replaceSmartFilter(stack, 0, { ...effect('mosaic'), type: 'not-a-filter' }), /invalid/);
  assert.throws(() => replaceSmartFilter(stack, 0, { ...effect('mosaic'), amount: Number.NaN }), /invalid/);
  assert.throws(() => replaceSmartFilter(stack, 0, effect('none')), /Remove/);
});

test('editing a stacked entry changes rendered pixels and the cache key; restoring it restores both', () => {
  const width = 16, height = 12;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < source.length; index += 4)
    source.set([(index * 7) & 255, (index * 3) & 255, (index * 11) & 255, 255], index);
  const render = (stack) =>
    smartFilterEntries(stack)
      .filter(({ enabled }) => enabled)
      .reduce((pixels, { effect: item }) => applyFilterEffectsPixels(pixels, width, height, item), source);
  const asset = 'source';
  const assets = { [asset]: { url: 'data:image/png;base64,AAAA', w: width, h: height } };
  const key = (stack) => layerFilterCacheKey({ kind: 'raster', asset, smartFilters: stack, adjustments: {} }, assets);
  const original = [effect('mosaic', { radius: 2 }), effect('emboss')];
  const edited = replaceSmartFilter(original, 0, effect('mosaic', { radius: 6 }));
  assert.notDeepEqual(render(edited), render(original));
  assert.notEqual(key(edited), key(original));
  const restored = replaceSmartFilter(edited, 0, effect('mosaic', { radius: 2 }));
  assert.deepEqual(render(restored), render(original));
  assert.equal(key(restored), key(original));
});

test('the edited entry is tracked through moves and removals', () => {
  // Moving the edited entry follows it.
  assert.equal(trackedSmartFilterIndex(1, { kind: 'move', index: 1, offset: 1, length: 3 }), 2);
  assert.equal(trackedSmartFilterIndex(1, { kind: 'move', index: 1, offset: -1, length: 3 }), 0);
  // Moving a neighbour across it shifts it.
  assert.equal(trackedSmartFilterIndex(1, { kind: 'move', index: 0, offset: 1, length: 3 }), 0);
  assert.equal(trackedSmartFilterIndex(1, { kind: 'move', index: 2, offset: -1, length: 3 }), 2);
  // Unrelated or impossible moves keep it.
  assert.equal(trackedSmartFilterIndex(0, { kind: 'move', index: 2, offset: 1, length: 3 }), 0);
  assert.equal(trackedSmartFilterIndex(0, { kind: 'move', index: 1, offset: 1, length: 3 }), 0);
  // Removal.
  assert.equal(trackedSmartFilterIndex(1, { kind: 'remove', index: 1 }), null);
  assert.equal(trackedSmartFilterIndex(2, { kind: 'remove', index: 0 }), 1);
  assert.equal(trackedSmartFilterIndex(0, { kind: 'remove', index: 2 }), 0);
});
