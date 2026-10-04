import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILED_RENDER_PROTOCOL_VERSION,
  TILED_RENDER_TILE_SIZES,
  createTiledRenderPlan,
  normalizeTiledRenderTileSize,
  runTiledRender,
  validateTiledRenderRequest,
} from '../src/tiledRender.ts';

test('tiled render plans use deterministic 256/512 tiles and bounded overlap', () => {
  assert.deepEqual(TILED_RENDER_TILE_SIZES, [256, 512]);
  assert.equal(normalizeTiledRenderTileSize(), 512);
  assert.equal(normalizeTiledRenderTileSize(256), 256);
  assert.equal(normalizeTiledRenderTileSize(512), 512);
  assert.throws(() => normalizeTiledRenderTileSize(128), /256 or 512/);

  const first = createTiledRenderPlan(7, 700, 530, {
    tileSize: 256,
    overlap: 12,
  });
  const second = createTiledRenderPlan(7, 700, 530, {
    tileSize: 256,
    overlap: 12,
  });
  assert.deepEqual(first, second);
  assert.equal(first.request.version, TILED_RENDER_PROTOCOL_VERSION);
  assert.equal(first.plan.tiles.length, 9);
  assert.equal(first.schedule.tileCount, 9);
  assert.ok(first.plan.tiles.every((tile) => tile.readX <= tile.x && tile.readY <= tile.y));
  assert.ok(first.plan.tiles.every((tile) => tile.readX + tile.readWidth >= tile.x + tile.width));
  assert.ok(first.plan.tiles.every((tile) => tile.readY + tile.readHeight >= tile.y + tile.height));
  assert.ok(first.schedule.batches.every((batch) => batch.bytes <= first.schedule.maxBatchBytes));
});

test('tiled render request validation rebuilds a canonical plan from the envelope', () => {
  const request = createTiledRenderPlan(11, 1024, 768, {
    tileSize: 512,
    overlap: 24,
  }).request;
  assert.deepEqual(validateTiledRenderRequest(request), request);
  assert.throws(() => validateTiledRenderRequest({ ...request, version: 2 }), /Invalid tiled render request/);
  assert.throws(() => validateTiledRenderRequest({ ...request, id: 0 }), /Invalid tiled render request/);
  assert.throws(() => validateTiledRenderRequest({ ...request, tileSize: 128 }), /256 or 512/);
  assert.throws(() => validateTiledRenderRequest({ ...request, overlap: 257 }), /overlap/);
  assert.throws(() => validateTiledRenderRequest({ ...request, maxBatchBytes: 64 * 1024 * 1024 + 1 }), /no larger/);
  assert.throws(() => validateTiledRenderRequest({ ...request, width: 5000, height: 5000 }), /Invalid tiled render request/);
});

test('tiled render runner preserves row-major order and reports completed tiles', async () => {
  const progress = [];
  const seen = [];
  const result = await runTiledRender(13, 700, 530, async (tile, context) => {
    seen.push({ x: tile.x, y: tile.y, index: context.tileIndex, batch: context.batch.index });
    return tile.x + tile.y;
  }, {
    tileSize: 256,
    overlap: 4,
    maxBatchBytes: 256 * 256 * 4 * 2,
    onProgress: (event) => progress.push({ completed: event.completed, total: event.total, tile: event.tile }),
  });

  assert.equal(result.outputs.length, 9);
  assert.deepEqual(result.outputs, seen.map(({ x, y }) => x + y));
  assert.deepEqual(seen.map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(progress.map(({ completed }) => completed), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(progress.every(({ total }) => total === 9));
  assert.equal(progress.at(-1).tile.x, 512);
  assert.equal(progress.at(-1).tile.y, 512);
});

test('tiled render runner checks cancellation before scheduling the next tile', async () => {
  const controller = new AbortController();
  const progress = [];
  let calls = 0;
  await assert.rejects(
    runTiledRender(15, 700, 530, () => {
      calls += 1;
      controller.abort();
      return calls;
    }, {
      tileSize: 256,
      signal: controller.signal,
      onProgress: (event) => progress.push(event.completed),
    }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(calls, 1);
  assert.deepEqual(progress, [1]);
});

test('tiled render runner rejects missing callbacks before allocating work', async () => {
  await assert.rejects(
    runTiledRender(17, 256, 256, undefined),
    /tile renderer callback is required/,
  );
});
