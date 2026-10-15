import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageBatchExport, decodeBatchImage, MAX_BATCH_INPUTS } from '../src/imageBatch.ts';

function canvas(width, height) {
  return { width, height };
}

function blob(bytes, type = 'image/png') {
  return new Blob([new Uint8Array(bytes)], { type });
}

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name, data: bytes.subarray(start, start + size) });
    offset = start + size;
  }
  return entries;
}

test('multi-input export reports individual failures and keeps successful images', async () => {
  const progress = [];
  const result = await buildImageBatchExport({
    sources: [
      { name: '../holiday/photo.png', file: blob([1]) },
      { name: 'holiday/photo.png', file: blob([2]) },
      { name: 'broken.jpg', file: blob([3]) },
    ],
    format: 'png',
    quality: 92,
    decode: async (source) => {
      if (source.name === 'broken.jpg') throw new Error('Unsupported image data');
      return source.name.includes('holiday/photo') && source.name.startsWith('../')
        ? canvas(4, 3)
        : canvas(2, 5);
    },
    encode: async (image) => blob([image.width, image.height]),
    onProgress: (event) => progress.push(event),
  });
  assert.deepEqual(result.manifest, {
    application: 'pixelforge-photo-editor',
    kind: 'multi-input-image-export',
    format: 'png',
    quality: 92,
    sourceCount: 3,
    exportedCount: 2,
    failedCount: 1,
    generatedAt: result.manifest.generatedAt,
    metadata: 'rendered pixels only; source EXIF, GPS and color profiles omitted',
    entries: [
      { file: 'photo-001.png', source: '../holiday/photo.png', width: 4, height: 3, bytes: 2 },
      { file: 'photo-002.png', source: 'holiday/photo.png', width: 2, height: 5, bytes: 2 },
    ],
    failures: [{ source: 'broken.jpg', reason: 'Unsupported image data' }],
  });
  assert.deepEqual(progress.map(({ source, status, completed, total }) => ({ source, status, completed, total })), [
    { source: '../holiday/photo.png', status: 'exported', completed: 1, total: 3 },
    { source: 'holiday/photo.png', status: 'exported', completed: 2, total: 3 },
    { source: 'broken.jpg', status: 'failed', completed: 3, total: 3 },
  ]);
  const entries = readStoredZip(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(entries.map(({ name }) => name), [
    'photo-001.png',
    'photo-002.png',
    'pixelforge-batch-manifest.json',
  ]);
  const manifestBytes = entries.at(-1).data;
  assert.equal(new TextDecoder().decode(manifestBytes).includes('data:image'), false);
  assert.equal(new TextDecoder().decode(manifestBytes).includes('Unsupported image data'), true);
});

test('multi-input export cancels before archiving and limits input count', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    buildImageBatchExport({
      sources: [{ name: 'x.png', file: blob([1]) }],
      format: 'jpeg',
      quality: 80,
      signal: controller.signal,
      decode: async () => canvas(1, 1),
      encode: async () => blob([1], 'image/jpeg'),
    }),
    { name: 'AbortError' },
  );
  await assert.rejects(
    buildImageBatchExport({
      sources: Array.from({ length: MAX_BATCH_INPUTS + 1 }, (_, index) => ({
        name: `image-${index}.png`,
        file: blob([1]),
      })),
      format: 'png',
      quality: 80,
    }),
    /at most 64 images/,
  );
});

test('multi-input export fails safely when every source is invalid', async () => {
  const progress = [];
  await assert.rejects(
    buildImageBatchExport({
      sources: [
        { name: 'one.png', file: blob([1]) },
        { name: 'two.png', file: blob([2]) },
      ],
      format: 'webp',
      quality: 70,
      decode: async () => {
        throw new Error('Not an image');
      },
      onProgress: (event) => progress.push(event),
    }),
    /no usable images.*Not an image/,
  );
  assert.deepEqual(progress.map((event) => event.status), ['failed', 'failed']);
});

test('batch decoding rejects camera formats before invoking browser decoders', async () => {
  await assert.rejects(
    decodeBatchImage({ name: 'camera.nef', file: blob([1], 'application/octet-stream') }),
    /not supported yet|RAW/,
  );
});

test('batch decoding rejects unknown containers before invoking browser decoders', async () => {
  await assert.rejects(
    decodeBatchImage({
      name: 'notes.bin',
      file: blob([0, 1, 2], 'application/octet-stream'),
    }),
    /PNG, JPEG or WebP/,
  );
});
