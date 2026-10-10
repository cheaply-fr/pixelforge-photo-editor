import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyClippingAlpha,
  clippingBase,
  isPixelProducingLayer,
  sanitizeClippingRelations,
  validClippingRelationship,
} from '../src/layerClipping.ts';

const id = (n) =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const layer = (idValue, kind, patch = {}) => ({
  id: idValue,
  name: idValue,
  kind,
  groupId: undefined,
  ...patch,
});

test('clipping relationships require adjacent same-root pixel-producing base', () => {
  const base = layer(id(1), 'path'),
    source = layer(id(2), 'raster', { clippingTo: id(1) }),
    frame = { layers: [base, source] };
  assert.equal(isPixelProducingLayer(base), true);
  assert.equal(validClippingRelationship(frame, source.id, base.id), true);
  assert.equal(clippingBase(frame, source), base);
  assert.equal(clippingBase({ layers: [base, { ...source, clippingTo: undefined }] }, { ...source, clippingTo: undefined }), undefined);
  assert.equal(
    validClippingRelationship({ layers: [source, base] }, source.id, base.id),
    false,
  );
  assert.equal(
    validClippingRelationship(
      { layers: [base, layer(id(3), 'rectangle'), source] },
      source.id,
      base.id,
    ),
    false,
  );
  assert.equal(
    validClippingRelationship(
      { layers: [base, layer(id(3), 'rectangle', { groupId: id(9) }), source] },
      source.id,
      base.id,
    ),
    false,
  );
});

test('invalid links are released immutably after stack edits', () => {
  const base = layer(id(1), 'rectangle'),
    source = layer(id(2), 'smart-object', { clippingTo: id(1) }),
    frame = { layers: [base, source] },
    reordered = { layers: [source, base] },
    sanitized = sanitizeClippingRelations(reordered);
  assert.equal(frame.layers[1].clippingTo, base.id);
  assert.equal(sanitizeClippingRelations(frame), frame);
  assert.equal('clippingTo' in sanitized.layers[0], false);
  assert.notEqual(sanitized, reordered);
});

test('clipping alpha preserves source RGB and input buffers', () => {
  const source = new Uint8ClampedArray([255, 10, 20, 255, 1, 2, 3, 127]),
    base = new Uint8ClampedArray([0, 0, 0, 128, 0, 0, 0, 0]),
    clipped = applyClippingAlpha(source, base);
  assert.deepEqual([...clipped], [255, 10, 20, 128, 1, 2, 3, 0]);
  assert.deepEqual([...source], [255, 10, 20, 255, 1, 2, 3, 127]);
  assert.deepEqual([...base], [0, 0, 0, 128, 0, 0, 0, 0]);
  assert.throws(
    () =>
      applyClippingAlpha(new Uint8ClampedArray(4), new Uint8ClampedArray(8)),
    /matching/,
  );
});
