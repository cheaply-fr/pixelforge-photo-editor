import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySpotHealingStroke,
  applySpotHealingStrokes,
  validSpotHealingStroke,
} from '../src/spotHealing.ts';
import { applyPatchStrokes } from '../src/patchTool.ts';
import { layerFilterCacheKey } from '../src/layerFilterCache.ts';
import { prepareDraftForStorage, validateDraft } from '../src/drafts.ts';
import { neutral, referencedAssets } from '../src/document.ts';

const rgba = (width, height, fill = [80, 120, 160, 255]) => {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) output.set(fill, offset);
  return output;
};
const pixel = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const healing = (overrides = {}) => ({
  version: 1, points: [{ x: 10, y: 10 }], size: 15, hardness: 100, opacity: 1, ...overrides,
});
/** Red blemish in a blue field; the mask selects the left half (x < 10). */
const blemishFixture = () => {
  const width = 21, height = 21, source = rgba(width, height);
  for (let y = 6; y <= 14; y += 1)
    for (let x = 6; x <= 14; x += 1) source.set([240, 20, 20, 255], (y * width + x) * 4);
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < 10; x += 1) mask[y * width + x] = 255;
  return { width, height, source, mask };
};

test('spot healing with a selection snapshot only changes selected pixels', () => {
  const { width, height, source, mask } = blemishFixture();
  const masked = applySpotHealingStrokes(source, width, height, [healing({ selectionMask: 'sel-1' })], { 'sel-1': mask });
  const unmasked = applySpotHealingStrokes(source, width, height, [healing()]);
  // Inside the selection the blemish is healed exactly as without a mask.
  assert.deepEqual(pixel(masked, width, 8, 10), pixel(unmasked, width, 8, 10));
  assert.notDeepEqual(pixel(masked, width, 8, 10), [240, 20, 20, 255]);
  // Outside it every pixel keeps its source bytes.
  for (let y = 0; y < height; y += 1)
    for (let x = 10; x < width; x += 1)
      assert.deepEqual(pixel(masked, width, x, y), pixel(source, width, x, y));
});

test('spot healing selection coverage blends feathered edges proportionally', () => {
  const { width, height, source } = blemishFixture();
  const half = new Uint8ClampedArray(width * height).fill(128);
  const full = applySpotHealingStrokes(source, width, height, [healing()]);
  const blended = applySpotHealingStrokes(source, width, height, [healing({ selectionMask: 'half' })], { half });
  const [r0] = pixel(source, width, 10, 10), [r1] = pixel(full, width, 10, 10), [rh] = pixel(blended, width, 10, 10);
  assert.ok(Math.abs(rh - (r0 + (r1 - r0) * (128 / 255))) <= 1, `${rh} between ${r0} and ${r1}`);
  // Alpha is never touched.
  assert.equal(pixel(blended, width, 10, 10)[3], 255);
});

test('legacy spot healing strokes without a mask replay byte-for-byte', () => {
  const { width, height, source, mask } = blemishFixture();
  const legacy = applySpotHealingStrokes(source, width, height, [healing()]);
  const withUnusedMasks = applySpotHealingStrokes(source, width, height, [healing()], { other: mask });
  assert.deepEqual(withUnusedMasks, legacy);
  const destination = source.slice();
  applySpotHealingStroke(destination, source, width, height, healing());
  assert.deepEqual(destination, legacy);
});

test('spot healing selection snapshots validate and fail closed', () => {
  const { width, height, source, mask } = blemishFixture();
  assert.equal(validSpotHealingStroke(healing({ selectionMask: 'abc-123' }), width, height), true);
  assert.equal(validSpotHealingStroke(healing({ selectionMask: 'bad value' }), width, height), false);
  assert.equal(validSpotHealingStroke(healing({ selectionMask: 7 }), width, height), false);
  assert.equal(validSpotHealingStroke(healing({ selectionMask: 'x'.repeat(161) }), width, height), false);
  assert.throws(() => applySpotHealingStrokes(source, width, height, [healing({ selectionMask: 'missing' })], {}), /unavailable/);
  assert.throws(
    () => applySpotHealingStrokes(source, width, height, [healing({ selectionMask: 'small' })], { small: mask.slice(1) }),
    /unavailable/,
  );
  assert.throws(() => applySpotHealingStroke(source.slice(), source, width, height, healing(), mask.slice(1)), /wrong size/);
});

test('patch selection snapshots blend feathered coverage and skip unselected pixels', () => {
  const width = 9, height = 9, source = rgba(width, height, [20, 40, 60, 255]);
  source.set([255, 0, 0, 255], (4 * width + 1) * 4);
  const stroke = {
    version: 1, points: [{ x: 4, y: 4 }], size: 1, hardness: 100, opacity: 1,
    sourceOffset: { x: -3, y: 0 }, selectionMask: 'm',
  };
  const full = new Uint8ClampedArray(width * height).fill(255);
  const half = new Uint8ClampedArray(width * height).fill(128);
  const none = new Uint8ClampedArray(width * height);
  assert.deepEqual(pixel(applyPatchStrokes(source, width, height, [stroke], { m: full }), width, 4, 4), [255, 0, 0, 255]);
  assert.deepEqual(pixel(applyPatchStrokes(source, width, height, [stroke], { m: none }), width, 4, 4), [20, 40, 60, 255]);
  const [r, g, b, a] = pixel(applyPatchStrokes(source, width, height, [stroke], { m: half }), width, 4, 4);
  const w = 128 / 255;
  assert.ok(Math.abs(r - (20 + 235 * w)) <= 1, `red ${r}`);
  assert.ok(Math.abs(g - 40 * (1 - w)) <= 1, `green ${g}`);
  assert.ok(Math.abs(b - 60 * (1 - w)) <= 1, `blue ${b}`);
  assert.equal(a, 255);
});

const assetId = '11111111-1111-4111-8111-111111111111';
const maskId = '33333333-3333-4333-8333-333333333333';
const layerId = '22222222-2222-4222-8222-222222222222';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const asset = { url: `data:image/png;base64,${png}`, w: 1, h: 1 };
const draft = (layerPatch, assets) => ({
  version: 2,
  name: 'Snapshot fixture',
  index: 0,
  settings: { tool: 'spot-heal', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
  assets,
  history: [{
    w: 1, h: 1, active: layerId,
    layers: [{
      id: layerId, name: 'Retouch', visible: true, locked: false,
      opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0],
      adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      ...layerPatch,
    }],
  }],
});

test('selection snapshots survive drafts after the selection is gone and are validated by size', () => {
  const spotHealing = [healing({ points: [{ x: 0, y: 0 }], size: 3, selectionMask: maskId })];
  const patchStrokes = [{
    version: 1, points: [{ x: 0, y: 0 }], size: 3, hardness: 100, opacity: 1,
    sourceOffset: { x: 0, y: 0 }, selectionMask: maskId,
  }];
  const document = draft({ spotHealing, patchStrokes }, { [assetId]: asset, [maskId]: { ...asset } });
  // No frame selection references the mask: only the strokes do.
  assert.deepEqual(Object.keys(referencedAssets(document.history, document.assets)).sort(), [assetId, maskId].sort());
  const reopened = validateDraft(JSON.parse(JSON.stringify(prepareDraftForStorage(document))));
  assert.equal(reopened.history[0].layers[0].spotHealing[0].selectionMask, maskId);
  assert.equal(reopened.history[0].layers[0].patchStrokes[0].selectionMask, maskId);
  assert.ok(reopened.assets[maskId]);
  // A missing or wrongly sized snapshot fails closed.
  assert.throws(() => validateDraft(draft({ spotHealing }, { [assetId]: asset })), /Invalid layer document/);
  assert.throws(
    () => validateDraft(draft({ spotHealing }, { [assetId]: asset, [maskId]: { ...asset, w: 2 } })),
    /Invalid/,
  );
});

/** A syntactically valid PNG data URL whose IHDR declares w x h (+ salt bytes). */
function pngUrl(w, h, salt = 0) {
  const bytes = new Uint8Array(36);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, w);
  new DataView(bytes.buffer).setUint32(20, h);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([salt & 255, (salt >> 8) & 255, 7], 33);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('the layer filter cache key fingerprints spot healing selection snapshots', () => {
  const assets = { src: { url: pngUrl(4, 4), w: 4, h: 4 }, m1: { url: pngUrl(4, 4, 1), w: 4, h: 4 } };
  const layer = (spotHealing) => ({
    kind: 'raster', asset: 'src', spotHealing,
    adjustments: {
      filterEffects: {
        type: 'clouds', amount: 100, radius: 16, angle: 0, centerX: 0.5, centerY: 0.5, seed: 9,
        cloudRender: { foreground: '#e08a30', background: '#080c28', scale: 8, fill: true },
      },
    },
  });
  const stroke = healing({ points: [{ x: 1, y: 1 }], size: 2, selectionMask: 'm1' });
  const before = layerFilterCacheKey(layer([stroke]), assets);
  assert.ok(before);
  // Repainting the snapshot asset (same id) must miss the cache.
  const changed = layerFilterCacheKey(layer([stroke]), { ...assets, m1: { ...assets.m1, url: pngUrl(4, 4, 2) } });
  assert.notEqual(changed, before);
  assert.notEqual(layerFilterCacheKey(layer([healing({ points: [{ x: 1, y: 1 }], size: 2 })]), assets), before);
});
