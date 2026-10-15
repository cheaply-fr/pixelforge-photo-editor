import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';
import {
  isTiledNeighborhoodBlur,
  tiledNeighborhoodRadius,
  renderTiledNeighborhoodEffect,
  TiledMemoryBudgetError,
} from '../src/tiledDocument.ts';
import { TileCache, readTile } from '../src/tilePlan.ts';

function pixels(width, height) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      output[offset] = (x * 21 + y * 5) % 256;
      output[offset + 1] = (x * 9 + y * 17) % 256;
      output[offset + 2] = (x * 3 + y * 29) % 256;
      output[offset + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  return output;
}

function writeInner(destination, width, pixels, tile) {
  for (let row = 0; row < tile.height; row += 1) {
    const sourceOffset =
      ((tile.y - tile.readY + row) * tile.readWidth + (tile.x - tile.readX)) * 4;
    const destinationOffset = ((tile.y + row) * width + tile.x) * 4;
    destination.set(
      pixels.subarray(sourceOffset, sourceOffset + tile.width * 4),
      destinationOffset,
    );
  }
}

for (const type of [
  'blur-more',
  'box-blur',
  'gaussian-blur',
  'lens-blur',
  'lens-correction',
  'motion-blur',
  'shape-blur',
  'smart-blur',
  'surface-blur',
  'fragment',
  'adaptive-wide-angle',
]) {
  test(`tiled ${type} matches the full-frame pixel oracle at seams`, async () => {
    const width = 520;
    const height = 300;
    const sourcePixels = pixels(width, height);
    const destination = new Uint8ClampedArray(sourcePixels.length);
    const effect = {
      type, amount: 100, radius: 8, angle: 27, seed: 17,
      centerX: 0.33, centerY: 0.68,
      ...(type === 'adaptive-wide-angle'
        ? { adaptiveWideAngle: { horizontal: 80, vertical: 20 } }
        : {}),
    };
    const expected = applyFilterEffectsPixels(sourcePixels, width, height, effect);
    const result = await renderTiledNeighborhoodEffect(
      width,
      height,
      effect,
      (tile) => readTile(sourcePixels, width, height, tile),
      (output, tile) => writeInner(destination, width, output, tile),
      { revision: 'fixture-1', tileSize: 256, maxWorkingBytes: 2 * 512 * 512 * 4 },
    );
    assert.deepEqual(destination, expected);
    assert.equal(result.ledger.peakWorkingBytes <= 2 * 512 * 512 * 4, true);
    assert.equal(result.ledger.destinationBytes, width * height * 4);
  });
}

test('only bounded local blur families enter the visible tiled path', () => {
  assert.equal(isTiledNeighborhoodBlur({ type: 'blur-more', amount: 100, radius: 32 }), true);
  assert.equal(isTiledNeighborhoodBlur({ type: 'blur', amount: 100, radius: 64 }), true);
  assert.equal(tiledNeighborhoodRadius({ type: 'blur', amount: 100, radius: 64 }), 1);
  assert.equal(isTiledNeighborhoodBlur({ type: 'box-blur', amount: 100, radius: 64 }), true);
  assert.equal(isTiledNeighborhoodBlur({ type: 'gaussian-blur', amount: 100, radius: 64 }), true);
  assert.equal(isTiledNeighborhoodBlur({ type: 'gaussian-blur', amount: 100, radius: 65 }), false);
  assert.equal(isTiledNeighborhoodBlur({ type: 'lens-correction', amount: 100, radius: 4 }), true);
  assert.equal(isTiledNeighborhoodBlur({ type: 'average-blur', amount: 100, radius: 4 }), false);
  assert.equal(isTiledNeighborhoodBlur({ type: 'mosaic', amount: 100, radius: 4 }), false);
  for (const type of ['lens-blur', 'motion-blur', 'shape-blur', 'smart-blur', 'surface-blur', 'fragment'])
    assert.equal(isTiledNeighborhoodBlur({ type, amount: 100, radius: 4 }), true);
  assert.equal(isTiledNeighborhoodBlur({ type: 'adaptive-wide-angle', amount: 100, radius: 4 }), true);
});

test('tiled cache keys include revision/effect and cached output is cloned', async () => {
  const sourcePixels = pixels(520, 300);
  const cache = new TileCache(4 * 512 * 512 * 4);
  let sourceCalls = 0;
  const source = async (tile) => {
    sourceCalls += 1;
    return readTile(sourcePixels, 520, 300, tile);
  };
  const sink = () => {};
  const effect = { type: 'box-blur', amount: 100, radius: 2 };
  await renderTiledNeighborhoodEffect(520, 300, effect, source, sink, {
    revision: 'a', cache, tileSize: 256,
  });
  const firstCalls = sourceCalls;
  await renderTiledNeighborhoodEffect(520, 300, effect, source, sink, {
    revision: 'a', cache, tileSize: 256,
  });
  assert.equal(sourceCalls, firstCalls);
  await renderTiledNeighborhoodEffect(520, 300, { ...effect, radius: 3 }, source, sink, {
    revision: 'a', cache, tileSize: 256,
  });
  assert.ok(sourceCalls > firstCalls);
  await renderTiledNeighborhoodEffect(520, 300, effect, source, sink, {
    revision: 'b', cache, tileSize: 256,
  });
  assert.ok(sourceCalls > firstCalls + 6);
});

test('abort after a source callback prevents sink/progress and preserves cache', async () => {
  const controller = new AbortController();
  const cache = new TileCache(4 * 512 * 512 * 4);
  let sinks = 0;
  await assert.rejects(
    renderTiledNeighborhoodEffect(
      520,
      300,
      { type: 'gaussian-blur', amount: 100, radius: 2 },
      async (tile) => {
        const value = readTile(pixels(520, 300), 520, 300, tile);
        controller.abort();
        return value;
      },
      () => { sinks += 1; },
      { revision: 1, cache, signal: controller.signal },
    ),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(sinks, 0);
  assert.equal(cache.size, 0);
});

test('16MP synthetic run stays within the bounded destination plus tile ledger', async () => {
  const width = 4000;
  const height = 4000;
  const result = await renderTiledNeighborhoodEffect(
    width,
    height,
    { type: 'box-blur', amount: 1, radius: 1 },
    (tile) => new Uint8ClampedArray(tile.readWidth * tile.readHeight * 4),
    () => {},
    { revision: '16mp', tileSize: 512, maxWorkingBytes: 4 * 1024 * 1024 },
  );
  assert.ok(result.ledger.peakWorkingBytes <= 4 * 1024 * 1024);
  assert.ok(result.ledger.peakBytes <= width * height * 4 + 4 * 1024 * 1024);
});

test('working-byte exhaustion is explicit and never commits a destination tile', async () => {
  let sinks = 0;
  await assert.rejects(
    renderTiledNeighborhoodEffect(
      520,
      300,
      { type: 'motion-blur', amount: 100, radius: 8, angle: 20 },
      (tile) => readTile(pixels(520, 300), 520, 300, tile),
      () => { sinks += 1; },
      { revision: 'low-memory', tileSize: 256, maxWorkingBytes: 1024 },
    ),
    (error) => error instanceof TiledMemoryBudgetError && error.code === 'PIXELFORGE_MEMORY_BUDGET',
  );
  assert.equal(sinks, 0);
});

test('tiled blur emits privacy-safe telemetry with bounded cache accounting', async () => {
  const events = [];
  const cache = new TileCache(2 * 512 * 512 * 4);
  const width = 520;
  const height = 300;
  const sourcePixels = pixels(width, height);
  await renderTiledNeighborhoodEffect(
    width,
    height,
    { type: 'gaussian-blur', amount: 100, radius: 4 },
    (tile) => readTile(sourcePixels, width, height, tile),
    () => {},
    {
      revision: 'telemetry-fixture',
      cache,
      tileSize: 256,
      onTelemetry: (event) => events.push(event),
    },
  );
  assert.equal(events.length, 1);
  assert.deepEqual(
    {
      kind: events[0].kind,
      effect: events[0].effect,
      width: events[0].width,
      height: events[0].height,
      tileSize: events[0].tileSize,
      tileCount: events[0].tileCount,
    },
    {
      kind: 'tiled-neighborhood',
      effect: 'gaussian-blur',
      width,
      height,
      tileSize: 256,
      tileCount: 6,
    },
  );
  assert.ok(events[0].peakWorkingBytes <= events[0].maxWorkingBytes);
  assert.ok(events[0].cacheBytes <= events[0].maxCacheBytes);
  assert.equal(events[0].cacheStats.maxBytes, cache.maxBytes);
});

test('tiled blur emits monotonic tile progress with a canonical plan', async () => {
  const progress = [];
  const sourcePixels = pixels(520, 300);
  await renderTiledNeighborhoodEffect(
    520,
    300,
    { type: 'gaussian-blur', amount: 100, radius: 4 },
    (tile) => readTile(sourcePixels, 520, 300, tile),
    () => {},
    {
      revision: 'progress-fixture',
      tileSize: 256,
      onProgress: (completed, total, meta) =>
        progress.push({ completed, total, ...meta }),
    },
  );
  assert.deepEqual(progress, [
    { completed: 1, total: 6, tileSize: 256, tileCount: 6 },
    { completed: 2, total: 6, tileSize: 256, tileCount: 6 },
    { completed: 3, total: 6, tileSize: 256, tileCount: 6 },
    { completed: 4, total: 6, tileSize: 256, tileCount: 6 },
    { completed: 5, total: 6, tileSize: 256, tileCount: 6 },
    { completed: 6, total: 6, tileSize: 256, tileCount: 6 },
  ]);
});
