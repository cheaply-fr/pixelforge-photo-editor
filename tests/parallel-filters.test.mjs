import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';
import {
  applyFilterEffectsInBands,
  filterBandHalo,
  planFilterBands,
  renderFilterBand,
  validFilterBandProgress,
} from '../src/filterBands.ts';
import {
  applyFilterEffectsParallel,
  filterWorkerCount,
  FilterWorkerPool,
  pooledTileRenderer,
  renderFilterWorkerRequest,
} from '../src/filterWorkerPool.ts';
import { renderTiledNeighborhoodEffect } from '../src/tiledDocument.ts';
import { readTile } from '../src/tilePlan.ts';

/** Noisy RGBA with hard edges, transparent holes and partial alpha. */
function fixture(width, height, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state >>> 24;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const edge = (x * 3 + y * 2) % 23 < 11;
      for (let channel = 0; channel < 3; channel += 1)
        data[index + channel] = Math.max(0, Math.min(255, (edge ? 200 : 50) + channel * 9 + (next() & 31) - 16));
      const alpha = next();
      data[index + 3] = alpha < 40 ? 0 : alpha < 90 ? alpha : 255;
    }
  return data;
}

const EFFECTS = [
  { type: 'smart-blur', amount: 85, radius: 8 },
  { type: 'smart-blur', amount: 100, radius: 3 },
  { type: 'smart-sharpen', amount: 100, radius: 8 },
  { type: 'surface-blur', amount: 90, radius: 8 },
  { type: 'reduce-noise', amount: 75, radius: 8, threshold: 25 },
  { type: 'reduce-noise', amount: 100, radius: 2, threshold: 200 },
  { type: 'shape-blur', amount: 100, radius: 12 },
  { type: 'lens-blur', amount: 80, radius: 21 },
  { type: 'path-blur', amount: 90, radius: 9, angle: 33, centerX: 0.4, centerY: 0.7 },
  { type: 'path-blur', amount: 100, radius: 30, angle: 80, centerX: 0.5, centerY: 0.5 },
  { type: 'path-blur', amount: 100, radius: 64, angle: -45, centerX: 0, centerY: 1 },
];

test('row bands with halos are byte-identical to the full-frame kernels', () => {
  for (const [width, height] of [[1, 1], [7, 3], [3, 40], [45, 61], [64, 150]])
    for (const effect of EFFECTS) {
      const source = fixture(width, height, width * 31 + height + effect.radius);
      const expected = applyFilterEffectsPixels(source, width, height, effect);
      for (const bands of [1, 2, 3, 7, height])
        assert.deepEqual(
          applyFilterEffectsInBands(source, width, height, effect, bands),
          expected,
          `${effect.type} r${effect.radius} ${width}x${height} in ${bands} bands`,
        );
    }
});

test('only band-safe effects get a halo; legacy Path Blur reaches 1.85 × radius', () => {
  assert.equal(filterBandHalo({ type: 'smart-blur', amount: 100, radius: 30 }), 8);
  assert.equal(filterBandHalo({ type: 'reduce-noise', amount: 100, radius: 2 }), 2);
  assert.equal(filterBandHalo({ type: 'shape-blur', amount: 100, radius: 40 }), 12);
  assert.equal(filterBandHalo({ type: 'lens-blur', amount: 100, radius: 64 }), 64);
  assert.equal(filterBandHalo({ type: 'path-blur', amount: 100, radius: 64 }), Math.ceil(64 * 1.85) + 2);
  // Authored paths, global effects and neutral settings stay serial.
  assert.equal(filterBandHalo({ type: 'path-blur', amount: 100, radius: 10, path: [{ x: 0, y: 0, speed: 50 }, { x: 1, y: 1, speed: 50 }] }), undefined);
  assert.equal(filterBandHalo({ type: 'median', amount: 100, radius: 4 }), undefined);
  assert.equal(filterBandHalo({ type: 'average-blur', amount: 100, radius: 4 }), undefined);
  assert.equal(filterBandHalo({ type: 'smart-blur', amount: 0, radius: 4 }), undefined);
});

test('band plans cover every row once and clip halos at the image edges', () => {
  for (const [height, halo, count] of [[1, 8, 4], [100, 8, 6], [4096, 120, 24], [33, 0, 40]]) {
    const bands = planFilterBands(height, halo, count, 1);
    let row = 0;
    for (const band of bands) {
      assert.equal(band.start, row);
      assert.ok(band.end > band.start);
      assert.equal(band.readStart, Math.max(0, band.start - halo));
      assert.equal(band.readEnd, Math.min(height, band.end + halo));
      row = band.end;
    }
    assert.equal(row, height);
  }
  // A minimum band height keeps halo overhead small on short images.
  assert.equal(planFilterBands(100, 8, 24).length, 4);
});

test('a band without its halo rows is rejected instead of rendering seams', () => {
  const width = 10, height = 40;
  const pixels = fixture(width, height, 3);
  assert.throws(() => renderFilterBand({
    effect: { type: 'smart-blur', amount: 100, radius: 8 }, width, height,
    readStart: 10, readRows: 12, start: 12, end: 20, pixels: pixels.slice(10 * width * 4, 22 * width * 4),
  }), /halo/);
});

/** In-process stand-in for a browser Worker running filter-band.worker.ts. */
function fakeWorkerFactory(log = { created: 0, terminated: 0 }, { fail = false } = {}) {
  return () => {
    log.created += 1;
    const worker = {
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(message, transfer) {
        assert.ok(transfer.length === 1 && transfer[0] === message.pixels, 'pixels are transferred');
        setTimeout(() => {
          if (worker.terminated) return;
          if (fail) return worker.onerror?.(new Error('boom'));
          const output = renderFilterWorkerRequest(message);
          worker.onmessage?.({ data: { kind: 'done', id: message.id, pixels: output.buffer } });
        }, 0);
      },
      terminate() {
        if (!worker.terminated) log.terminated += 1;
        worker.terminated = true;
      },
    };
    return worker;
  };
}

test('the worker pool renders bands in parallel with identical bytes and monotonic progress', async () => {
  const width = 96, height = 180;
  const source = fixture(width, height, 9);
  const log = { created: 0, terminated: 0 };
  const pool = new FilterWorkerPool({ size: 4, createWorker: fakeWorkerFactory(log) });
  for (const effect of EFFECTS) {
    const progress = [];
    const result = await applyFilterEffectsParallel(source, width, height, effect, {
      pool, minPixels: 0, onProgress: (completed, total) => progress.push([completed, total]),
    });
    assert.deepEqual(result, applyFilterEffectsPixels(source, width, height, effect), effect.type);
    assert.ok(progress.length > 1, 'more than one band');
    progress.forEach(([completed, total], index) => {
      assert.equal(completed, index + 1);
      assert.equal(total, progress.length);
    });
  }
  assert.ok(log.created <= 4, 'never more workers than the pool size');
  pool.terminate();
  assert.equal(log.terminated, log.created);
});

test('cancellation stops dispatch, terminates busy workers and rejects with AbortError', async () => {
  const width = 64, height = 200;
  const source = fixture(width, height, 4);
  const log = { created: 0, terminated: 0 };
  const pool = new FilterWorkerPool({ size: 2, createWorker: fakeWorkerFactory(log) });
  let completedBands = 0;
  await assert.rejects(
    applyFilterEffectsParallel(source, width, height, { type: 'surface-blur', amount: 100, radius: 8 }, {
      pool, minPixels: 0, bandsPerWorker: 4,
      isCancelled: () => completedBands >= 2,
      onProgress: (completed) => { completedBands = completed; },
    }),
    (error) => error.name === 'AbortError',
  );
  assert.ok(completedBands < 8, 'remaining bands were not rendered');
  const controller = new AbortController();
  const pending = applyFilterEffectsParallel(source, width, height, { type: 'smart-blur', amount: 100, radius: 8 }, {
    pool, minPixels: 0, signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.ok(log.terminated >= 1, 'busy workers are terminated on cancel');
  pool.terminate();
});

test('a failing worker falls back to the serial kernel with the same bytes', async () => {
  const width = 50, height = 90;
  const source = fixture(width, height, 12);
  const pool = new FilterWorkerPool({ size: 3, createWorker: fakeWorkerFactory(undefined, { fail: true }) });
  const effect = { type: 'reduce-noise', amount: 100, radius: 5 };
  assert.deepEqual(
    await applyFilterEffectsParallel(source, width, height, effect, { pool, minPixels: 0 }),
    applyFilterEffectsPixels(source, width, height, effect),
  );
  assert.equal(pool.broken, true);
  // A constructor that throws (no Worker support) also falls back.
  const missing = new FilterWorkerPool({ size: 2, createWorker: () => { throw new Error('no workers'); } });
  assert.deepEqual(
    await applyFilterEffectsParallel(source, width, height, effect, { pool: missing, minPixels: 0 }),
    applyFilterEffectsPixels(source, width, height, effect),
  );
  pool.terminate();
});

test('small images and non-band effects stay on the serial path', async () => {
  const log = { created: 0, terminated: 0 };
  const pool = new FilterWorkerPool({ size: 4, createWorker: fakeWorkerFactory(log) });
  const source = fixture(40, 40, 1);
  await applyFilterEffectsParallel(source, 40, 40, { type: 'smart-blur', amount: 100, radius: 8 }, { pool });
  await applyFilterEffectsParallel(source, 40, 40, { type: 'median', amount: 100, radius: 4 }, { pool, minPixels: 0 });
  assert.equal(log.created, 0);
  pool.terminate();
});

test('worker count follows hardware concurrency and stays small on phones', () => {
  assert.equal(filterWorkerCount({ hardwareConcurrency: 16, userAgent: 'Windows' }), 8);
  assert.equal(filterWorkerCount({ hardwareConcurrency: 4, userAgent: 'Macintosh' }), 3);
  assert.equal(filterWorkerCount({ hardwareConcurrency: 1 }), 1);
  assert.equal(filterWorkerCount({ hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile' }), 2);
  assert.equal(filterWorkerCount({ hardwareConcurrency: 8, userAgentData: { mobile: true } }), 2);
  assert.equal(filterWorkerCount({ hardwareConcurrency: 12, deviceMemory: 4 }), 2);
  assert.equal(filterWorkerCount({}), 1);
});

test('tiled renders with pooled tiles in flight match the serial tiled result', async () => {
  const width = 600, height = 330;
  const source = fixture(width, height, 21);
  const pool = new FilterWorkerPool({ size: 4, createWorker: fakeWorkerFactory() });
  for (const effect of [{ type: 'smart-blur', amount: 100, radius: 8 }, { type: 'surface-blur', amount: 100, radius: 8 }]) {
    const destination = new Uint8ClampedArray(source.length);
    const progress = [];
    const result = await renderTiledNeighborhoodEffect(
      width,
      height,
      effect,
      (tile) => readTile(source, width, height, tile),
      (pixels, tile) => {
        for (let row = 0; row < tile.height; row += 1) {
          const from = ((tile.y - tile.readY + row) * tile.readWidth + (tile.x - tile.readX)) * 4;
          destination.set(pixels.subarray(from, from + tile.width * 4), ((tile.y + row) * width + tile.x) * 4);
        }
      },
      {
        revision: 'pool', tileSize: 256, maxWorkingBytes: 8 * 512 * 512 * 4,
        renderTile: pooledTileRenderer(pool), concurrency: 4,
        onProgress: (completed, total) => progress.push([completed, total]),
      },
    );
    assert.deepEqual(destination, applyFilterEffectsPixels(source, width, height, effect), effect.type);
    progress.forEach(([completed], index) => assert.equal(completed, index + 1));
    assert.equal(progress.length, result.schedule.tileCount);
    assert.ok(result.ledger.peakWorkingBytes <= 8 * 512 * 512 * 4);
  }
  pool.terminate();
});

test('band progress messages are bounded and carry no pixels', () => {
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'reduce-noise', layerId: 'layer-1', completed: 3, total: 24 }), true);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'path-blur', completed: 1, total: 1 }), true);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'median', completed: 1, total: 2 }), false);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'smart-blur', completed: 0, total: 2 }), false);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'smart-blur', completed: 3, total: 2 }), false);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'smart-blur', completed: 1, total: 2, pixels: [] }), false);
  assert.equal(validFilterBandProgress({ kind: 'filter-band-progress', effect: 'smart-blur', completed: 1, total: 2, layerId: '' }), false);
});
