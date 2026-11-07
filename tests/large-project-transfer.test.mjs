import test from 'node:test';
import assert from 'node:assert/strict';
import { assetsToSend, resolveRequestAssets, retainedAssetStore } from '../src/workerAssets.ts';
import { dataUrlBlob, verifyAssetsDecode } from '../src/document.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const url = `data:image/png;base64,${png}`;
const asset = (tag) => ({ url: `${url}#${tag}`, w: 1, h: 1 });

test('only assets the worker does not hold are sent, and the worker rebuilds the full map', () => {
  const used = { a: asset('a'), b: asset('b'), c: asset('c') };
  const keys = { a: 'ka', b: 'kb', c: 'kc' };
  // First request: nothing held, everything is sent.
  assert.deepEqual(Object.keys(assetsToSend(used, keys, new Set())), ['a', 'b', 'c']);
  const store = retainedAssetStore(used, keys);
  assert.deepEqual([...store.keys()], ['ka', 'kb', 'kc']);
  // An edit replaces layer b: only the new content is sent.
  const edited = { a: used.a, b: asset('b2'), c: used.c };
  const editedKeys = { a: 'ka', b: 'kb2', c: 'kc' };
  const sent = assetsToSend(edited, editedKeys, new Set(store.keys()));
  assert.deepEqual(Object.keys(sent), ['b']);
  const resolved = resolveRequestAssets(sent, editedKeys, store);
  assert.deepEqual(resolved.missing, []);
  assert.deepEqual(resolved.assets, edited);
  // The worker keeps exactly the latest request's assets.
  assert.deepEqual([...retainedAssetStore(resolved.assets, editedKeys).keys()].sort(), ['ka', 'kb2', 'kc']);
  // A reused id with new content is matched by content, not id.
  assert.equal(resolveRequestAssets({}, { a: 'kc' }, store).assets.a, used.c);
  // Anything the store lacks is reported so the request is resent in full.
  assert.deepEqual(resolveRequestAssets({}, { z: 'unknown' }, store).missing, ['z']);
  // Requests without fingerprints (non-persistent renders) carry every asset.
  assert.deepEqual(resolveRequestAssets(used, undefined, new Map()).assets, used);
});

test('data URL bytes decode without a per-character map', async () => {
  const blob = await dataUrlBlob(url);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array(Buffer.from(png, 'base64')));
});

test('install-time verification decodes assets a few at a time without caching and fails closed', async () => {
  const previous = globalThis.createImageBitmap;
  let active = 0,
    peak = 0,
    closed = 0;
  globalThis.createImageBitmap = async (blob) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    return { width: view.getUint32(16), height: view.getUint32(20), close: () => (closed += 1) };
  };
  try {
    const good = { url, w: 1, h: 1 };
    await verifyAssetsDecode(Array.from({ length: 10 }, () => good), { concurrency: 3 });
    assert.equal(peak, 3);
    assert.equal(closed, 10, 'decoded bitmaps are released, not retained');
    await assert.rejects(verifyAssetsDecode([good, { url, w: 2, h: 1 }], { concurrency: 2 }), /Invalid or oversized|dimensions/);
    await assert.rejects(verifyAssetsDecode([{ url: 'data:image/png;base64,AAAA', w: 1, h: 1 }]), /Invalid or oversized/);
    let checks = 0;
    await assert.rejects(
      verifyAssetsDecode([good, good, good], {
        concurrency: 1,
        assertCurrent: () => {
          checks += 1;
          if (checks > 1) throw new DOMException('Document import cancelled', 'AbortError');
        },
      }),
      /cancelled/,
    );
    await verifyAssetsDecode([]);
  } finally {
    globalThis.createImageBitmap = previous;
  }
});

test('install leaves only the sources a render decodes to that render', async () => {
  const { assetsDecodedByRender, commonLayer } = await import('../src/document.ts');
  const assets = { a: { url, w: 10, h: 10 }, b: { url, w: 10, h: 10 }, c: { url, w: 10, h: 10 }, d: { url, w: 10, h: 10 }, e: { url, w: 10, h: 10 }, f: { url, w: 10, h: 10 }, m: { url, w: 100, h: 100 } };
  const layer = (id, asset, patch = {}) => ({ ...commonLayer(id), id, kind: 'raster', asset, ...patch });
  const frame = {
    w: 100,
    h: 100,
    active: 'l1',
    groups: [{ id: 'g', name: 'Hidden', visible: false, locked: false, opacity: 1, blend: 'source-over', collapsed: false }],
    layers: [
      layer('l1', 'a', { mask: 'm' }),
      layer('l2', 'b', { visible: false }),
      layer('l3', 'c', { opacity: 0 }),
      layer('l4', 'd', { groupId: 'g' }),
      layer('l5', 'e', { matrix: [1, 0, 0, 1, 500, 0] }),
      layer('l6', 'f', { fillColor: '#ff0000' }),
    ],
  };
  // Only the visible, composited source is decoded by the render; masks,
  // hidden/transparent/off-canvas layers and fill layers are verified on install.
  assert.deepEqual([...assetsDecodedByRender(frame, assets)], ['a']);
});
