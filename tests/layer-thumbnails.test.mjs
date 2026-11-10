import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYER_THUMBNAIL_BOX,
  LAYER_THUMBNAIL_SCALE,
  ThumbnailCache,
  layerHasThumbnail,
  layerThumbnailKey,
  layerThumbnailSize,
  thumbnailLayerScale,
  thumbnailTilePlan,
} from '../src/layerThumbnails.ts';

const png = (w, h, url = 'data:image/png;base64,AAAA') => ({ url, w, h });

test('thumbnails keep the document aspect ratio inside the box', () => {
  const box = LAYER_THUMBNAIL_BOX * LAYER_THUMBNAIL_SCALE;
  assert.deepEqual(layerThumbnailSize(2646, 4096), { w: Math.round((2646 * box) / 4096), h: box });
  assert.deepEqual(layerThumbnailSize(4000, 1000), { w: box, h: box / 4 });
  assert.deepEqual(layerThumbnailSize(10, 10, 28), { w: 28, h: 28 });
  assert.deepEqual(layerThumbnailSize(10000, 1, 28), { w: 28, h: 1 }, 'never below 1 px');
  assert.deepEqual(layerThumbnailSize(0, Number.NaN, 28), { w: 28, h: 28 }, 'invalid sizes fall back');
});

test('only raster layers with an asset get a thumbnail', () => {
  assert.equal(layerHasThumbnail({ kind: 'raster', asset: 'a' }), true);
  for (const kind of ['text', 'rectangle', 'adjustment', 'smart-object', 'path'])
    assert.equal(layerHasThumbnail({ kind, asset: 'a' }), false, kind);
  assert.equal(layerHasThumbnail({ kind: 'raster' }), false);
});

test('the key changes with the pixels, the transform and the fill, and nothing else', () => {
  const frame = { w: 100, h: 80 };
  const assets = { a: png(100, 80, 'data:image/png;base64,AAAA'), b: png(100, 80, 'data:image/png;base64,BBBB') };
  const base = { kind: 'raster', asset: 'a', matrix: [1, 0, 0, 1, 0, 0] };
  const key = layerThumbnailKey(base, frame, assets);
  assert.equal(typeof key, 'string');
  assert.equal(layerThumbnailKey({ ...base, name: 'Renamed', opacity: 0.2 }, frame, assets), key, 'name and opacity');
  assert.notEqual(layerThumbnailKey({ ...base, asset: 'b' }, frame, assets), key, 'new pixels');
  assert.notEqual(layerThumbnailKey({ ...base, matrix: [1, 0, 0, 1, 5, 0] }, frame, assets), key, 'moved');
  assert.notEqual(layerThumbnailKey(base, { w: 200, h: 80 }, assets), key, 'canvas resized');
  assert.notEqual(layerThumbnailKey({ ...base, fillColor: '#ff0000' }, frame, assets), key, 'fill layer');
  assert.notEqual(
    layerThumbnailKey({ ...base, fillColor: '#00ff00' }, frame, assets),
    layerThumbnailKey({ ...base, fillColor: '#ff0000' }, frame, assets),
  );
  assert.equal(layerThumbnailKey({ ...base, asset: 'missing' }, frame, assets), undefined);
  assert.equal(layerThumbnailKey({ kind: 'text' }, frame, assets), undefined);
});

test('a tiled layer decodes only its non-empty tiles, each at the reduced size', () => {
  const blob = {};
  const asset = { w: 600, h: 300, tileSize: 256, tiles: [blob, null, blob, null, { blob }, { blob }] };
  const plan = thumbnailTilePlan(asset, 0.1);
  assert.deepEqual(plan.map((tile) => tile.index), [0, 2, 4, 5]);
  assert.deepEqual(plan[0], { index: 0, x: 0, y: 0, w: 256, h: 256, decodeW: 26, decodeH: 26 });
  // The last column and row are partial tiles.
  assert.deepEqual(plan[1], { index: 2, x: 512, y: 0, w: 88, h: 256, decodeW: 9, decodeH: 26 });
  assert.deepEqual(plan[3], { index: 5, x: 512, y: 256, w: 88, h: 44, decodeW: 9, decodeH: 5 });
  // Never larger than the tile, never zero.
  const full = thumbnailTilePlan(asset, 3);
  assert.equal(full[0].decodeW, 256);
  assert.equal(thumbnailTilePlan(asset, 0.0001)[0].decodeW, 1);
});

test('the decode scale follows the layer transform', () => {
  assert.equal(thumbnailLayerScale([1, 0, 0, 1, 0, 0], 0.02), 0.02);
  assert.equal(thumbnailLayerScale([2, 0, 0, 2, 0, 0], 0.02), 0.04);
  assert.equal(thumbnailLayerScale(undefined, 0.5), 0.5);
  assert.equal(thumbnailLayerScale([10, 0, 0, 10, 0, 0], 0.5), 1, 'capped at full size');
});

test('the thumbnail cache is a bounded LRU', () => {
  const cache = new ThumbnailCache(2);
  cache.set('a', 'A');
  cache.set('b', 'B');
  assert.equal(cache.get('a'), 'A');
  cache.set('c', 'C');
  assert.equal(cache.get('b'), undefined, 'least recently used evicted');
  assert.equal(cache.get('a'), 'A');
  assert.equal(cache.get('c'), 'C');
  assert.equal(cache.size, 2);
});
