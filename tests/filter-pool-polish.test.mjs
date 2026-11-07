import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';
import {
  applyFilterEffectsParallel,
  FILTER_CANCEL_POLL_MS,
  FilterWorkerPool,
  pooledTileRenderer,
  prewarmFilterPool,
  renderFilterWorkerRequest,
  watchCancellation,
} from '../src/filterWorkerPool.ts';
import { renderTiledNeighborhoodEffect } from '../src/tiledDocument.ts';
import { readTile } from '../src/tilePlan.ts';
import { prewarmFilterWorkers } from '../src/workerRender.ts';

function fixture(width, height, seed) {
  let state = seed >>> 0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    data[index] = (index & 3) === 3 ? ((state >>> 24) < 30 ? 0 : 255) : state >>> 24;
  }
  return data;
}

/** In-process stand-in for filter-band.worker.ts with an artificial delay. */
function slowWorkers(log, delayMs) {
  return () => {
    log.created += 1;
    const worker = {
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(message) {
        log.messages.push(message);
        setTimeout(() => {
          if (worker.terminated) return;
          const output = renderFilterWorkerRequest(message);
          worker.onmessage?.({ data: { kind: 'done', id: message.id, pixels: output.buffer } });
        }, delayMs);
      },
      terminate() {
        if (!worker.terminated) log.terminated += 1;
        worker.terminated = true;
      },
    };
    return worker;
  };
}

const newLog = () => ({ created: 0, terminated: 0, messages: [] });

test('watchCancellation fires once for an abort signal or a polled predicate', async () => {
  let fired = 0;
  const controller = new AbortController();
  const stop = watchCancellation(controller.signal, undefined, () => { fired += 1; });
  controller.abort();
  controller.abort();
  stop();
  assert.equal(fired, 1);
  let cancelled = false;
  let polled = 0;
  watchCancellation(undefined, () => cancelled, () => { polled += 1; });
  setTimeout(() => { cancelled = true; }, 10);
  await new Promise((resolve) => setTimeout(resolve, FILTER_CANCEL_POLL_MS * 4));
  assert.equal(polled, 1);
  // A stopped watcher never fires.
  let late = 0;
  const stopLate = watchCancellation(undefined, () => true, () => { late += 1; });
  stopLate();
  await new Promise((resolve) => setTimeout(resolve, FILTER_CANCEL_POLL_MS * 2));
  assert.equal(late, 0);
});

test('a cancelled tile interrupts its running worker and the pool refills lazily', async () => {
  const log = newLog();
  const pool = new FilterWorkerPool({ size: 2, createWorker: slowWorkers(log, 1_000) });
  const source = fixture(60, 50, 3);
  const effect = { type: 'smart-blur', amount: 100, radius: 8 };
  let cancelled = false;
  const render = pooledTileRenderer(pool, { isCancelled: () => cancelled });
  const started = Date.now();
  const pending = render(source, 60, 50, effect);
  setTimeout(() => { cancelled = true; }, 30);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.ok(Date.now() - started < 600, 'rejected before the 1 s tile finished');
  assert.equal(log.terminated, 1, 'the busy worker was terminated');
  assert.equal(pool.workerCount, 0);
  // The next tile gets a fresh worker and the same bytes as the serial kernel.
  const fresh = pooledTileRenderer(pool);
  const fast = new FilterWorkerPool({ size: 1, createWorker: slowWorkers(newLog(), 0) });
  assert.deepEqual(await pooledTileRenderer(fast)(source, 60, 50, effect), applyFilterEffectsPixels(source, 60, 50, effect));
  const refill = fresh(source, 60, 50, effect);
  assert.equal(log.created, 2, 'a replacement worker was created on demand');
  assert.deepEqual(await refill, applyFilterEffectsPixels(source, 60, 50, effect));
  // An already-cancelled render never dispatches.
  await assert.rejects(pooledTileRenderer(pool, { isCancelled: () => true })(source, 60, 50, effect), (error) => error.name === 'AbortError');
  pool.terminate();
  fast.terminate();
});

test('tiled renders stop promptly when cancelled while tiles run in workers', async () => {
  const log = newLog();
  const pool = new FilterWorkerPool({ size: 3, createWorker: slowWorkers(log, 400) });
  const width = 600, height = 300;
  const source = fixture(width, height, 9);
  let cancelled = false;
  const sinks = [];
  const started = Date.now();
  const pending = renderTiledNeighborhoodEffect(
    width,
    height,
    { type: 'surface-blur', amount: 100, radius: 8 },
    (tile) => readTile(source, width, height, tile),
    (pixels, tile) => { sinks.push(tile); },
    {
      revision: 'cancel', tileSize: 256, maxWorkingBytes: 8 * 512 * 512 * 4,
      isCancelled: () => cancelled, concurrency: 3,
      renderTile: pooledTileRenderer(pool, { isCancelled: () => cancelled }),
    },
  );
  setTimeout(() => { cancelled = true; }, 50);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.ok(Date.now() - started < 350, 'did not wait for the 400 ms tiles');
  assert.equal(sinks.length, 0, 'no cancelled tile reached the destination');
  assert.equal(log.terminated, 3, 'every busy worker was terminated');
  pool.terminate();
});

test('a polled cancellation interrupts running bands, not only between bands', async () => {
  const log = newLog();
  const pool = new FilterWorkerPool({ size: 2, createWorker: slowWorkers(log, 800) });
  let cancelled = false;
  const started = Date.now();
  const pending = applyFilterEffectsParallel(fixture(80, 120, 5), 80, 120, { type: 'reduce-noise', amount: 100, radius: 8 }, {
    pool, minPixels: 0, isCancelled: () => cancelled,
  });
  setTimeout(() => { cancelled = true; }, 30);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.ok(Date.now() - started < 500);
  assert.equal(log.terminated, 2);
  pool.terminate();
});

test('pre-warming starts every worker once per heavy kernel and re-warms after a worker is lost', async () => {
  const log = newLog();
  const pool = new FilterWorkerPool({ size: 3, createWorker: slowWorkers(log, 0) });
  assert.equal(prewarmFilterPool(['reduce-noise', 'median', 'not-a-filter'], pool), 3);
  assert.equal(log.created, 3, 'one job per worker starts every worker');
  assert.equal(prewarmFilterPool(['reduce-noise'], pool), 0, 'already warm');
  assert.equal(prewarmFilterPool(['smart-blur', 'path-blur'], pool), 6);
  for (const message of log.messages) {
    assert.equal(message.kind, 'band');
    assert.ok(message.width * message.readRows <= 96 * 40, 'warm-up bands are tiny');
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  // Cancelling a running job terminates its worker, so its replacement is cold.
  const slow = new FilterWorkerPool({ size: 1, createWorker: slowWorkers(newLog(), 150) });
  assert.equal(prewarmFilterPool(['surface-blur'], slow), 1);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const job = slow.run({ kind: 'pixels', effect: { type: 'surface-blur', amount: 100, radius: 1 }, width: 1, height: 1, pixels: new ArrayBuffer(4) }, []);
  job.cancel();
  await job.promise.catch(() => undefined);
  assert.equal(prewarmFilterPool(['surface-blur'], slow), 1, 'warmed again after a cold replacement');
  assert.equal(prewarmFilterPool(['surface-blur'], undefined), 0, 'no pool, no work');
  pool.terminate();
  slow.terminate();
});

test('prewarmFilterWorkers ignores light filters and small documents', () => {
  // No Worker in Node: these must be safe no-ops, never throw.
  prewarmFilterWorkers(['gaussian-blur', 'median'], { w: 4000, h: 4000 });
  prewarmFilterWorkers(['reduce-noise'], { w: 300, h: 300 });
  prewarmFilterWorkers(['reduce-noise'], { w: 1200, h: 1200 });
});

test('row ranges render only the requested rows of each band-safe kernel', () => {
  const width = 31, height = 47;
  const source = fixture(width, height, 13);
  for (const effect of [
    { type: 'smart-blur', amount: 90, radius: 8 },
    { type: 'smart-sharpen', amount: 100, radius: 6 },
    { type: 'surface-blur', amount: 100, radius: 8 },
    { type: 'reduce-noise', amount: 80, radius: 8 },
    { type: 'shape-blur', amount: 100, radius: 12 },
    { type: 'lens-blur', amount: 100, radius: 20 },
  ]) {
    const full = applyFilterEffectsPixels(source, width, height, effect);
    const partial = applyFilterEffectsPixels(source, width, height, effect, undefined, { start: 9, end: 30 });
    const row = width * 4;
    assert.deepEqual(partial.subarray(9 * row, 30 * row), full.subarray(9 * row, 30 * row), `${effect.type} rows`);
    assert.deepEqual(partial.subarray(0, 9 * row), source.subarray(0, 9 * row), `${effect.type} rows above`);
    assert.deepEqual(partial.subarray(30 * row), source.subarray(30 * row), `${effect.type} rows below`);
  }
});
