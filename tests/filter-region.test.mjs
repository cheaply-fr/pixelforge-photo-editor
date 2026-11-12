import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILTER_REGION_POINTS,
  blendThroughRegion,
  describeFilterRegion,
  filterRegionFromSelection,
  rasterizeFilterRegion,
  validFilterRegion,
} from '../src/filterRegion.ts';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  retypeFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { effectiveSmartFilters } from '../src/smartFilters.ts';

const IDENTITY = [1, 0, 0, 1, 0, 0];
const FRAME = { w: 40, h: 30 };
const rect = (x, y, w, h, extra = {}) => ({ shape: 'rectangle', x, y, w, h, feather: 0, inverted: false, ...extra });
const at = (mask, width, x, y) => mask[y * width + x];

test('a rectangular marquee becomes a surface-normalised region with a canvas clip', () => {
  const region = filterRegionFromSelection(rect(10, 5, 20, 10), IDENTITY, 40, 30, FRAME);
  assert.ok(region && validFilterRegion(region));
  assert.equal(region.parts.length, 1);
  assert.equal(region.parts[0].operation, 'replace');
  assert.deepEqual(region.parts[0].points, [
    { x: 0.25, y: 5 / 30 },
    { x: 0.75, y: 5 / 30 },
    { x: 0.75, y: 0.5 },
    { x: 0.25, y: 0.5 },
  ]);
  assert.equal(region.feather, 0);
  assert.equal(region.inverted, false);
  assert.equal(region.clip.length, 4);
  assert.equal(describeFilterRegion(region), 'rectangular selection');
});

test('rasterised rectangle covers exactly the selected pixels', () => {
  const region = filterRegionFromSelection(rect(10, 5, 20, 10), IDENTITY, 40, 30, FRAME);
  const mask = rasterizeFilterRegion(region, 40, 30);
  let covered = 0;
  for (let y = 0; y < 30; y += 1)
    for (let x = 0; x < 40; x += 1) {
      const inside = x >= 10 && x < 30 && y >= 5 && y < 15;
      assert.equal(at(mask, 40, x, y), inside ? 255 : 0, `pixel ${x},${y}`);
      if (inside) covered += 1;
    }
  assert.equal(covered, 200);
});

test('a translated, scaled layer maps the selection into its own pixels', () => {
  // The layer surface is 20x15 drawn at 2x from (4, 2): canvas = 2 * local + offset.
  const matrix = [2, 0, 0, 2, 4, 2];
  const region = filterRegionFromSelection(rect(8, 6, 16, 8), matrix, 20, 15, FRAME);
  const mask = rasterizeFilterRegion(region, 20, 15);
  // Canvas x 8..24 -> local 2..10; canvas y 6..14 -> local 2..6.
  assert.equal(at(mask, 20, 2, 2), 255);
  assert.equal(at(mask, 20, 9, 5), 255);
  assert.equal(at(mask, 20, 10, 5), 0);
  assert.equal(at(mask, 20, 1, 3), 0);
  assert.equal(at(mask, 20, 5, 6), 0);
});

test('ellipse, polygon, add/subtract/intersect parts, inversion and feather', () => {
  const ellipse = rasterizeFilterRegion(
    filterRegionFromSelection({ ...rect(0, 0, 40, 30), shape: 'ellipse' }, IDENTITY, 40, 30, FRAME), 40, 30);
  assert.equal(at(ellipse, 40, 20, 15), 255);
  assert.equal(at(ellipse, 40, 0, 0), 0);
  assert.ok([...ellipse].some((value) => value > 0 && value < 255), 'edge pixels are anti-aliased');

  const polygon = rasterizeFilterRegion(filterRegionFromSelection({
    ...rect(0, 0, 40, 30), shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 30 }],
  }, IDENTITY, 40, 30, FRAME), 40, 30);
  assert.equal(at(polygon, 40, 2, 2), 255);
  assert.equal(at(polygon, 40, 38, 28), 0);

  const parts = filterRegionFromSelection({
    ...rect(0, 0, 40, 30),
    parts: [
      { shape: 'rectangle', x: 0, y: 0, w: 20, h: 30, operation: 'replace' },
      { shape: 'rectangle', x: 30, y: 0, w: 10, h: 30, operation: 'add' },
      { shape: 'rectangle', x: 0, y: 0, w: 40, h: 10, operation: 'subtract' },
      { shape: 'rectangle', x: 0, y: 0, w: 35, h: 30, operation: 'intersect' },
    ],
  }, IDENTITY, 40, 30, FRAME);
  const composed = rasterizeFilterRegion(parts, 40, 30);
  assert.equal(at(composed, 40, 5, 20), 255);
  assert.equal(at(composed, 40, 25, 20), 0, 'gap between the added parts');
  assert.equal(at(composed, 40, 32, 20), 255);
  assert.equal(at(composed, 40, 37, 20), 0, 'outside the intersection');
  assert.equal(at(composed, 40, 5, 5), 0, 'subtracted band');

  const inverted = rasterizeFilterRegion(
    filterRegionFromSelection(rect(10, 5, 20, 10, { inverted: true }), IDENTITY, 40, 30, FRAME), 40, 30);
  assert.equal(at(inverted, 40, 0, 0), 255);
  assert.equal(at(inverted, 40, 20, 10), 0);

  const feathered = rasterizeFilterRegion(
    filterRegionFromSelection(rect(10, 5, 20, 10, { feather: 3 }), IDENTITY, 40, 30, FRAME), 40, 30);
  assert.ok(at(feathered, 40, 10, 10) > 40 && at(feathered, 40, 10, 10) < 215, 'soft edge');
  assert.ok(at(feathered, 40, 20, 10) > 200, 'solid centre');
  assert.ok(at(feathered, 40, 2, 10) < 10, 'far outside stays clear');
});

test('an inverted selection never reaches past the canvas', () => {
  // A 60x30 layer starting 10 px left of the canvas.
  const region = filterRegionFromSelection(rect(10, 5, 5, 5, { inverted: true }), [1, 0, 0, 1, -10, 0], 60, 30, FRAME);
  const mask = rasterizeFilterRegion(region, 60, 30);
  assert.equal(at(mask, 60, 5, 10), 0, 'left of the canvas');
  assert.equal(at(mask, 60, 55, 10), 0, 'right of the canvas');
  assert.equal(at(mask, 60, 12, 10), 255);
});

test('colour-based selections, singular layers and oversized outlines are rejected', () => {
  assert.equal(filterRegionFromSelection(rect(0, 0, 10, 10, { mask: 'asset-1' }), IDENTITY, 40, 30, FRAME), undefined);
  assert.equal(filterRegionFromSelection(rect(0, 0, 10, 10), [0, 0, 0, 0, 0, 0], 40, 30, FRAME), undefined);
  const points = Array.from({ length: MAX_FILTER_REGION_POINTS }, (_, i) => ({ x: i % 40, y: (i * 7) % 30 }));
  assert.equal(filterRegionFromSelection({ ...rect(0, 0, 40, 30), shape: 'polygon', points }, IDENTITY, 40, 30, FRAME), undefined);
});

test('validation rejects malformed regions', () => {
  const good = filterRegionFromSelection(rect(10, 5, 20, 10), IDENTITY, 40, 30, FRAME);
  assert.equal(validFilterRegion(good), true);
  for (const bad of [
    null,
    [],
    { ...good, parts: [] },
    { ...good, feather: -1 },
    { ...good, feather: 2 },
    { ...good, inverted: 'no' },
    { ...good, parts: [{ operation: 'xor', points: good.parts[0].points }] },
    { ...good, parts: [{ operation: 'add', points: good.parts[0].points.slice(0, 2) }] },
    { ...good, parts: [{ operation: 'add', points: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 1 }] }] },
    { ...good, clip: [{ x: 0, y: 0 }] },
  ])
    assert.equal(validFilterRegion(bad), false, JSON.stringify(bad)?.slice(0, 80));
});

test('blending keeps unselected pixels byte-identical and fades premultiplied at edges', () => {
  const source = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0, 50, 60, 70, 128]);
  const filtered = new Uint8ClampedArray([200, 100, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255]);
  const out = blendThroughRegion(source, filtered, new Uint8ClampedArray([0, 255, 128]));
  assert.deepEqual(Array.from(out.slice(0, 4)), [10, 20, 30, 255]);
  assert.deepEqual(Array.from(out.slice(4, 8)), [255, 0, 0, 255]);
  // Half-way over a half-transparent pixel: alpha mixes, colour is weighted by alpha.
  assert.equal(out[11], Math.round(128 * (127 / 255) + 255 * (128 / 255)));
  assert.ok(out[8] > 50 && out[8] < 255);
  assert.throws(() => blendThroughRegion(source, filtered, new Uint8ClampedArray(2)));
});

test('filter effects keep a valid region across normalisation, parameter edits and the filter stack', () => {
  const region = filterRegionFromSelection(rect(10, 5, 20, 10), IDENTITY, 40, 30, FRAME);
  const clouds = effectiveFilterEffects({
    type: 'clouds', amount: 100, radius: 16, seed: 3,
    cloudRender: { foreground: '#ffffff', background: '#000000', scale: 8, fill: true },
    region,
  });
  assert.deepEqual(clouds.region, region);
  assert.equal(validFilterEffects(clouds), true);
  assert.deepEqual(effectiveFilterEffects({ ...clouds, amount: 50 }).region, region);
  assert.equal(effectiveFilterEffects({ ...clouds, region: { parts: [] } }).region, undefined);
  assert.equal(validFilterEffects({ ...clouds, region: { parts: [] } }), false);
  const [stacked] = effectiveSmartFilters([clouds]);
  assert.deepEqual(stacked.region, region);
  // Retyping carries the previous region; the page replaces or removes it explicitly.
  assert.deepEqual(retypeFilterEffects(clouds, { type: 'gaussian-blur' }).region, region);
});

test('Clouds through a region renders only inside the selection of an empty layer', () => {
  const width = 40, height = 30;
  const empty = new Uint8ClampedArray(width * height * 4);
  const effect = effectiveFilterEffects({
    type: 'clouds', amount: 100, radius: 16, seed: 3,
    cloudRender: { foreground: '#ffffff', background: '#202020', scale: 8, fill: true },
  });
  const filtered = applyFilterEffectsPixels(empty, width, height, effect);
  // Unconfined Clouds fills every pixel (the reported behaviour)...
  for (let i = 3; i < filtered.length; i += 4) assert.equal(filtered[i], 255);
  const region = filterRegionFromSelection(rect(10, 5, 20, 10), IDENTITY, width, height, FRAME);
  const out = blendThroughRegion(empty, filtered, rasterizeFilterRegion(region, width, height));
  // ...while the region keeps it inside the marquee.
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const inside = x >= 10 && x < 30 && y >= 5 && y < 15;
      assert.equal(out[(y * width + x) * 4 + 3], inside ? 255 : 0, `alpha ${x},${y}`);
    }
});

test('Lens Flare fills transparent pixels only when asked', () => {
  const width = 48, height = 32;
  const empty = new Uint8ClampedArray(width * height * 4);
  const base = { type: 'lens-flare', amount: 75, radius: 36, angle: 0, centerX: 0.5, centerY: 0.5, seed: 7 };
  const legacy = applyFilterEffectsPixels(empty, width, height, effectiveFilterEffects(base));
  assert.ok(legacy.every((value) => value === 0), 'legacy records leave an empty layer empty');
  const effect = effectiveFilterEffects({ ...base, flareFill: true });
  assert.equal(effect.flareFill, true);
  assert.equal(validFilterEffects(effect), true);
  const lit = applyFilterEffectsPixels(empty, width, height, effect);
  const centre = ((16 * width) + 24) * 4;
  assert.ok(lit[centre + 3] > 200, 'bright core is nearly opaque');
  const corner = 3;
  assert.ok(lit[corner] < lit[centre + 3], 'coverage falls off away from the core');
  let lightPixels = 0;
  for (let i = 3; i < lit.length; i += 4) if (lit[i] > 0) lightPixels += 1;
  assert.ok(lightPixels > 20 && lightPixels <= width * height);
  // On opaque pixels the option changes nothing.
  const opaque = new Uint8ClampedArray(width * height * 4).fill(90);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  assert.deepEqual(
    applyFilterEffectsPixels(opaque, width, height, effect),
    applyFilterEffectsPixels(opaque, width, height, effectiveFilterEffects(base)),
  );
  // flareFill is a Lens Flare setting only.
  assert.equal(effectiveFilterEffects({ ...base, type: 'clouds', flareFill: true }).flareFill, undefined);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects({ ...base, type: 'gaussian-blur' }), flareFill: true }), false);
});
