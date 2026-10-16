import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePsdComposite } from '../src/psd.ts';
import {
  PSD_EXPORT_MIME,
  encodePsdCompositePixels,
} from '../src/psdExport.ts';

test('encodes a flattened RGBA composite that the bounded PSD decoder can round-trip', async () => {
  const source = Uint8ClampedArray.from([
    255, 0, 12, 255,
    3, 120, 240, 128,
    17, 22, 33, 0,
    90, 80, 70, 64,
  ]);
  const blob = encodePsdCompositePixels(source, 2, 2);
  assert.equal(blob.type, PSD_EXPORT_MIME);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x38, 0x42, 0x50, 0x53]);
  assert.equal(new DataView(bytes.buffer).getUint16(4), 1);
  const decoded = decodePsdComposite(bytes);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.pixels, source);
});

test('PSD export keeps deterministic planar channel ordering and no metadata sections', async () => {
  const blob = encodePsdCompositePixels(Uint8ClampedArray.from([1, 2, 3, 4]), 1, 1);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(12), 4);
  assert.equal(view.getUint16(22), 8);
  assert.equal(view.getUint16(24), 3);
  assert.equal(view.getUint32(26), 0);
  assert.equal(view.getUint32(30), 0);
  assert.equal(view.getUint32(34), 0);
  assert.equal(view.getUint16(38), 0);
  assert.deepEqual(Array.from(bytes.slice(40)), [1, 2, 3, 4]);
});

test('PSD export rejects malformed dimensions, buffers and oversized canvases', () => {
  assert.throws(() => encodePsdCompositePixels(new Uint8ClampedArray(4), 0, 1), /dimensions/);
  assert.throws(() => encodePsdCompositePixels(new Uint8ClampedArray(4), 2, 1), /pixels/);
  assert.throws(
    () => encodePsdCompositePixels(new Uint8ClampedArray(0), 4096, 4097),
    /16 megapixels/,
  );
});
