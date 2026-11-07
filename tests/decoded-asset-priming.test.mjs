import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDecodedAssetCache,
  decodeAsset,
  decodedAssetCacheStats,
  primeDecodedAsset,
  primeDecodedAssetPixels,
} from '../src/document.ts';
import { assetFingerprint } from '../src/layerFilterCache.ts';

// Node has no canvas. A minimal OffscreenCanvas stand-in records draws so the
// tests can check that priming copies the caller's pixels into a private
// surface instead of retaining the caller's (mutable) canvas.
class FakeCanvas {
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
    this.draws = [];
  }
  getContext() {
    return { drawImage: (source, x, y) => this.draws.push({ source, x, y }) };
  }
}
globalThis.OffscreenCanvas = FakeCanvas;

let asset = 0;
/** A distinct, structurally plausible asset (priming never decodes the URL). */
const makeAsset = (w, h) => ({
  url: `data:image/png;base64,${Buffer.from(`asset-${++asset}-${w}x${h}`).toString('base64')}`,
  w,
  h,
});

beforeEach(() => clearDecodedAssetCache());

test('priming makes the next decode return a private copy of the committed pixels', async () => {
  const committed = makeAsset(40, 30);
  const buffer = new FakeCanvas(40, 30);
  assert.equal(primeDecodedAsset(committed, buffer), true);
  const image = await decodeAsset(committed);
  assert.notEqual(image, buffer, 'the cache never retains the caller canvas');
  assert.equal(image.naturalWidth, 40);
  assert.equal(image.naturalHeight, 30);
  assert.equal(image.draws.length, 1);
  assert.equal(image.draws[0].source, buffer);
  // A structured clone (same content, different object) hits the same entry.
  assert.equal(await decodeAsset({ ...committed }), image);
  assert.deepEqual(decodedAssetCacheStats().entries, 1);
  assert.equal(decodedAssetCacheStats().pixels, 1200);
});

test('priming rejects a source whose size does not match the asset', () => {
  const committed = makeAsset(40, 30);
  assert.equal(primeDecodedAsset(committed, new FakeCanvas(30, 40)), false);
  assert.equal(primeDecodedAsset(undefined, new FakeCanvas(30, 40)), false);
  assert.equal(decodedAssetCacheStats().entries, 0);
});

test('priming an already cached asset keeps the existing entry', async () => {
  const committed = makeAsset(8, 8);
  const first = new FakeCanvas(8, 8);
  primeDecodedAsset(committed, first);
  const cached = await decodeAsset(committed);
  assert.equal(primeDecodedAsset(committed, new FakeCanvas(8, 8)), true);
  assert.equal(await decodeAsset(committed), cached);
  assert.equal(decodedAssetCacheStats().entries, 1);
});

test('primed entries respect the decoded-pixel budget (oldest evicted first)', () => {
  const { maxPixels } = decodedAssetCacheStats();
  const side = Math.ceil(Math.sqrt(maxPixels / 2)) + 1;
  for (let i = 0; i < 3; i++) primeDecodedAsset(makeAsset(side, side), new FakeCanvas(side, side));
  const stats = decodedAssetCacheStats();
  assert.ok(stats.pixels <= stats.maxPixels, `${stats.pixels} <= ${stats.maxPixels}`);
  assert.equal(stats.entries, 1);
});

test('worker-side pixel priming validates the fingerprint and byte length', async () => {
  const committed = makeAsset(4, 2);
  const key = assetFingerprint(committed);
  const previousImageData = globalThis.ImageData;
  const previousBitmap = globalThis.createImageBitmap;
  globalThis.ImageData = class {
    constructor(data, width, height) {
      Object.assign(this, { data, width, height });
    }
  };
  globalThis.createImageBitmap = async (image) => ({ width: image.width, height: image.height, from: image });
  try {
    assert.equal(primeDecodedAssetPixels(committed, 'other-key', new Uint8ClampedArray(32)), false);
    assert.equal(primeDecodedAssetPixels(committed, key, new Uint8ClampedArray(31)), false);
    assert.equal(decodedAssetCacheStats().entries, 0);
    const pixels = new Uint8ClampedArray(32).fill(7);
    assert.equal(primeDecodedAssetPixels(committed, key, pixels), true);
    const bitmap = await decodeAsset({ ...committed });
    assert.equal(bitmap.width, 4);
    assert.equal(bitmap.from.data, pixels);
    // Already cached content is not replaced.
    assert.equal(primeDecodedAssetPixels(committed, key, new Uint8ClampedArray(32)), false);
  } finally {
    globalThis.ImageData = previousImageData;
    globalThis.createImageBitmap = previousBitmap;
  }
});
