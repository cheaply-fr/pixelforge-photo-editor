import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  validFilterEffects,
  FILTER_EFFECT_TYPES,
} from '../src/filterEffects.ts';
import {
  DEFAULT_LIGHT_RAYS_SETTINGS,
  DEFAULT_STARBURST_PATCH,
  LIGHT_RAYS_LIMITS,
  LIGHT_RAYS_SOURCE_BUDGET,
  NEW_LIGHT_RAYS_SETTINGS,
  lightRaysBandSafe,
  lightRaysGeometry,
  lightRaysGuide,
  lightRaysPixelExtent,
  normalizeLightRaysSettings,
  renderLightRays,
  validLightRaysSettings,
} from '../src/lightRays.ts';
import {
  applyFilterEffectsInBands,
  filterBandHalo,
  planFilterBands,
  renderFilterBand,
  sliceBandInput,
  validFilterBandProgress,
} from '../src/filterBands.ts';
import { isParallelFilterEffect, renderFilterWorkerRequest } from '../src/filterWorkerPool.ts';
import { isCenteredFilter } from '../src/filterCenter.ts';
import { commonLayer, neutral, validateFrame } from '../src/document.ts';
import { appendActionStep, createActionSet, parseActionSets, serializeActionSets } from '../src/actions.ts';
import { layerFilterCacheKey } from '../src/layerFilterCache.ts';
import { effectiveSmartFilters, appendSmartFilter, replaceSmartFilter } from '../src/smartFilters.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const pixel = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const sum = (values) => values[0] + values[1] + values[2];
const dark = (width, height) => rgba(width, height, () => [10, 12, 20, 255]);
const effect = (lightRays = {}, patch = {}) =>
  effectiveFilterEffects({ type: 'light-rays', amount: 100, centerX: 0.5, centerY: 0.5, seed: 11, lightRays, ...patch });
const equalBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

test('Light Rays is a centred Render filter type with normalized defaults', () => {
  assert.ok(FILTER_EFFECT_TYPES.includes('light-rays'));
  assert.equal(isCenteredFilter('light-rays'), true);
  const normalized = effectiveFilterEffects({ type: 'light-rays', amount: 80 });
  assert.deepEqual(normalized.lightRays, DEFAULT_LIGHT_RAYS_SETTINGS);
  assert.equal(validFilterEffects(normalized), true);
  // Radius is unused: a zero radius is not an identity, amount 0 is.
  assert.equal(isNeutralFilterEffects({ ...normalized, radius: 0 }), false);
  assert.equal(isNeutralFilterEffects({ ...normalized, amount: 0 }), true);
  // Other filter types never carry Light Rays settings.
  assert.equal(effectiveFilterEffects({ type: 'lens-flare', amount: 50, radius: 5, lightRays: DEFAULT_LIGHT_RAYS_SETTINGS }).lightRays, undefined);
});

test('bad Light Rays parameters normalize to bounded values', () => {
  const settings = normalizeLightRaysSettings({
    mode: 'laser', shape: 'hexagon', count: 9999, length: -4, width: 0.7, sharpness: Number.NaN,
    randomness: 140, rotation: -900, innerRadius: '12', falloff: Infinity, color: 'red', intensity: 1e9,
    blend: 'multiply', threshold: 300, extra: 'ignored',
  });
  assert.deepEqual(settings, {
    mode: 'generate', shape: 'rays', count: LIGHT_RAYS_LIMITS.count[1], length: LIGHT_RAYS_LIMITS.length[0],
    width: 0.5, sharpness: DEFAULT_LIGHT_RAYS_SETTINGS.sharpness, randomness: 100, rotation: -180,
    innerRadius: DEFAULT_LIGHT_RAYS_SETTINGS.innerRadius, falloff: DEFAULT_LIGHT_RAYS_SETTINGS.falloff,
    color: DEFAULT_LIGHT_RAYS_SETTINGS.color, intensity: 400, blend: 'screen', threshold: 254,
  });
  assert.equal(normalizeLightRaysSettings({ width: 2.74, count: 3.6, color: '#AbCdEf' }).width, 2.5);
  assert.equal(normalizeLightRaysSettings({ count: 3.6 }).count, 4);
  assert.equal(normalizeLightRaysSettings({ color: '#AbCdEf' }).color, '#abcdef');
  for (const value of [undefined, null, 4, 'rays', [1, 2]])
    assert.deepEqual(normalizeLightRaysSettings(value), DEFAULT_LIGHT_RAYS_SETTINGS);
  assert.equal(validLightRaysSettings(DEFAULT_LIGHT_RAYS_SETTINGS), true);
  assert.equal(validLightRaysSettings({ ...DEFAULT_LIGHT_RAYS_SETTINGS, count: 1 }), false);
  assert.equal(validLightRaysSettings({ ...DEFAULT_LIGHT_RAYS_SETTINGS, color: '#ABCDEF' }), false);
  assert.equal(validLightRaysSettings({ ...DEFAULT_LIGHT_RAYS_SETTINGS, extra: 1 }), false);
  const { blend: _blend, ...missing } = DEFAULT_LIGHT_RAYS_SETTINGS;
  assert.equal(validLightRaysSettings(missing), false);
  const base = effect();
  assert.equal(validFilterEffects({ ...base, lightRays: { ...base.lightRays, mode: 'laser' } }), false);
  assert.equal(validFilterEffects({ ...base, type: 'lens-flare', radius: 4 }), false);
  // A rendered record is the same as a normalized one.
  const source = dark(24, 18);
  assert.deepEqual(
    applyFilterEffectsPixels(source, 24, 18, { type: 'light-rays', amount: 100, seed: 2, lightRays: { count: 1e6, intensity: -5 } }),
    applyFilterEffectsPixels(source, 24, 18, effect({ count: 720, intensity: 0 }, { seed: 2 })),
  );
});

test('Light Rays renders deterministically for a seed and never mutates the source', () => {
  const source = rgba(96, 72, (x, y) => [(x * 5) & 255, (y * 3) & 255, 40, 255]);
  const retained = source.slice();
  const settings = effect({ randomness: 80, count: 30 });
  const first = applyFilterEffectsPixels(source, 96, 72, settings);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 96, 72, settings));
  assert.deepEqual(source, retained);
  assert.notDeepEqual(first, source);
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, 96, 72, { ...settings, seed: 12 }));
  // Without randomness the seed has no effect on generated rays.
  const even = effect({ randomness: 0 });
  assert.deepEqual(
    applyFilterEffectsPixels(source, 96, 72, even),
    applyFilterEffectsPixels(source, 96, 72, { ...even, seed: 999 }),
  );
  // Every pixel is brightened or unchanged with Screen.
  for (let index = 0; index < first.length; index += 1) assert.ok(first[index] >= source[index]);
});

test('ray geometry has the requested count, even spacing, rotation and seeded variation', () => {
  const evenRays = lightRaysGeometry({ count: 12, randomness: 0, rotation: 15 }, 200, 100, 0.5, 0.5, 4);
  assert.equal(evenRays.rays.length, 12);
  assert.equal(evenRays.centreX, 99.5);
  assert.equal(evenRays.centreY, 49.5);
  assert.equal(evenRays.length, 0.8 * 50);
  for (let index = 0; index < 12; index += 1) {
    const expected = ((15 + index * 30) * Math.PI) / 180;
    assert.ok(Math.abs(evenRays.rays[index].angle - expected) < 1e-9);
    assert.equal(evenRays.rays[index].length, 40);
    assert.equal(evenRays.rays[index].brightness, 1);
  }
  const varied = lightRaysGeometry({ count: 64, randomness: 100 }, 400, 400, 0.5, 0.5, 9);
  assert.equal(varied.rays.length, 64);
  for (let index = 1; index < 64; index += 1) assert.ok(varied.rays[index].angle >= varied.rays[index - 1].angle);
  assert.ok(new Set(varied.rays.map((ray) => ray.length.toFixed(3))).size > 32);
  assert.ok(varied.rays.every((ray) => ray.length > 0 && ray.length <= varied.length && ray.brightness >= 0.25 && ray.brightness <= 1));
  assert.deepEqual(varied, lightRaysGeometry({ count: 64, randomness: 100 }, 400, 400, 0.5, 0.5, 9));
  // Starburst alternates long and short spikes.
  const star = lightRaysGeometry({ ...DEFAULT_STARBURST_PATCH, count: 8 }, 200, 200, 0.5, 0.5, 1);
  assert.equal(star.rays.length, 8);
  assert.deepEqual([...new Set(star.rays.map((ray) => Math.round(ray.length)))].sort((a, b) => a - b), [22, 40]);
});

test('rays land on their angles: four axis rays light the axes, not the diagonals', () => {
  const width = 121, height = 121;
  const output = applyFilterEffectsPixels(dark(width, height), width, height,
    effect({ count: 4, randomness: 0, width: 1.5, sharpness: 0, falloff: 0, length: 100, color: '#ffffff' }));
  const base = sum([10, 12, 20]);
  for (const [x, y] of [[90, 60], [30, 60], [60, 90], [60, 30]])
    assert.ok(sum(pixel(output, width, x, y)) > base + 300, `${x},${y}`);
  for (const [x, y] of [[85, 85], [35, 35], [85, 35], [35, 85], [90, 66]])
    assert.ok(sum(pixel(output, width, x, y)) < base + 20, `${x},${y}`);
  // Counting bright crossings of a circle around the centre gives the ray count.
  for (const count of [3, 4, 7, 12]) {
    const rays = applyFilterEffectsPixels(dark(width, height), width, height,
      effect({ count, randomness: 0, width: 1, sharpness: 0, falloff: 0, length: 100, rotation: 7, color: '#ffffff' }));
    let crossings = 0, inside = false;
    for (let step = 0; step <= 720; step += 1) {
      const angle = (step / 720) * Math.PI * 2;
      const lit = sum(pixel(rays, width, Math.round(60 + Math.cos(angle) * 40), Math.round(60 + Math.sin(angle) * 40))) > base + 200;
      if (lit && !inside) crossings += 1;
      inside = lit;
    }
    assert.equal(crossings, count, `count ${count}`);
  }
});

test('rays start outside the inner radius and stop at their length', () => {
  const width = 141, height = 141;
  const source = dark(width, height);
  const output = applyFilterEffectsPixels(source, width, height,
    effect({ count: 180, randomness: 0, innerRadius: 40, length: 40, width: 3, falloff: 0 }));
  // Half the shorter side is 70.5: inner radius 28.2 px, rays to 56.4 px.
  let insideChanged = 0, ringLit = 0, ringTotal = 0, outsideChanged = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - 70, y - 70);
      const changed = !equalBytes(pixel(output, width, x, y), pixel(source, width, x, y));
      if (distance <= 28) insideChanged += changed ? 1 : 0;
      else if (distance >= 33 && distance <= 50) {
        ringTotal += 1;
        ringLit += sum(pixel(output, width, x, y)) > sum([10, 12, 20]) + 30 ? 1 : 0;
      } else if (distance >= 58) outsideChanged += changed ? 1 : 0;
    }
  assert.equal(insideChanged, 0);
  assert.equal(outsideChanged, 0);
  assert.ok(ringLit / ringTotal > 0.9, `${ringLit}/${ringTotal}`);
});

test('Screen and Add keep alpha and transparent padding byte-identical', () => {
  const source = rgba(40, 30, (x, y) =>
    x < 6 ? [255, 0, 255, 0] : x === 20 && y === 15 ? [40, 80, 120, 128] : [30, 40, 50, (x * 9) & 255 || 1]);
  for (const blend of ['screen', 'add']) {
    for (const mode of ['generate', 'source']) {
      const output = applyFilterEffectsPixels(source, 40, 30,
        effect({ blend, mode, threshold: 0, count: 24, length: 200, intensity: 300 }, { centerX: 0.1 }));
      for (let offset = 0; offset < source.length; offset += 4) {
        assert.equal(output[offset + 3], source[offset + 3], `${blend}/${mode} alpha at ${offset}`);
        if (source[offset + 3] === 0)
          assert.deepEqual(Array.from(output.slice(offset, offset + 4)), [255, 0, 255, 0], `${blend}/${mode} padding`);
      }
      assert.ok(output.some((value, index) => index % 4 !== 3 && value > source[index]), `${blend}/${mode} lit`);
    }
  }
  // Add is brighter than Screen for the same light.
  const opaque = rgba(40, 30, () => [120, 120, 120, 255]);
  const screen = applyFilterEffectsPixels(opaque, 40, 30, effect({ blend: 'screen' }));
  const add = applyFilterEffectsPixels(opaque, 40, 30, effect({ blend: 'add' }));
  assert.ok(add.reduce((a, b) => a + b, 0) > screen.reduce((a, b) => a + b, 0));
});

test('render on transparent fills empty pixels with the ray colour', () => {
  const empty = new Uint8ClampedArray(60 * 40 * 4);
  const settings = effect({ blend: 'transparent', color: '#ff8000', count: 16, randomness: 0 });
  const output = applyFilterEffectsPixels(empty, 60, 40, settings);
  assert.deepEqual(output, applyFilterEffectsPixels(empty, 60, 40, settings));
  const lit = [];
  for (let offset = 0; offset < output.length; offset += 4) if (output[offset + 3] > 0) lit.push(offset);
  assert.ok(lit.length > 100);
  for (const offset of lit) {
    // Colour keeps the ray hue (red ≥ green ≥ blue = 0).
    assert.equal(output[offset + 2], 0);
    assert.ok(output[offset] >= output[offset + 1]);
  }
  // Far corners stay empty.
  assert.deepEqual(pixel(output, 60, 0, 0), [0, 0, 0, 0]);
  // Screen/Add leave an empty layer empty.
  assert.deepEqual(applyFilterEffectsPixels(empty, 60, 40, effect({ blend: 'screen' })), empty);
  // Opaque pixels composite exactly like Screen.
  const opaque = rgba(60, 40, (x) => [x * 3, 50, 90, 255]);
  assert.deepEqual(
    applyFilterEffectsPixels(opaque, 60, 40, effect({ blend: 'transparent' })),
    applyFilterEffectsPixels(opaque, 60, 40, effect({ blend: 'screen' })),
  );
});

test('a new Light Rays filter lights a mostly empty layer beyond its painted pixels', () => {
  // New filters start in "Render on transparent"; everything else matches the defaults.
  assert.equal(NEW_LIGHT_RAYS_SETTINGS.blend, 'transparent');
  assert.deepEqual({ ...NEW_LIGHT_RAYS_SETTINGS, blend: 'screen' }, DEFAULT_LIGHT_RAYS_SETTINGS);
  assert.ok(validLightRaysSettings(NEW_LIGHT_RAYS_SETTINGS));
  // Legacy records without a blend keep Screen.
  const { blend: _omitted, ...legacy } = DEFAULT_LIGHT_RAYS_SETTINGS;
  assert.equal(normalizeLightRaysSettings(legacy).blend, 'screen');

  // A small painted glow in the middle of an otherwise empty 120×80 layer.
  const width = 120, height = 80;
  const layer = rgba(width, height, (x, y) => (Math.hypot(x - 60, y - 40) < 8 ? [140, 196, 255, 200] : [0, 0, 0, 0]));
  const painted = (offset) => layer[offset + 3] > 0;
  const outside = (output) => {
    let count = 0;
    for (let offset = 0; offset < output.length; offset += 4) if (!painted(offset) && output[offset + 3] > 0) count += 1;
    return count;
  };
  const settings = { ...NEW_LIGHT_RAYS_SETTINGS, count: 12, randomness: 0, length: 90 };
  const fresh = applyFilterEffectsPixels(layer, width, height, effect(settings));
  // Rays reach far past the painted glow…
  assert.ok(outside(fresh) > 400, `only ${outside(fresh)} pixels lit outside the glow`);
  // …while Screen (the old default) stays clipped to the painted pixels.
  assert.equal(outside(applyFilterEffectsPixels(layer, width, height, effect({ ...settings, blend: 'screen' }))), 0);
  // The painted glow itself still brightens.
  assert.ok(sum(pixel(fresh, width, 60, 40)) >= sum(pixel(layer, width, 60, 40)));
});

test('Starburst renders sharp spikes with a bright core', () => {
  const width = 101, height = 101;
  const output = applyFilterEffectsPixels(dark(width, height), width, height,
    effect({ ...DEFAULT_STARBURST_PATCH, count: 4, rotation: 0, width: 3, length: 80, color: '#ffffff' }));
  const base = sum([10, 12, 20]);
  assert.ok(sum(pixel(output, width, 50, 50)) > 600);
  // Spikes taper to a point: wider near the core than near the tip.
  const across = (distance) => {
    let lit = 0;
    for (let offset = -10; offset <= 10; offset += 1) lit += sum(pixel(output, width, 50 + distance, 50 + offset)) > base + 40 ? 1 : 0;
    return lit;
  };
  assert.ok(across(12) > across(32), `${across(12)} > ${across(32)}`);
  assert.ok(across(32) >= 1);
  assert.ok(sum(pixel(output, width, 75, 75)) < base + 10);
});

test('source mode streaks bright pixels outward from the centre', () => {
  const width = 160, height = 120;
  const source = rgba(width, height, (x, y) => (Math.abs(x - 100) <= 2 && Math.abs(y - 60) <= 2 ? [255, 255, 255, 255] : [10, 12, 20, 255]));
  const settings = effect({ mode: 'source', length: 120, randomness: 0, threshold: 100, color: '#ffffff', falloff: 20 }, { centerX: 0.25 });
  // Centre at x ≈ 39.75, y = 59.5; the glint is at x = 100.
  const output = applyFilterEffectsPixels(source, width, height, settings);
  assert.deepEqual(output, applyFilterEffectsPixels(source, width, height, settings));
  const base = sum([10, 12, 20]);
  assert.ok(sum(pixel(output, width, 115, 60)) > base + 30, 'streak beyond the glint');
  assert.ok(sum(pixel(output, width, 130, 60)) > base + 15, 'streak continues outward');
  assert.ok(sum(pixel(output, width, 115, 60)) > sum(pixel(output, width, 130, 60)), 'streak decays');
  assert.ok(sum(pixel(output, width, 85, 60)) < base + 4, 'nothing toward the centre');
  assert.ok(sum(pixel(output, width, 115, 90)) < base + 4, 'nothing off the ray');
  // A dark layer (all below the threshold) is unchanged.
  const flat = dark(width, height);
  assert.deepEqual(applyFilterEffectsPixels(flat, width, height, settings), flat);
  // Inner radius masks streaks close to the centre.
  const masked = applyFilterEffectsPixels(source, width, height, { ...settings, lightRays: { ...settings.lightRays, innerRadius: 100 } });
  assert.ok(sum(pixel(masked, width, 95, 60)) <= sum(pixel(source, width, 95, 60)) + 1);
  assert.ok(sum(pixel(masked, width, 115, 60)) > base + 30);
  // Randomness varies streak brightness by angle, deterministically per seed.
  const ring = rgba(width, height, (x, y) => (Math.abs(Math.hypot(x - 80, y - 60) - 20) < 1.5 ? [255, 255, 255, 255] : [10, 12, 20, 255]));
  const varied = effect({ mode: 'source', randomness: 100, count: 12, threshold: 100 });
  const first = applyFilterEffectsPixels(ring, width, height, varied);
  assert.notDeepEqual(first, applyFilterEffectsPixels(ring, width, height, { ...varied, seed: 77 }));
  assert.deepEqual(first, applyFilterEffectsPixels(ring, width, height, varied));
});

test('source mode downsamples large layers to a bounded working buffer', () => {
  assert.ok(LIGHT_RAYS_SOURCE_BUDGET <= 4 * 1024 * 1024);
  const width = 2400, height = 1000;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < source.length; offset += 4) source[offset + 3] = 255;
  source.set([255, 255, 255, 255], (500 * width + 1500) * 4);
  for (let dy = -3; dy <= 3; dy += 1)
    for (let dx = -3; dx <= 3; dx += 1) source.set([255, 240, 200, 255], ((500 + dy) * width + 1500 + dx) * 4);
  const output = applyFilterEffectsPixels(source, width, height, effect({ mode: 'source', randomness: 0, threshold: 50, length: 150 }));
  assert.ok(sum(pixel(output, width, 1560, 500)) > 10, 'glint streaks outward at full resolution');
  assert.equal(sum(pixel(output, width, 600, 500)), 0, 'nothing toward the opposite side');
});

test('generated Light Rays are band-safe and byte-identical in parallel bands', () => {
  const width = 90, height = 71;
  const source = rgba(width, height, (x, y) => [(x * 7) & 255, (y * 5) & 255, 60, x === 3 ? 0 : 255]);
  const settings = effect({ count: 40, randomness: 70, innerRadius: 10, width: 2 }, { centerX: 0.31, centerY: 0.62, seed: 5 });
  assert.equal(lightRaysBandSafe(settings.lightRays), true);
  assert.equal(filterBandHalo(settings), 0);
  assert.equal(isParallelFilterEffect(settings), true);
  const serial = applyFilterEffectsPixels(source, width, height, settings);
  for (const bands of [1, 2, 5, 13]) assert.deepEqual(applyFilterEffectsInBands(source, width, height, settings, bands), serial, `${bands} bands`);
  // Worker protocol: one band rendered from a worker request.
  const [band] = planFilterBands(height, 0, 3, 1).slice(1);
  const input = sliceBandInput(source, width, band);
  const request = {
    kind: 'band', id: 1, effect: settings, width, height,
    readStart: band.readStart, readRows: band.readEnd - band.readStart, start: band.start, end: band.end,
    pixels: input.buffer,
  };
  assert.deepEqual(renderFilterWorkerRequest(request), serial.slice(band.start * width * 4, band.end * width * 4));
  assert.deepEqual(renderFilterBand({ ...request, pixels: input }), serial.slice(band.start * width * 4, band.end * width * 4));
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'light-rays', completed: 1, total: 4 }), true);
  // Source mode needs the whole frame and stays a single job.
  const streaks = effect({ mode: 'source' });
  assert.equal(filterBandHalo(streaks), undefined);
  assert.equal(isParallelFilterEffect(streaks), false);
  assert.deepEqual(applyFilterEffectsInBands(source, width, height, streaks, 4), applyFilterEffectsPixels(source, width, height, streaks));
  assert.throws(() => renderLightRays(source, source.slice(), width, height,
    { settings: streaks.lightRays, centerX: 0.5, centerY: 0.5, seed: 1, strength: 1 },
    { rowOffset: 0, fullHeight: height, start: 0, end: 10 }), /band/);
});

test('amount and intensity scale the light; zero is an identity with a detached buffer', () => {
  const source = rgba(50, 40, () => [40, 40, 40, 255]);
  const total = (data) => data.reduce((a, b) => a + b, 0);
  const half = applyFilterEffectsPixels(source, 50, 40, effect({}, { amount: 50 }));
  const full = applyFilterEffectsPixels(source, 50, 40, effect({}, { amount: 100 }));
  const bright = applyFilterEffectsPixels(source, 50, 40, effect({ intensity: 300 }));
  assert.ok(total(source) < total(half) && total(half) < total(full) && total(full) < total(bright));
  for (const settings of [effect({}, { amount: 0 }), effect({ intensity: 0 })]) {
    const output = applyFilterEffectsPixels(source, 50, 40, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  assert.equal(applyFilterEffectsPixels(tiny, 1, 1, effect())[3], 85);
  assert.equal(applyFilterEffectsPixels(tiny, 1, 1, effect({ mode: 'source', threshold: 0 }))[3], 85);
});

test('Light Rays metadata persists, stacks, keys the filter cache and is action allow-listed', () => {
  const settings = effect({ count: 300, width: 1.5, innerRadius: 20, color: '#ffd27a', blend: 'add' }, { centerX: 0.4321, centerY: 0.61 });
  const layer = {
    ...commonLayer('Light rays'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = { w: 5, h: 3, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
  assert.throws(() => validateFrame({
    ...restored,
    layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, lightRays: { ...settings.lightRays, count: 0 } } } }],
  }), /Invalid layer document/);
  // Filter stacks keep the settings and an edited entry replaces them.
  const stack = appendSmartFilter([], settings);
  assert.deepEqual(effectiveSmartFilters(stack)[0].lightRays, settings.lightRays);
  const edited = replaceSmartFilter(stack, 0, { ...settings, lightRays: { ...settings.lightRays, count: 12 } });
  assert.equal(effectiveSmartFilters(edited)[0].lightRays.count, 12);
  // The layer filter cache key changes with any Light Rays parameter.
  const assets = { a: { url: 'data:image/png;base64,AAAA', w: 8, h: 8 } };
  const raster = (filterEffects) => ({ kind: 'raster', asset: 'a', adjustments: { filterEffects } });
  const key = layerFilterCacheKey(raster(settings), assets);
  assert.equal(typeof key, 'string');
  assert.equal(layerFilterCacheKey(raster({ ...settings }), assets), key);
  assert.notEqual(layerFilterCacheKey(raster({ ...settings, lightRays: { ...settings.lightRays, rotation: 1 } }), assets), key);
  assert.notEqual(layerFilterCacheKey(raster({ ...settings, centerX: 0.5 }), assets), key);
  const now = new Date('2026-11-07T01:00:00Z');
  const action = appendActionStep(createActionSet('Rays', 'light-rays-action', now), 'filter-light-rays', 'Light Rays');
  assert.equal(parseActionSets(serializeActionSets([action]))[0].steps[0].command, 'filter-light-rays');
});

test('Light Rays stays within a performance bound on a 2646 × 4096 layer', () => {
  const width = 2646, height = 4096;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let index = 0, offset = 0; offset < source.length; index += 1, offset += 4) {
    source[offset] = (index * 7) & 255;
    source[offset + 1] = (index * 13) & 255;
    source[offset + 2] = (index >> 5) & 255;
    source[offset + 3] = 255;
  }
  const timings = {};
  for (const [name, lightRays] of [
    ['iris fibres', { count: 360, width: 1.5, length: 60, innerRadius: 15, randomness: 70 }],
    ['long flare rays', { count: 24, width: 6, length: 200, randomness: 50 }],
    ['starburst', { ...DEFAULT_STARBURST_PATCH }],
    ['bright streaks', { mode: 'source', length: 150 }],
  ]) {
    const started = performance.now();
    const output = applyFilterEffectsPixels(source, width, height, effect(lightRays, { centerY: 0.4 }));
    timings[name] = performance.now() - started;
    assert.equal(output.length, source.length);
  }
  // Generous bounds for shared CI runners; local serial renders are ~0.3–2.5 s.
  for (const [name, elapsed] of Object.entries(timings)) assert.ok(elapsed < 20_000, `${name} took ${Math.round(elapsed)} ms`);
});

test('the on-canvas extent guide matches the renderer extent and the centre handle mapping', () => {
  const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
  // 2646 x 4096 layer: base = 1323 px. Inner 60% -> 793.8 px, length 80% -> 1058.4 px.
  const settings = { innerRadius: 60, length: 80, falloff: 50 };
  const guide = lightRaysGuide(settings, 2646, 4096, 0.5, 0.25);
  const extent = lightRaysPixelExtent(settings, 2646, 4096);
  const ring = (kind) => guide.rings.find((item) => item.kind === kind);
  close(ring('inner').radius, 793.8, 'inner radius');
  close(ring('outer').radius, 793.8 + 1058.4, 'outer radius');
  close(ring('fade').radius, extent.visibleRadius, 'fade radius');
  assert.ok(ring('fade').radius < ring('outer').radius && ring('fade').radius > ring('inner').radius);
  // Same centre as the renderer.
  const geometry = lightRaysGeometry(settings, 2646, 4096, 0.5, 0.25, 1);
  close(guide.centreX, geometry.centreX, 'centre x');
  close(guide.centreY, geometry.centreY, 'centre y');
  close(guide.frameX, 0.5 * 2645, 'identity frame x');
  // Identity matrix at 100% view: view radii are layer pixels.
  close(ring('outer').viewRadiusX, ring('outer').radius, 'identity view radius');

  // A layer scaled 0.5 and placed at (10, 20), viewed at 200% zoom.
  const scaled = lightRaysGuide(settings, 2646, 4096, 0.5, 0.25, [0.5, 0, 0, 0.5, 10, 20], 2);
  close(scaled.frameX, 0.5 * 0.5 * 2645 + 10, 'scaled frame x');
  close(scaled.frameY, 0.5 * 0.25 * 4095 + 20, 'scaled frame y');
  const scaledInner = scaled.rings.find((item) => item.kind === 'inner');
  close(scaledInner.viewRadiusX, 793.8, 'scaled + zoomed inner radius');
  close(scaledInner.viewRadiusY, 793.8, 'scaled + zoomed inner radius y');
  // Rotation keeps the radius; non-uniform scale gives an ellipse.
  const angle = Math.PI / 6;
  const rotated = lightRaysGuide(settings, 200, 100, 0.5, 0.5, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]);
  close(rotated.rings[1].viewRadiusX, rotated.rings[1].radius, 'rotated radius');
  const stretched = lightRaysGuide(settings, 200, 100, 0.5, 0.5, [2, 0, 0, 1, 0, 0]);
  close(stretched.rings[0].viewRadiusX, 2 * stretched.rings[0].radius, 'stretched x');
  close(stretched.rings[0].viewRadiusY, stretched.rings[0].radius, 'stretched y');
  assert.deepEqual(stretched.transform, [2, 0, 0, 1, 0, 0]);

  // Source streaks decay exponentially, so they have no fade ring.
  assert.deepEqual(lightRaysGuide({ ...settings, mode: 'source' }, 200, 100, 0.5, 0.5).rings.map((item) => item.kind), ['inner', 'outer']);
  // Malformed input normalizes like the renderer.
  const fallback = lightRaysGuide({ innerRadius: 'x', length: 9999 }, 200, 100, Number.NaN, 2, [Number.NaN, 0, 0, 1, 0, 0], -1);
  close(fallback.rings[0].radius, 0, 'default inner radius');
  close(fallback.rings[1].radius, 150, 'length clamps to 300% of 50 px');
  close(fallback.centreX, 0.5 * 199, 'NaN centre falls back to the middle');
  close(fallback.centreY, 99, 'centre clamps to the layer');
  assert.deepEqual(fallback.transform, [1, 0, 0, 1, 0, 0]);
});
