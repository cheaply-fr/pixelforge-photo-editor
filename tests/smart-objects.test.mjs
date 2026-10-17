import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commonLayer,
  neutral,
  referencedAssets,
  validateFrame,
  isRasterContentLayer,
} from '../src/document.ts';
import { layerBounds } from '../src/canvasSize.ts';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const embeddedId = '00000000-0000-4000-8000-000000000001';
const unusedId = '00000000-0000-4000-8000-000000000002';
const assets = {
  [embeddedId]: { url: png, w: 24, h: 12 },
  [unusedId]: { url: png, w: 1, h: 1 },
};
const smart = () => ({
  ...commonLayer('Product source'),
  kind: 'smart-object',
  asset: embeddedId,
  sourceName: 'product.png',
});
const frame = (layer = smart()) => ({
  w: 64,
  h: 64,
  layers: [layer],
  active: layer.id,
  selectedLayerIds: [layer.id],
});

test('smart objects validate as embedded source-retaining layers and report source bounds', () => {
  const layer = smart();
  assert.doesNotThrow(() => validateFrame(frame(layer), assets));
  assert.equal(isRasterContentLayer(layer), true);
  assert.deepEqual(layerBounds(layer, assets), { x: 0, y: 0, width: 24, height: 12 });
});

test('smart object metadata and immutable source reference survive JSON round trip', () => {
  const restored = JSON.parse(JSON.stringify(frame({ ...smart(), linkId: '00000000-0000-4000-8000-000000000099' })));
  validateFrame(restored, assets);
  assert.equal(restored.layers[0].kind, 'smart-object');
  assert.equal(restored.layers[0].asset, embeddedId);
  assert.equal(restored.layers[0].sourceName, 'product.png');
  assert.equal(restored.layers[0].linkId, '00000000-0000-4000-8000-000000000099');
  assert.deepEqual(restored.layers[0].adjustments, neutral);
});

test('nested smart-object contents stay editable, bounded and recursively compacted', () => {
  const childLayer = {
    ...commonLayer('Child source'),
    kind: 'raster',
    asset: embeddedId,
  };
  const child = {
    w: 24,
    h: 12,
    layers: [childLayer],
    active: childLayer.id,
    selectedLayerIds: [childLayer.id],
  };
  const nested = frame({ ...smart(), contents: child });
  assert.doesNotThrow(() => validateFrame(nested, assets));
  const restored = JSON.parse(JSON.stringify(nested));
  validateFrame(restored, assets);
  assert.equal(restored.layers[0].contents.layers[0].kind, 'raster');
  assert.deepEqual(Object.keys(referencedAssets([nested], { ...assets, [unusedId]: assets[unusedId] })), [embeddedId]);
  assert.throws(
    () => validateFrame(frame({ ...smart(), contents: { ...child, w: 23 } }), assets),
    /Invalid layer document/,
  );
});

test('nested smart-object depth guard rejects recursive chains beyond the local limit', () => {
  const make = (depth) => {
    const child = {
      ...commonLayer(`Depth ${depth}`),
      kind: 'smart-object',
      asset: embeddedId,
    };
    if (depth > 0) {
      const contents = make(depth - 1);
      child.contents = {
        w: 24,
        h: 12,
        layers: [contents],
        active: contents.id,
      };
    }
    return child;
  };
  const root = make(5);
  assert.throws(
    () => validateFrame({ w: 24, h: 12, layers: [root], active: root.id }, assets),
    /Invalid layer document/,
  );
});

test('linked smart-object identities are validated without changing their editable transforms', () => {
  const first = smart();
  const second = { ...smart(), id: '00000000-0000-4000-8000-000000000010', matrix: [1, 0, 0, 1, 18, 4] };
  const linked = frame(first);
  linked.layers = [
    { ...first, linkId: '00000000-0000-4000-8000-000000000099' },
    { ...second, linkId: '00000000-0000-4000-8000-000000000099' },
  ];
  linked.active = second.id;
  linked.selectedLayerIds = [first.id, second.id];
  assert.doesNotThrow(() => validateFrame(linked, assets));
  assert.deepEqual(linked.layers[1].matrix, [1, 0, 0, 1, 18, 4]);
  assert.throws(
    () => validateFrame(frame({ ...smart(), linkId: 'not-an-id' }), assets),
    /Invalid layer document/,
  );
});

test('referenced asset compaction keeps embedded smart-object source and drops unused assets', () => {
  const compacted = referencedAssets([frame()], assets);
  assert.deepEqual(Object.keys(compacted), [embeddedId]);
  assert.equal(compacted[embeddedId].url, png);
});

test('smart objects reject raster-only cleanup metadata and malformed source labels', () => {
  assert.throws(
    () => validateFrame(frame({ ...smart(), fillColor: '#ff0000' }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...smart(), sourceName: 'x'.repeat(161) }), assets),
    /Invalid layer document/,
  );
  assert.throws(
    () => validateFrame(frame({ ...smart(), spotHealing: [] }), assets),
    /Invalid layer document/,
  );
});
