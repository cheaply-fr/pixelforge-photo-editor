import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commonLayer,
  neutral,
  referencedAssets,
  validateFrame,
} from '../src/document.ts';
import { defaultVectorMaskPath } from '../src/vectorMask.ts';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '00000000-0000-4000-8000-000000000001';
const assets = { [assetId]: { url: png, w: 4, h: 4 } };
const mask = () => ({
  path: defaultVectorMaskPath(4, 4),
  enabled: true,
  inverted: false,
});
const frame = (layer) => ({
  w: 4,
  h: 4,
  layers: [layer],
  active: layer.id,
  selectedLayerIds: [layer.id],
});
const raster = (name = 'Raster') => ({
  ...commonLayer(name),
  kind: 'raster',
  asset: assetId,
});

test('vector masks validate on every visible layer kind and preserve editable data', () => {
  const layers = [
    raster(),
    { ...commonLayer('Smart object'), kind: 'smart-object', asset: assetId },
    { ...commonLayer('Text'), kind: 'text', text: 'Mask', color: '#ffffff', fontSize: 12, fontFamily: 'Arial', bold: false, boxWidth: 64, textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, orientation: 'horizontal' },
    { ...commonLayer('Rectangle'), kind: 'rectangle', width: 4, height: 4, color: '#ff0000', stroke: 1, fill: true },
    { ...commonLayer('Ellipse'), kind: 'ellipse', width: 4, height: 4, color: '#ff0000', stroke: 1, fill: true },
    { ...commonLayer('Line'), kind: 'line', width: 4, height: 4, color: '#ff0000', stroke: 1 },
    { ...commonLayer('Polygon'), kind: 'polygon', width: 4, height: 4, color: '#ff0000', stroke: 1, fill: true, sides: 5 },
    {
      ...commonLayer('Path'),
      kind: 'path',
      path: {
        ...defaultVectorMaskPath(4, 4),
        stroke: true,
        strokeWidth: 1,
      },
    },
  ].map((layer) => ({ ...layer, vectorMask: mask() }));

  for (const layer of layers) assert.doesNotThrow(() => validateFrame(frame(layer), assets), layer.name);
  const restored = JSON.parse(JSON.stringify(frame(layers[0])));
  validateFrame(restored, assets);
  assert.deepEqual(restored.layers[0].vectorMask, layers[0].vectorMask);
  assert.deepEqual(referencedAssets([restored], assets), assets);
});

test('vector-mask validation rejects unsupported layers and malformed persisted controls', () => {
  const adjustment = { ...commonLayer('Levels'), kind: 'adjustment', adjustments: { ...neutral }, vectorMask: mask() };
  assert.throws(() => validateFrame(frame(adjustment), {}), /Invalid layer document/);

  const invalid = (patch) => ({ ...raster(), vectorMask: { ...mask(), ...patch } });
  assert.throws(() => validateFrame(frame(invalid({ enabled: 'yes' })), assets), /Invalid layer document/);
  assert.throws(() => validateFrame(frame(invalid({ inverted: 1 })), assets), /Invalid layer document/);
  assert.throws(() => validateFrame(frame(invalid({ path: { ...defaultVectorMaskPath(4, 4), fill: false } })), assets), /Invalid layer document/);
  assert.throws(() => validateFrame(frame({ ...raster(), vectorMask: { path: defaultVectorMaskPath(4, 4), enabled: true } }), assets), /Invalid layer document/);
  assert.throws(() => validateFrame(frame({ ...raster(), vectorMask: { ...mask(), path: { ...defaultVectorMaskPath(4, 4), nodes: [{ x: Infinity, y: 0 }] } } }), assets), /Invalid layer document/);
});

test('vector-mask edits do not mutate source assets or layer history metadata', () => {
  const original = raster();
  const withMask = { ...original, vectorMask: mask() };
  const restored = JSON.parse(JSON.stringify(frame(withMask)));
  validateFrame(restored, assets);
  assert.equal(original.vectorMask, undefined);
  assert.equal(withMask.asset, assetId);
  assert.equal(restored.layers[0].asset, assetId);
  assert.equal(restored.layers[0].vectorMask.enabled, true);
  assert.equal(restored.layers[0].vectorMask.inverted, false);
  assert.deepEqual(assets[assetId], { url: png, w: 4, h: 4 });
});
