import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfFromJpeg } from '../src/pdfExport.ts';
import { decodePdfComposite } from '../src/pdf.ts';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

test('decodes the bounded single-page JPEG composite emitted by the PDF exporter', async () => {
  const decoded = decodePdfComposite(await bytes(buildPdfFromJpeg(JPEG, 320, 200)));
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 320, height: 200 });
  assert.deepEqual([...decoded.jpeg], [...JPEG]);
});

test('rejects unsupported PDF structure, malformed streams and unsafe dimensions', async () => {
  assert.throws(() => decodePdfComposite(new TextEncoder().encode('%PDF-1.7\n%%EOF\n')), /no supported JPEG image/);
  const valid = await bytes(buildPdfFromJpeg(JPEG, 1, 1));
  const missingEof = valid.slice(0, -6);
  assert.throws(() => decodePdfComposite(missingEof), /truncated/);
  const extraImage = new TextDecoder().decode(valid).replace('/Subtype /Image', '/Subtype /Image /Subtype /Image');
  assert.throws(() => decodePdfComposite(new TextEncoder().encode(extraImage)), /exactly one image/);
  const unsafe = new TextDecoder().decode(valid).replace('/Width 1 /Height 1', '/Width 16001 /Height 1');
  assert.throws(() => decodePdfComposite(new TextEncoder().encode(unsafe)), /16 megapixels/);
});
