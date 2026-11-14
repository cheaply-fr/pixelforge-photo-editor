// Filter menu / Filter effects panel audit fixes (2026-11-14):
// slider coverage, truthful units, Liquify/Pinch direction, Sharpen kernel,
// relative Twirl/Spherize/Lens Correction radii, live-filter Fade and Clarity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FILTER_EFFECT_TYPES,
  applyFilterEffectsPixels,
  applyFilterFade,
  correctionInfluenceRadius,
  distortInfluenceFraction,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  retypeFilterEffects,
  treeTrunkFraction,
  validFilterEffects,
} from '../src/filterEffects.ts';
import {
  RADIUS_FREE_FILTERS,
  embossDepthPixels,
  filterRadiusControl,
  filterThresholdControl,
  levelsReadout,
  pathBlurUsesCenter,
} from '../src/filterControls.ts';
import { liveFilterFadeTarget } from '../src/fade.ts';
import { applyFilterEffectsInBands, filterBandHalo } from '../src/filterBands.ts';
import { tiledNeighborhoodRadius } from '../src/tiledDocument.ts';
import { filterActionParameters } from '../src/filterActionParameters.ts';
import { applyPhotoAdjustmentsPixels } from '../src/photoAdjustments.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const at = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
const differs = (a, b) => a.some((value, index) => value !== b[index]);
/** Pixels with red above the threshold. */
const brightCount = (data, threshold = 128) => {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) if (data[offset] > threshold) count += 1;
  return count;
};

// A textured, fully opaque 64 × 48 test image: diagonal gradients plus a
// grid of hard edges, so every geometry and neighbourhood filter has detail.
const W = 64, H = 48;
const textured = rgba(W, H, (x, y) => [
  (x * 4 + (((x >> 3) + (y >> 3)) % 2) * 90) % 256,
  (y * 5 + (x % 7) * 20) % 256,
  ((x + y) * 3 + ((x * y) % 11) * 9) % 256,
  255,
]);

// ---------------------------------------------------------------------------
// 1. Filter menu Sharpen heading

test('the Filter menu has a Sharpen heading above the Sharpen commands', () => {
  const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const menu = source.slice(source.indexOf('  Filter: ['), source.indexOf('  View: ['));
  const heading = menu.indexOf("{ label: 'Sharpen', command: 'noop', disabled: true }");
  assert.ok(heading > 0, 'Sharpen heading exists');
  assert.ok(heading < menu.indexOf("command: 'filter-sharpen' }"));
  assert.ok(menu.indexOf("{ label: 'Render', command: 'noop', disabled: true }") < heading);
  // Render keeps only render commands between its heading and Sharpen.
  const render = menu.slice(menu.indexOf("{ label: 'Render'"), heading);
  assert.doesNotMatch(render, /sharpen|unsharp/);
});

// ---------------------------------------------------------------------------
// 2. Every radius slider the panel shows changes the output

const settingsFor = (type) => {
  const base = effectiveFilterEffects({ type, amount: 80, radius: 8, angle: 35, centerX: 0.5, centerY: 0.55, seed: 7 });
  // The menu's defaults for type-bound settings that the radius interacts with.
  if (type === 'twirl' || type === 'spherize' || type === 'lens-correction' || type === 'adaptive-wide-angle')
    return effectiveFilterEffects({ ...base, relativeRadius: true });
  return base;
};

test('each radius slider shown in the Filter effects panel changes the rendered pixels', () => {
  const unchanged = [];
  for (const type of FILTER_EFFECT_TYPES) {
    const effect = settingsFor(type);
    const control = filterRadiusControl(effect, { w: W, h: H });
    if (!control) continue;
    const low = applyFilterEffectsPixels(textured, W, H, { ...effect, radius: control.toRadius(control.min) });
    const high = applyFilterEffectsPixels(textured, W, H, { ...effect, radius: control.toRadius(Math.min(control.max, 64)) });
    if (!differs(low, high)) unchanged.push(type);
  }
  assert.deepEqual(unchanged, []);
});

test('filters without a radius parameter hide the radius slider and ignore radius', () => {
  for (const type of ['average-blur', 'blur', 'despeckle', 'sharpen', 'solarize']) {
    const effect = settingsFor(type);
    assert.equal(filterRadiusControl(effect), undefined, type);
    assert.ok(RADIUS_FREE_FILTERS.includes(type));
    const one = applyFilterEffectsPixels(textured, W, H, { ...effect, radius: 1 });
    const many = applyFilterEffectsPixels(textured, W, H, { ...effect, radius: 64 });
    assert.deepEqual(one, many, `${type} ignores radius`);
    // Radius 0 (never shown) is not an identity for these filters.
    assert.equal(isNeutralFilterEffects({ ...effect, radius: 0 }), false, type);
    assert.ok(differs(applyFilterEffectsPixels(textured, W, H, { ...effect, radius: 0 }), textured), type);
  }
});

test('Twirl and Spherize radius set the influence extent; legacy records keep the 70 % extent', () => {
  for (const type of ['twirl', 'spherize']) {
    const base = { type, amount: 100, angle: 120, centerX: 0.5, centerY: 0.5, seed: 0 };
    const small = applyFilterEffectsPixels(textured, W, H, { ...base, radius: 16, relativeRadius: true });
    const large = applyFilterEffectsPixels(textured, W, H, { ...base, radius: 64, relativeRadius: true });
    assert.ok(differs(small, large), type);
    // Radius 16 → 17.5 % of the 48 px side ≈ 8.4 px: a pixel 14 px from the
    // centre is outside the small influence and unchanged.
    assert.deepEqual(at(small, W, 32 + 14, 24), at(textured, W, 32 + 14, 24));
    // Legacy records (no relativeRadius) ignored radius: they normalize to
    // radius 64 and render exactly as the fixed 70 % extent did.
    const legacy = effectiveFilterEffects({ ...base, radius: 6 });
    assert.equal(legacy.radius, 64);
    assert.equal(legacy.relativeRadius, true);
    assert.deepEqual(applyFilterEffectsPixels(textured, W, H, { ...base, radius: 6 }), large);
    assert.equal(validFilterEffects(legacy), true);
    assert.equal(validFilterEffects({ ...base, radius: 6 }), true, 'stored legacy records still validate');
  }
  assert.equal(distortInfluenceFraction(64), 0.7);
  assert.equal(distortInfluenceFraction(32), 0.35);
});

test('relativeRadius is only valid on the four relative-radius filters', () => {
  assert.equal(validFilterEffects(effectiveFilterEffects({ type: 'lens-correction', amount: 50, radius: 40, relativeRadius: true })), true);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects({ type: 'pinch', amount: 50, radius: 40 }), relativeRadius: true }), false);
  assert.equal(effectiveFilterEffects({ type: 'pinch', amount: 50, radius: 40, relativeRadius: true }).relativeRadius, undefined);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects({ type: 'lens-correction', amount: 50, radius: 40 }), relativeRadius: false }), false);
});

test('Tree radius sets the trunk length; radius 6 keeps the earlier fixed 16 % trunk', () => {
  assert.equal(treeTrunkFraction(6), 0.16);
  assert.ok(Math.abs(treeTrunkFraction(15) - 0.4) < 1e-9);
  assert.equal(treeTrunkFraction(64), 0.4);
  const blank = rgba(W, H, () => [230, 230, 230, 255]);
  const effect = { type: 'tree', amount: 100, centerX: 0.5, centerY: 0.95, seed: 3, tree: { branches: 5, leafiness: 60 } };
  const short = applyFilterEffectsPixels(blank, W, H, { ...effect, radius: 3 });
  const tall = applyFilterEffectsPixels(blank, W, H, { ...effect, radius: 12 });
  const painted = (data) => data.reduce((count, value, index) => count + (index % 4 === 0 && value !== 230 ? 1 : 0), 0);
  assert.ok(painted(tall) > painted(short) * 2, 'a longer trunk paints a larger tree');
});

test('Path Blur centre sliders apply only to legacy records without a motion path', () => {
  assert.equal(pathBlurUsesCenter({ type: 'path-blur' }), true);
  assert.equal(pathBlurUsesCenter({ type: 'path-blur', path: [{ x: 0, y: 0, speed: 100 }, { x: 1, y: 1, speed: 100 }] }), false);
  const path = [{ x: 0.2, y: 0.5, speed: 100 }, { x: 0.8, y: 0.5, speed: 100 }];
  const left = applyFilterEffectsPixels(textured, W, H, { type: 'path-blur', amount: 80, radius: 8, centerX: 0.1, centerY: 0.1, path });
  const right = applyFilterEffectsPixels(textured, W, H, { type: 'path-blur', amount: 80, radius: 8, centerX: 0.9, centerY: 0.9, path });
  assert.deepEqual(left, right, 'an authored path ignores the centre');
});

// ---------------------------------------------------------------------------
// 3. Truthful units

test('radius readouts state the real unit of each filter', () => {
  const readout = (effect) => {
    const control = filterRadiusControl(effectiveFilterEffects(effect), { w: 1000, h: 800 });
    return `${control.label}: ${control.readout(control.value)}`;
  };
  assert.equal(readout({ type: 'pinch', amount: 50, radius: 32 }), 'Pinch radius: 35% of shorter side');
  assert.equal(readout({ type: 'liquify', amount: 50, radius: 64 }), 'Liquify radius: 70% of shorter side');
  assert.equal(readout({ type: 'twirl', amount: 50, radius: 32, angle: 40, relativeRadius: true }), 'Twirl radius: 35% of shorter side');
  assert.equal(readout({ type: 'spherize', amount: 50, radius: 16, relativeRadius: true }), 'Spherize radius: 18% of shorter side');
  assert.equal(readout({ type: 'polar-coordinates', amount: 50, radius: 64 }), 'Polar radius: 50% of shorter side');
  assert.equal(readout({ type: 'lens-flare', amount: 50, radius: 32 }), 'Flare size: 46% of shorter side');
  assert.equal(readout({ type: 'lens-correction', amount: 50, radius: 32, relativeRadius: true }), 'Correction radius: 50% of half diagonal');
  assert.equal(readout({ type: 'lens-correction', amount: 50, radius: 32 }), 'Correction radius: 32 px');
  assert.equal(readout({ type: 'tree', amount: 50, radius: 6 }), 'Trunk length: 16% of shorter side');
  assert.equal(readout({ type: 'blur-more', amount: 50, radius: 5 }), 'Blur radius: 10 px');
  assert.equal(readout({ type: 'clouds', amount: 50, radius: 16 }), 'Cloud scale: 32 px');
  assert.equal(readout({ type: 'radial-blur', amount: 50, radius: 18 }), 'Angular sweep: 18°');
  assert.equal(readout({ type: 'flame', amount: 50, radius: 16 }), 'Flame detail: 16');
  assert.equal(readout({ type: 'gaussian-blur', amount: 50, radius: 14 }), 'Blur radius: 14 px');
  assert.equal(readout({ type: 'diffuse', amount: 50, radius: 2 }), 'Radius: 2 px');
  // Field Blur pins carry their own radii; the old "Fallback blur radius" did nothing.
  assert.equal(filterRadiusControl(effectiveFilterEffects({ type: 'field-blur', amount: 50, radius: 8 })), undefined);
});

test('Emboss depth works in its real 1–8 px sampling depth and keeps legacy radii', () => {
  const control = filterRadiusControl(effectiveFilterEffects({ type: 'emboss', amount: 50, radius: 6 }));
  assert.deepEqual([control.label, control.value, control.min, control.max, control.readout(control.value)], ['Emboss depth', 1, 1, 8, '1 px']);
  assert.equal(control.toRadius(8), 64);
  assert.equal(control.toRadius(3), 24);
  for (let depth = 1; depth <= 8; depth += 1) assert.equal(embossDepthPixels(control.toRadius(depth)), depth);
  // A legacy radius renders exactly like its depth in px.
  const legacy = applyFilterEffectsPixels(textured, W, H, { type: 'emboss', amount: 80, radius: 21, angle: 30 });
  const mapped = applyFilterEffectsPixels(textured, W, H, { type: 'emboss', amount: 80, radius: control.toRadius(embossDepthPixels(21)), angle: 30 });
  assert.deepEqual(legacy, mapped);
});

test('noise thresholds are labelled as 0–255 levels, not percent', () => {
  for (const [type, label, fallback] of [
    ['dust-scratches', 'Outlier threshold', 12],
    ['reduce-noise', 'Preserve details', 25],
    ['ai-denoise', 'Edge protection', 18],
    ['ai-sharpen', 'Edge threshold', 22],
    ['reflection-removal', 'Reflection threshold', 28],
  ]) assert.deepEqual(filterThresholdControl(type), { label, fallback });
  assert.equal(filterThresholdControl('median'), undefined);
  assert.equal(levelsReadout(12), '12 / 255');
});

test('the panel source shows counts without a percent sign', () => {
  const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Slider label="Branch count"[^\n]*suffix="" \/>/);
  assert.match(source, /label="Fiber variance"[\s\S]{0,500}suffix=""/);
  assert.doesNotMatch(source, /Tree origin Y[\s\S]{0,4000}Bounded seeded recursive branch/, 'the Tree description is not repeated');
});

// ---------------------------------------------------------------------------
// 4. Liquify Bloat and Pinch directions

const disc = (radius) => rgba(W, H, (x, y) => Math.hypot(x - 31.5, y - 23.5) <= radius ? [255, 255, 255, 255] : [0, 0, 0, 255]);

test('Liquify Bloat enlarges and Pinch shrinks content around the centre', () => {
  const source = disc(8);
  const before = brightCount(source);
  const bloat = applyFilterEffectsPixels(source, W, H, { type: 'liquify', liquifyMode: 'bloat', amount: 100, radius: 40, centerX: 0.5, centerY: 0.5 });
  const pinch = applyFilterEffectsPixels(source, W, H, { type: 'pinch', amount: 100, radius: 40, centerX: 0.5, centerY: 0.5 });
  assert.ok(brightCount(bloat) > before * 1.2, `bloat grows the disc (${before} → ${brightCount(bloat)})`);
  assert.ok(brightCount(pinch) < before * 0.8, `pinch shrinks the disc (${before} → ${brightCount(pinch)})`);
  // Push moves content along the angle (0° = right) and Twist rotates.
  const bar = rgba(W, H, (x) => x >= 28 && x <= 35 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
  const push = applyFilterEffectsPixels(bar, W, H, { type: 'liquify', liquifyMode: 'push', amount: 100, radius: 64, angle: 0, centerX: 0.5, centerY: 0.5 });
  assert.equal(at(push, W, 38, 24)[0] > 128, true, 'push moves the bar right');
  assert.equal(at(push, W, 28, 24)[0] < 128, true);
});

// ---------------------------------------------------------------------------
// 5. Edit → Fade on a live filter

test('a live filter fade mixes the filter result with its input', () => {
  const effect = { type: 'gaussian-blur', amount: 100, radius: 4 };
  const full = applyFilterEffectsPixels(textured, W, H, effect);
  const half = applyFilterEffectsPixels(textured, W, H, { ...effect, fade: 50 });
  assert.deepEqual(applyFilterEffectsPixels(textured, W, H, { ...effect, fade: 0 }), textured);
  for (let index = 0; index < half.length; index += 1)
    assert.equal(half[index], Math.round(textured[index] * 0.5 + full[index] * 0.5));
  assert.equal(isNeutralFilterEffects({ ...effect, fade: 0 }), true);
  assert.equal(effectiveFilterEffects({ ...effect, fade: 100 }).fade, undefined);
  assert.equal(effectiveFilterEffects({ ...effect, fade: 140 }).fade, undefined);
  assert.equal(effectiveFilterEffects({ ...effect, fade: -3 }).fade, 0);
  assert.equal(effectiveFilterEffects({ ...effect, fade: 37.4 }).fade, 37);
  assert.equal(validFilterEffects(effectiveFilterEffects({ ...effect, fade: 40 })), true);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects(effect), fade: 40.5 }), false);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects(effect), fade: 101 }), false);
  assert.deepEqual(applyFilterFade(new Uint8ClampedArray([0, 100]), new Uint8ClampedArray([200, 0]), 25), new Uint8ClampedArray([50, 75]));
});

test('fade is dropped when another filter is chosen and kept in recorded actions', () => {
  const next = retypeFilterEffects({ type: 'gaussian-blur', amount: 100, radius: 4, fade: 30 }, { type: 'motion-blur' });
  assert.equal(next.fade, undefined);
  assert.equal(JSON.parse(filterActionParameters({ type: 'gaussian-blur', amount: 100, radius: 4, fade: 30 }).filterExtra).fade, 30);
  assert.equal(JSON.parse(filterActionParameters({ type: 'twirl', amount: 100, radius: 20, angle: 50, relativeRadius: true }).filterExtra).relativeRadius, true);
});

test('band rendering of a faded filter matches the full-frame render', () => {
  for (const effect of [
    { type: 'smart-blur', amount: 90, radius: 3, fade: 45 },
    { type: 'path-blur', amount: 90, radius: 6, angle: 20, fade: 60 },
  ]) {
    assert.notEqual(filterBandHalo(effect), undefined, effect.type);
    assert.deepEqual(applyFilterEffectsInBands(textured, W, H, effect, 4), applyFilterEffectsPixels(textured, W, H, effect), effect.type);
  }
});

test('Fade targets the live filter only when the last step changed that filter', () => {
  const blur = { type: 'gaussian-blur', amount: 85, radius: 6 };
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: undefined }, { asset: 'a', filterEffects: blur }).type, 'gaussian-blur');
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: { ...blur, radius: 2 } }, { asset: 'a', filterEffects: blur }).radius, 6);
  // Already faded (the last step only changed the fade): nothing to fade.
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: blur }, { asset: 'a', filterEffects: { ...blur, fade: 40 } }), undefined);
  // Unchanged filter, cleared filter, or a raster edit (new asset).
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: blur }, { asset: 'a', filterEffects: blur }), undefined);
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: blur }, { asset: 'a', filterEffects: undefined }), undefined);
  assert.equal(liveFilterFadeTarget({ asset: 'a', filterEffects: undefined }, { asset: 'b', filterEffects: blur }), undefined);
  assert.equal(liveFilterFadeTarget(undefined, { asset: 'a', filterEffects: blur }), undefined);
});

// ---------------------------------------------------------------------------
// 6. Camera Raw Clarity is midtone local contrast

test('Clarity raises midtone local contrast and leaves flat areas and saturation alone', () => {
  const width = 40, height = 20;
  // Two mid-gray halves either side of a vertical edge.
  const step = rgba(width, height, (x) => x < 20 ? [110, 110, 110, 255] : [150, 150, 150, 255]);
  const plus = applyPhotoAdjustmentsPixels(step, { clarity: 100 }, width, height);
  const minus = applyPhotoAdjustmentsPixels(step, { clarity: -100 }, width, height);
  const edge = (data) => at(data, width, 20, 10)[0] - at(data, width, 19, 10)[0];
  assert.ok(edge(plus) > edge(step) + 10, `positive clarity widens the edge (${edge(step)} → ${edge(plus)})`);
  assert.ok(edge(minus) < edge(step), 'negative clarity softens it');
  // Far from the edge the neighbourhood is flat: nearly unchanged.
  assert.ok(Math.abs(at(plus, width, 2, 10)[0] - 110) <= 2);
  // A flat saturated colour gains no saturation (the old implementation
  // scaled every pixel away from its own grey).
  const flat = rgba(width, height, () => [200, 80, 60, 255]);
  assert.deepEqual(applyPhotoAdjustmentsPixels(flat, { clarity: 100 }, width, height), flat);
  // Near-black and near-white are protected by the midtone weight.
  const dark = rgba(width, height, (x) => x < 20 ? [2, 2, 2, 255] : [12, 12, 12, 255]);
  const darkPlus = applyPhotoAdjustmentsPixels(dark, { clarity: 100 }, width, height);
  assert.ok(Math.abs(edge(darkPlus) - edge(dark)) <= 2);
  // Transparent pixels and alpha are untouched.
  const holes = rgba(width, height, (x, y) => (x + y) % 5 ? [120 + x, 120, 120, 200] : [9, 8, 7, 0]);
  const result = applyPhotoAdjustmentsPixels(holes, { clarity: 80 }, width, height);
  for (let offset = 0; offset < holes.length; offset += 4) {
    assert.equal(result[offset + 3], holes[offset + 3]);
    if (!holes[offset + 3]) assert.deepEqual(Array.from(result.slice(offset, offset + 3)), [9, 8, 7]);
  }
});

// ---------------------------------------------------------------------------
// 7. Sharpen vs Unsharp Mask

test('Sharpen is a fixed kernel, Unsharp Mask keeps its Gaussian reference', () => {
  const sharpen = applyFilterEffectsPixels(textured, W, H, { type: 'sharpen', amount: 100, radius: 6 });
  const unsharp = applyFilterEffectsPixels(textured, W, H, { type: 'unsharp-mask', amount: 100, radius: 6 });
  assert.ok(differs(sharpen, unsharp));
  // Centre 5, edge neighbours −1 at an interior pixel.
  const x = 20, y = 20;
  for (let channel = 0; channel < 3; channel += 1) {
    const value = (px, py) => textured[(py * W + px) * 4 + channel];
    const expected = Math.max(0, Math.min(255, 5 * value(x, y) - value(x - 1, y) - value(x + 1, y) - value(x, y - 1) - value(x, y + 1)));
    assert.equal(sharpen[(y * W + x) * 4 + channel], expected);
  }
  // Sharpen More stays the documented two-pass Gaussian unsharp.
  const more = applyFilterEffectsPixels(textured, W, H, { type: 'sharpen-more', amount: 100, radius: 6 });
  assert.ok(differs(more, sharpen) && differs(more, unsharp));
});

// ---------------------------------------------------------------------------
// 8. Lens Correction / Adaptive Wide Angle radius scales with the layer

test('a relative correction radius reaches across a large layer; legacy radii stay in pixels', () => {
  const width = 400, height = 300;
  assert.equal(correctionInfluenceRadius({ radius: 64, relativeRadius: true }, width, height), 250);
  assert.equal(correctionInfluenceRadius({ radius: 32, relativeRadius: true }, width, height), 125);
  assert.equal(correctionInfluenceRadius({ radius: 64 }, width, height), 64);
  const grid = rgba(width, height, (x, y) => (x % 16 < 2 || y % 16 < 2) ? [250, 250, 250, 255] : [20, 40, 60, 255]);
  for (const type of ['lens-correction', 'adaptive-wide-angle']) {
    const relative = applyFilterEffectsPixels(grid, width, height, { type, amount: 100, radius: 64, relativeRadius: true, centerX: 0.5, centerY: 0.5 });
    const legacy = applyFilterEffectsPixels(grid, width, height, { type, amount: 100, radius: 64, centerX: 0.5, centerY: 0.5 });
    // Count changed pixels farther than 64 px from the centre.
    let farRelative = 0, farLegacy = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (Math.hypot(x - 199.5, y - 149.5) <= 70) continue;
      const offset = (y * width + x) * 4;
      if (relative[offset] !== grid[offset]) farRelative += 1;
      if (legacy[offset] !== grid[offset]) farLegacy += 1;
    }
    assert.equal(farLegacy, 0, `${type} legacy radius stays within 64 px`);
    assert.ok(farRelative > 5000, `${type} relative radius reaches the outer layer (${farRelative})`);
    // Relative records have no bounded pixel overlap, so they never tile.
    assert.equal(tiledNeighborhoodRadius({ type, amount: 100, radius: 64, relativeRadius: true }), undefined);
    assert.equal(tiledNeighborhoodRadius({ type, amount: 100, radius: 64 }), 64);
  }
});
