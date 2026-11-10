import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canRenderInWorker,
  renderFrameWithWorker,
  renderWatchdogBudget,
  RenderTimeoutError,
  resetPersistentWorkerForTests,
} from '../src/workerRender.ts';
import { neutral } from '../src/document.ts';

const savedGlobals = new Map();
function setGlobal(name, value) {
  if (!savedGlobals.has(name)) savedGlobals.set(name, globalThis[name]);
  globalThis[name] = value;
}
function restoreGlobals() {
  for (const [name, value] of savedGlobals) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  savedGlobals.clear();
}

function rectangleFrame() {
  const id = '00000000-0000-4000-8000-000000000001';
  return {
    w: 1,
    h: 1,
    layers: [
      {
        id,
        name: 'shape',
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        matrix: [1, 0, 0, 1, 0, 0],
        adjustments: structuredClone(neutral),
        kind: 'rectangle',
        width: 1,
        height: 1,
        color: '#ff0000',
        stroke: 1,
        fill: true,
      },
    ],
    active: id,
  };
}

test('worker renderer is opt-in when OffscreenCanvas is unavailable', () => {
  assert.equal(canRenderInWorker(), false);
});

test('worker renderer rejects a forged result size and terminates', async () => {
  const workers = [];
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 2,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render size/,
    );
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer surfaces a bounded worker error without waiting for the timeout', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'error',
              id: message.id,
              name: 'DataError',
              message: 'Invalid frame payload',
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      (error) =>
        error?.name === 'DataError' &&
        error?.message === 'Invalid frame payload',
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer forwards monotonic bounded layer progress', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() => {
          this.onmessage?.({
            data: { kind: 'progress', id: message.id, completed: 1, total: 1 },
          });
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          });
        });
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const progress = [];
    await renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    assert.deepEqual(progress, [[1, 1]]);
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker callback failures retire the session before starting a queued render', async () => {
  const workers = [];
  let secondPromise;
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(message) {
      if (message.kind !== 'render') return;
      if (workers.length === 1) {
        queueMicrotask(() => this.onmessage?.({ data: {
          kind: 'progress', id: message.id, completed: 1, total: 1,
        } }));
      } else {
        queueMicrotask(() => this.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } }));
      }
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const first = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
      reuseWorker: true,
      onProgress: () => {
        secondPromise = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
          forceWorker: true,
          reuseWorker: true,
        });
        throw new Error('progress consumer failed');
      },
    });
    // Queuing the replacement cancels the superseded promise; the callback
    // failure still has to retire the first worker before the replacement can
    // run on a fresh session.
    await assert.rejects(first, (error) => error?.name === 'AbortError');
    assert.ok(secondPromise);
    const image = await Promise.resolve(secondPromise);
    assert.equal(image.width, 1);
    assert.equal(workers.length, 2);
    assert.equal(workers[0].terminated, true);
  } finally {
    resetPersistentWorkerForTests();
    restoreGlobals();
  }
});

test('worker renderer rejects forged or regressing progress before accepting output', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() => {
          this.onmessage?.({
            data: { kind: 'progress', id: message.id, completed: 2, total: 1 },
          });
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: { width: 1, height: 1, close() {} },
            },
          });
        });
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render progress/,
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer rejects a malformed result without accepting a stale image', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.terminated = false;
    }
    postMessage(message) {
      if (message.kind === 'render')
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              kind: 'result',
              id: message.id,
              width: 1,
              height: 1,
              image: {},
            },
          }),
        );
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, {
        forceWorker: true,
      }),
      /invalid render result/,
    );
    assert.equal(worker.terminated, true);
  } finally {
    restoreGlobals();
  }
});

test('worker renderer aborts, posts cancellation and cleans up', async () => {
  let worker;
  class FakeOffscreenCanvas {
    getContext() {
      return {};
    }
    transferToImageBitmap() {
      return {};
    }
  }
  class FakeWorker {
    constructor() {
      worker = this;
      this.messages = [];
      this.terminated = false;
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const controller = new AbortController();
    const pending = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      signal: controller.signal,
      forceWorker: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    assert.equal(worker.terminated, true);
    assert.equal(worker.messages.at(-1).kind, 'cancel');
  } finally {
    restoreGlobals();
  }
});

test('pre-cancelled fallback rejects before canvas allocation, including live overrides', async () => {
  const controller = new AbortController();
  controller.abort();
  for (const overrides of [undefined, {}]) {
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, overrides, {
      signal: controller.signal,
    }), (error) => error.name === 'AbortError');
  }
  await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
    isCancelled: () => true,
  }), (error) => error.name === 'AbortError');
});

async function withByteWorker(run) {
  let worker;
  class FakeOffscreenCanvas {
    getContext() { return {}; }
    transferToImageBitmap() { return {}; }
  }
  class FakeWorker {
    constructor() { worker = this; this.terminated = false; }
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => this.onmessage?.({data: {
        kind: 'result-bytes', id: message.id, width: 1, height: 1,
        bytes: new ArrayBuffer(1),
      }}));
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  try { await run(() => worker); } finally { restoreGlobals(); }
}

test('bitmap decode completing after abort closes the unused allocation', async () => {
  await withByteWorker(async (getWorker) => {
    let completeDecode;
    let closed = 0;
    setGlobal('createImageBitmap', () => new Promise(resolve => { completeDecode = resolve; }));
    const controller = new AbortController();
    const result = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, signal: controller.signal,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(result, error => error.name === 'AbortError');
    completeDecode({width: 1, height: 1, close() { closed++; }});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('encoded result checks decoded dimensions and closes forged output', async () => {
  await withByteWorker(async (getWorker) => {
    let closed = 0;
    setGlobal('createImageBitmap', async () => ({width: 2, height: 1, close() { closed++; }}));
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
    }), /decoded an invalid render size/);
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('callback cancellation during bitmap decode closes output and rejects', async () => {
  await withByteWorker(async (getWorker) => {
    let cancelled = false;
    let closed = 0;
    setGlobal('createImageBitmap', async () => {
      cancelled = true;
      return {width: 1, height: 1, close() { closed++; }};
    });
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, isCancelled: () => cancelled,
    }), error => error.name === 'AbortError');
    assert.equal(closed, 1);
    assert.equal(getWorker().terminated, true);
  });
});

test('bitmap response validates actual size and releases rejected output', async () => {
  let closed = 0;
  let terminated = false;
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'result', id: message.id, width: 1, height: 1,
        image: { width: 2, height: 1, close() { closed++; } },
      } }));
    }
    terminate() { terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
    }), /invalid render result/);
    assert.equal(closed, 1);
    assert.equal(terminated, true);
  } finally { restoreGlobals(); }
});

test('unrelated bitmap response is released without settling the active request', async () => {
  let unrelatedClosed = 0;
  let acceptedClosed = 0;
  const expected = {width: 1, height: 1, close() { acceptedClosed++; }};
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({data: {kind: 'result', id: message.id + 1, width: 1, height: 1,
          image: {width: 1, height: 1, close() { unrelatedClosed++; }}}});
        this.onmessage?.({data: {kind: 'result', id: message.id, width: 1, height: 1, image: expected}});
      });
    }
    terminate() {}
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const result = await renderFrameWithWorker(rectangleFrame(), {}, undefined, {forceWorker: true});
    assert.equal(result, expected);
    assert.equal(unrelatedClosed, 1);
    assert.equal(acceptedClosed, 0);
    result.close();
    assert.equal(acceptedClosed, 1);
  } finally { restoreGlobals(); }
});

test('persistent worker session reuses one worker and latest-wins cancellation', async () => {
  const workers = [];
  let renderCount = 0;
  class FakeCanvas {
    getContext() { return {}; }
    transferToImageBitmap() { return {}; }
  }
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(message) {
      if (message.kind === 'cancel') {
        queueMicrotask(() => this.onmessage?.({ data: { kind: 'cancelled', id: message.id } }));
        return;
      }
      if (message.kind !== 'render') return;
      renderCount += 1;
      if (renderCount === 1) return; // held until latest-wins cancel
      queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'result', id: message.id, width: 1, height: 1,
        image: { width: 1, height: 1, close() {} },
      } }));
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const first = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, reuseWorker: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true, reuseWorker: true,
    });
    await assert.rejects(first, (error) => error?.name === 'AbortError');
    const image = await second;
    assert.equal(image.width, 1);
    assert.equal(workers.length, 1);
  } finally {
    resetPersistentWorkerForTests();
    restoreGlobals();
  }
});

test('worker forwards bounded tiled telemetry before publishing its owned result', async () => {
  let worker;
  const telemetry = {
    kind: 'tiled-neighborhood',
    effect: 'gaussian-blur',
    layerId: 'layer-1',
    width: 520,
    height: 300,
    tileSize: 256,
    tileCount: 6,
    destinationBytes: 520 * 300 * 4,
    peakWorkingBytes: 2 * 512 * 512 * 4,
    cacheBytes: 0,
    peakBytes: 520 * 300 * 4 + 2 * 512 * 512 * 4,
    maxWorkingBytes: 16 * 1024 * 1024,
    maxCacheBytes: 0,
  };
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({ data: { kind: 'tiled-telemetry', id: message.id, telemetry } });
        this.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } });
      });
    }
    terminate() {}
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const events = [];
    const image = await renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
      onTiledTelemetry: (event) => events.push(event),
    });
    assert.equal(image.width, 1);
    assert.deepEqual(events, [telemetry]);
    assert.ok(worker);
  } finally { restoreGlobals(); }
});

test('worker forwards bounded tiled progress before telemetry and result', async () => {
  let worker;
  let receivedBudget;
  const progress = {
    kind: 'tiled-neighborhood-progress',
    effect: 'gaussian-blur',
    layerId: 'layer-1',
    width: 520,
    height: 300,
    tileSize: 256,
    tileCount: 6,
    completed: 3,
    total: 6,
  };
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) {
      if (message.kind === 'render') receivedBudget = message.tiledMaxWorkingBytes;
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({ data: { kind: 'tiled-progress', id: message.id, progress } });
        this.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } });
      });
    }
    terminate() {}
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    const events = [];
    const image = await renderFrameWithWorker(rectangleFrame(), {}, undefined, {
      forceWorker: true,
      tiledMaxWorkingBytes: 2 * 1024 * 1024,
      onTiledProgress: (event) => events.push(event),
    });
    assert.equal(image.width, 1);
    assert.equal(receivedBudget, 2 * 1024 * 1024);
    assert.deepEqual(events, [progress]);
    assert.ok(worker);
  } finally { restoreGlobals(); }
});

test('worker rejects forged tiled progress before accepting a result', async () => {
  let worker;
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({ data: {
          kind: 'tiled-progress', id: message.id,
          progress: { kind: 'tiled-neighborhood-progress', effect: 'box-blur', width: -1 },
        } });
        this.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } });
      });
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, { forceWorker: true }),
      /invalid tiled progress/,
    );
    assert.equal(worker.terminated, true);
  } finally { restoreGlobals(); }
});

test('worker rejects forged tiled telemetry before accepting a result', async () => {
  let worker;
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(message) {
      if (message.kind === 'render') queueMicrotask(() => {
        this.onmessage?.({ data: {
          kind: 'tiled-telemetry', id: message.id,
          telemetry: { kind: 'tiled-neighborhood', effect: 'box-blur', width: -1 },
        } });
        this.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } });
      });
    }
    terminate() { this.terminated = true; }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  try {
    await assert.rejects(
      renderFrameWithWorker(rectangleFrame(), {}, undefined, { forceWorker: true }),
      /invalid tiled telemetry/,
    );
    assert.equal(worker.terminated, true);
  } finally { restoreGlobals(); }
});

test('persistent worker sends asset fingerprints, publishes cache counters and forwards cache clears', async () => {
  const { assetFingerprint } = await import('../src/layerFilterCache.ts');
  const { clearLayerFilterCaches } = await import('../src/workerRender.ts');
  const posted = [];
  class FakeCanvas {
    getContext() { return {}; }
    transferToImageBitmap() { return {}; }
  }
  const stats = { hits: 2, misses: 0, stores: 0, evictions: 0, rejected: 0, entries: 2, bytes: 8, maxBytes: 64 };
  class FakeWorker {
    postMessage(message) {
      posted.push(message);
      if (message.kind !== 'render') return;
      queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'result', id: message.id, width: 1, height: 1, layerCache: stats,
        image: { width: 1, height: 1, close() {} },
      } }));
    }
    terminate() {}
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  performance.clearMarks('pixelforge.layer-filter-cache');
  try {
    const frame = rectangleFrame();
    const header = Buffer.alloc(33);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    header.writeUInt32BE(1, 16);
    header.writeUInt32BE(1, 20);
    const assetId = '00000000-0000-4000-8000-000000000009';
    const assets = { [assetId]: { url: `data:image/png;base64,${header.toString('base64')}`, w: 1, h: 1 } };
    const { width: _w, height: _h, color: _c, stroke: _s, fill: _f, ...common } = frame.layers[0];
    frame.layers[0] = { ...common, kind: 'raster', asset: assetId };
    const image = await renderFrameWithWorker(frame, assets, undefined, { forceWorker: true, reuseWorker: true });
    assert.equal(image.width, 1);
    const request = posted.find((message) => message.kind === 'render');
    assert.deepEqual(Object.keys(request.assetKeys), [assetId]);
    for (const [id, asset] of Object.entries(request.assets))
      assert.equal(request.assetKeys[id], assetFingerprint(asset));
    const marks = performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark');
    assert.deepEqual(marks.at(-1).detail, stats);
    clearLayerFilterCaches();
    assert.deepEqual(posted.at(-1), { kind: 'clear-layer-cache' });
  } finally {
    resetPersistentWorkerForTests();
    restoreGlobals();
  }
});

function layeredFrame(count) {
  const base = rectangleFrame();
  const layers = Array.from({ length: count }, (_, index) => ({
    ...base.layers[0],
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `shape ${index + 1}`,
  }));
  return { ...base, layers, active: layers[0].id };
}

test('render watchdog budget scales with pixels and layers within hard ceilings', () => {
  // 0.48 MP: stall 30 s + 6 s/MP; total 30 s + 15 s per MP × layer.
  assert.deepEqual(renderWatchdogBudget({ w: 800, h: 600, layers: [{}] }), {
    stallMs: 32_880,
    totalMs: 37_200,
  });
  // The reported failure: one 10.8 MP raster layer (was a fixed 30 s).
  const poster = renderWatchdogBudget({ w: 2646, h: 4096, layers: [{}] });
  assert.ok(poster.stallMs > 90_000 && poster.stallMs < 100_000, JSON.stringify(poster));
  assert.ok(poster.totalMs > 180_000 && poster.totalMs < 200_000, JSON.stringify(poster));
  const layered = renderWatchdogBudget({ w: 2646, h: 4096, layers: Array(3).fill({}) });
  assert.equal(layered.stallMs, poster.stallMs);
  assert.ok(layered.totalMs > 500_000 && layered.totalMs < 520_000, JSON.stringify(layered));
  assert.equal(renderWatchdogBudget({ w: 2646, h: 4096, layers: Array(10).fill({}) }).totalMs, 600_000);
  assert.deepEqual(renderWatchdogBudget({ w: 4000, h: 4000, layers: Array(60).fill({}) }), {
    stallMs: 120_000,
    totalMs: 600_000,
  });
  assert.deepEqual(renderWatchdogBudget({ w: 1, h: 1, layers: [] }), { stallMs: 30_000, totalMs: 30_000 });
  setGlobal('__PIXELFORGE_RENDER_TIMEOUT_MS__', 250);
  try {
    assert.deepEqual(renderWatchdogBudget({ w: 4000, h: 4000, layers: [{}] }), { stallMs: 250, totalMs: 250 });
    globalThis.__PIXELFORGE_RENDER_TIMEOUT_MS__ = { stallMs: 20, totalMs: 90 };
    assert.deepEqual(renderWatchdogBudget({ w: 1, h: 1, layers: [] }), { stallMs: 20, totalMs: 90 });
    globalThis.__PIXELFORGE_RENDER_TIMEOUT_MS__ = -1;
    assert.equal(renderWatchdogBudget({ w: 1, h: 1, layers: [] }).stallMs, 30_000);
  } finally {
    restoreGlobals();
  }
});

function watchdogWorkerHarness(onRender) {
  const workers = [];
  class FakeCanvas { getContext() { return {}; } transferToImageBitmap() { return {}; } }
  class FakeWorker {
    constructor() { this.terminated = false; this.timers = []; workers.push(this); }
    postMessage(message) {
      if (message.kind === 'render') onRender(this, message);
    }
    terminate() {
      this.terminated = true;
      for (const timer of this.timers) clearInterval(timer);
    }
  }
  setGlobal('Worker', FakeWorker);
  setGlobal('OffscreenCanvas', FakeCanvas);
  setGlobal('createImageBitmap', async () => ({}));
  return workers;
}

test('a silent worker is stopped by the stall watchdog with a clear, recoverable error', async () => {
  for (const reuseWorker of [false, true]) {
    const workers = watchdogWorkerHarness(() => {});
    setGlobal('__PIXELFORGE_RENDER_TIMEOUT_MS__', { stallMs: 30, totalMs: 5_000 });
    try {
      const started = Date.now();
      await assert.rejects(
        renderFrameWithWorker(rectangleFrame(), {}, undefined, { forceWorker: true, reuseWorker }),
        (error) =>
          error instanceof RenderTimeoutError &&
          error.name === 'RenderTimeoutError' &&
          error.code === 'PIXELFORGE_RENDER_TIMEOUT' &&
          error.stalled === true &&
          /no progress/.test(error.message) &&
          /last finished render/.test(error.message) &&
          /editing still works/.test(error.message),
      );
      assert.ok(Date.now() - started < 2_000);
      assert.equal(workers[0].terminated, true);
    } finally {
      resetPersistentWorkerForTests();
      restoreGlobals();
    }
  }
});

test('progress messages keep a long render alive past the stall window', async () => {
  for (const reuseWorker of [false, true]) {
    const frame = layeredFrame(6);
    watchdogWorkerHarness((worker, message) => {
      let completed = 0;
      const timer = setInterval(() => {
        completed += 1;
        if (completed <= 6) {
          worker.onmessage?.({ data: { kind: 'progress', id: message.id, completed, total: 6 } });
          return;
        }
        clearInterval(timer);
        worker.onmessage?.({ data: {
          kind: 'result', id: message.id, width: 1, height: 1,
          image: { width: 1, height: 1, close() {} },
        } });
      }, 25);
      worker.timers.push(timer);
    });
    // 7 × 25 ms ≈ 175 ms in total, far beyond the 60 ms stall window.
    setGlobal('__PIXELFORGE_RENDER_TIMEOUT_MS__', { stallMs: 60, totalMs: 5_000 });
    try {
      const progress = [];
      const image = await renderFrameWithWorker(frame, {}, undefined, {
        forceWorker: true,
        reuseWorker,
        onProgress: (completed) => progress.push(completed),
      });
      assert.equal(image.width, 1);
      assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
    } finally {
      resetPersistentWorkerForTests();
      restoreGlobals();
    }
  }
});

test('the total watchdog still stops a worker that reports progress forever', async () => {
  for (const reuseWorker of [false, true]) {
    const workers = watchdogWorkerHarness((worker, message) => {
      worker.timers.push(setInterval(() => {
        worker.onmessage?.({ data: { kind: 'progress', id: message.id, completed: 1, total: 1 } });
      }, 10));
    });
    setGlobal('__PIXELFORGE_RENDER_TIMEOUT_MS__', { stallMs: 50, totalMs: 150 });
    try {
      await assert.rejects(
        renderFrameWithWorker(rectangleFrame(), {}, undefined, { forceWorker: true, reuseWorker }),
        (error) => error instanceof RenderTimeoutError && error.stalled === false && /stopped after/.test(error.message),
      );
      assert.equal(workers[0].terminated, true);
    } finally {
      for (const worker of workers) worker.terminate();
      resetPersistentWorkerForTests();
      restoreGlobals();
    }
  }
});
