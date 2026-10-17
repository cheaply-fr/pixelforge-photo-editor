import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeImportFormat,
  importFailureMessage,
} from '../src/importFormats.ts';

test('PSD and PSB are conditional flattened composite imports', () => {
  for (const name of ['layer.psd', 'large.PSB']) {
    const info = describeImportFormat(name, 'application/octet-stream');
    assert.deepEqual(
      { format: info.format, capability: info.capability, tryDecode: info.tryDecode },
      { format: 'psd', capability: 'conditional', tryDecode: true },
    );
    assert.match(info.disclosure, /flattened editable raster/);
  }
  assert.match(importFailureMessage(describeImportFormat('layer.psd')), /PSD\/PSB/);
});

test('camera RAW extensions are classified without confusing them with raster images', () => {
  const info = describeImportFormat('IMG_0001.CR3', 'application/octet-stream');
  assert.equal(info.format, 'raw');
  assert.equal(info.capability, 'unsupported');
  assert.equal(info.tryDecode, false);
  assert.match(info.disclosure, /camera metadata/);
});

test('HEIC is conditional and discloses flattened raster import', () => {
  const byName = describeImportFormat('photo.heic', 'application/octet-stream');
  const byMime = describeImportFormat('photo.bin', 'image/heif; codecs= hvc1');
  for (const info of [byName, byMime]) {
    assert.equal(info.format, 'heic');
    assert.equal(info.capability, 'conditional');
    assert.equal(info.tryDecode, true);
    assert.match(info.disclosure, /flattened editable raster/);
  }
  assert.match(importFailureMessage(byName), /Convert it to PNG or JPEG/);
});

test('TIFF is conditional and never claims a lossless container round trip', () => {
  const byName = describeImportFormat('scan.TIF', 'application/octet-stream');
  const byMime = describeImportFormat('scan.bin', 'image/x-tiff; charset=binary');
  for (const info of [byName, byMime]) {
    assert.deepEqual(
      { format: info.format, capability: info.capability, tryDecode: info.tryDecode },
      { format: 'tiff', capability: 'conditional', tryDecode: true },
    );
    assert.match(info.disclosure, /browser decoder/);
    assert.match(info.disclosure, /flattened editable raster/);
  }
  assert.match(importFailureMessage(byName), /^This TIFF is not a supported/);
});

test('SVG is conditional flattened rasterization with vector-loss disclosure', () => {
  const byName = describeImportFormat('illustration.svg', 'application/octet-stream');
  const byMime = describeImportFormat('illustration.bin', 'image/svg+xml; charset=utf-8');
  for (const info of [byName, byMime]) {
    assert.deepEqual(
      { format: info.format, capability: info.capability, tryDecode: info.tryDecode },
      { format: 'svg', capability: 'conditional', tryDecode: true },
    );
    assert.match(info.disclosure, /flattened/);
    assert.match(info.disclosure, /vector paths/);
  }
  assert.match(importFailureMessage(byName), /safe local SVG/);
});

test('PDF is conditional single-page JPEG composite import', () => {
  for (const info of [
    describeImportFormat('proof.pdf', 'application/octet-stream'),
    describeImportFormat('proof.bin', 'application/pdf'),
  ]) {
    assert.deepEqual(
      { format: info.format, capability: info.capability, tryDecode: info.tryDecode },
      { format: 'pdf', capability: 'conditional', tryDecode: true },
    );
    assert.match(info.disclosure, /single-page JPEG composite/);
  }
});

test('format extension wins over a misleading browser MIME type', () => {
  const psd = describeImportFormat('layer.psd', 'image/png');
  const raw = describeImportFormat('camera.dng', 'image/jpeg');
  const heic = describeImportFormat('photo.heic', 'image/png');
  assert.equal(psd.format, 'psd');
  assert.equal(psd.tryDecode, true);
  assert.equal(raw.format, 'raw');
  assert.equal(raw.tryDecode, false);
  assert.equal(heic.format, 'heic');
  assert.equal(heic.tryDecode, true);
});

test('ordinary browser raster sources are supported but explicitly flattened', () => {
  const info = describeImportFormat('portrait.jpeg', 'image/jpeg; charset=binary');
  assert.deepEqual(
    { format: info.format, capability: info.capability, tryDecode: info.tryDecode },
    { format: 'raster', capability: 'supported', tryDecode: true },
  );
  assert.match(info.disclosure, /flattened editable raster/);
});

test('unknown files are rejected with a useful conversion hint', () => {
  const info = describeImportFormat('notes.txt', 'text/plain');
  assert.equal(info.format, 'unknown');
  assert.equal(info.tryDecode, false);
  assert.match(info.disclosure, /PNG, JPEG or WebP/);
});
