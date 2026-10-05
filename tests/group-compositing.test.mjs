import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compositeGroupPixels,
  groupCompositingBounds,
} from '../src/groupCompositing.ts';
import { neutral, renderFrame } from '../src/document.ts';

const pixel = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);

test('group blend modes composite one isolated surface after child overlap', () => {
  const background = pixel(200, 100, 50);
  const group = pixel(100, 150, 200);
  const originalBackground = background.slice();
  const originalGroup = group.slice();
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 1, 'source-over')],
    [100, 150, 200, 255],
  );
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 1, 'multiply')],
    [78, 59, 39, 255],
  );
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 1, 'screen')],
    [222, 191, 211, 255],
  );
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 1, 'difference')],
    [100, 50, 150, 255],
  );
  assert.deepEqual(background, originalBackground);
  assert.deepEqual(group, originalGroup);
});

test('group opacity applies once after overlap and preserves partial alpha', () => {
  const background = pixel(200, 100, 50);
  const group = pixel(100, 150, 200);
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 0.5, 'source-over')],
    [150, 125, 125, 255],
  );
  const partial = compositeGroupPixels(
    pixel(10, 20, 30, 127),
    pixel(110, 120, 130, 128),
    1,
    1,
    0.5,
    'screen',
  );
  assert.equal(partial[3], 159);
  assert.notDeepEqual([...partial], [10, 20, 30, 127]);
});

test('transparent hidden RGB remains untouched and malformed bounds fail closed', () => {
  const background = pixel(11, 22, 33, 0);
  const group = pixel(99, 88, 77, 0);
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 1, 'multiply')],
    [11, 22, 33, 0],
  );
  assert.deepEqual(
    [...compositeGroupPixels(background, group, 1, 1, 0, 'difference')],
    [...background],
  );
  assert.throws(
    () => compositeGroupPixels(background, group, 0, 1, 1, 'source-over'),
    /dimensions/,
  );
  assert.throws(
    () => compositeGroupPixels(new Uint8ClampedArray(3), group, 1, 1, 1, 'source-over'),
    /buffers/,
  );
  assert.throws(
    () => compositeGroupPixels(background, group, 1, 1, 1, 'invalid'),
    /blend mode/,
  );
  assert.equal(groupCompositingBounds.maxPixels, 16_000_000);
});

// This recording surface checks the production renderer's orchestration while
// the browser suite verifies real Canvas pixel math on both device layouts.
const rectangle = (id, groupId) => ({
  id,
  groupId,
  name: id,
  visible: true,
  locked: false,
  opacity: 0.8,
  blend: 'screen',
  matrix: [1, 0, 0, 1, 2, 3],
  adjustments: structuredClone(neutral),
  kind: 'rectangle',
  width: 2,
  height: 2,
  color: '#ff0000',
  stroke: 1,
  fill: true,
});
const folder = (patch = {}) => ({
  id: 'folder',
  name: 'Folder',
  visible: true,
  locked: false,
  opacity: 0.5,
  blend: 'multiply',
  collapsed: false,
  ...patch,
});

async function withRecordingSurface(run, onFill = () => {}) {
  const original = globalThis.OffscreenCanvas;
  const surfaces = [];
  class RecordingSurface {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.operations = [];
      const state = {};
      const stack = [];
      this.context = {
        save: () => stack.push({ ...state }),
        restore: () => {
          const prior = stack.pop();
          Object.keys(state).forEach((key) => delete state[key]);
          Object.assign(state, prior);
        },
        setTransform: (...matrix) => { state.matrix = matrix; },
        fillRect: () => {
          this.operations.push({ kind: 'fill', ...state });
          onFill();
        },
        drawImage: (source) => this.operations.push({ kind: 'draw', source, ...state }),
      };
      for (const name of ['globalAlpha', 'globalCompositeOperation', 'filter', 'fillStyle', 'strokeStyle', 'lineWidth'])
        Object.defineProperty(this.context, name, {
          get: () => state[name],
          set: (value) => { state[name] = value; },
        });
      surfaces.push(this);
    }
    getContext() { return this.context; }
  }
  globalThis.OffscreenCanvas = RecordingSurface;
  try {
    await run(surfaces);
  } finally {
    if (original === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = original;
  }
}

test('production folder render preserves child state and reports only outer monotonic progress', async () => {
  await withRecordingSurface(async (surfaces) => {
    const progress = [];
    const frame = {
      w: 8,
      h: 8,
      layers: [rectangle('a', 'folder'), rectangle('middle'), rectangle('b', 'folder')],
      groups: [folder()],
      active: 'b',
    };
    const original = structuredClone(frame);
    await renderFrame(frame, {}, undefined, {
      yieldEveryLayers: 1,
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
    assert.equal(surfaces.length, 2);
    assert.deepEqual(surfaces[1].operations.map(({ globalAlpha, globalCompositeOperation, matrix }) => ({
      globalAlpha, globalCompositeOperation, matrix,
    })), [
      { globalAlpha: 0.8, globalCompositeOperation: 'screen', matrix: [1, 0, 0, 1, 2, 3] },
      { globalAlpha: 0.8, globalCompositeOperation: 'screen', matrix: [1, 0, 0, 1, 2, 3] },
    ]);
    assert.equal(surfaces[0].operations[0].source, surfaces[1]);
    assert.equal(surfaces[0].operations[0].globalAlpha, 0.5);
    assert.equal(surfaces[0].operations[0].globalCompositeOperation, 'multiply');
    assert.equal(surfaces[0].operations[1].kind, 'fill');
    assert.deepEqual(frame, original);
  });
});

test('folder cancellation after child rendering never publishes the isolated surface', async () => {
  let cancelled = false;
  await withRecordingSurface(async (surfaces) => {
    const frame = { w: 8, h: 8, layers: [rectangle('a', 'folder')], groups: [folder()], active: 'a' };
    const progress = [];
    await assert.rejects(renderFrame(frame, {}, undefined, {
      isCancelled: () => cancelled,
      onProgress: (...event) => progress.push(event),
    }), { name: 'AbortError' });
    assert.equal(surfaces[0].operations.length, 0);
    assert.deepEqual(progress, []);
  }, () => { cancelled = true; });
});

test('hidden and zero-opacity folders skip child surfaces but complete outer progress', async () => {
  for (const patch of [{ visible: false }, { opacity: 0 }]) {
    await withRecordingSurface(async (surfaces) => {
      const progress = [];
      const frame = { w: 8, h: 8, layers: [rectangle('a', 'folder')], groups: [folder(patch)], active: 'a' };
      await renderFrame(frame, {}, undefined, {
        onProgress: (...event) => progress.push(event),
      });
      assert.equal(surfaces.length, 1);
      assert.equal(surfaces[0].operations.length, 0);
      assert.deepEqual(progress, [[1, 1]]);
    });
  }
});
