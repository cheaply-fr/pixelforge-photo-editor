import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfFromJpeg, PDF_EXPORT_MIME } from '../src/pdfExport.ts';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

test('builds a deterministic single-page PDF image composite', async () => {
  const blob = buildPdfFromJpeg(JPEG, 320, 200);
  assert.equal(blob.type, PDF_EXPORT_MIME);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(bytes.toString(), /\/Type \/Catalog/);
  assert.match(bytes.toString(), /\/Subtype \/Image/);
  assert.match(bytes.toString(), /\/Width 320 \/Height 200/);
  assert.match(bytes.toString(), /\/Filter \/DCTDecode/);
  assert.equal(bytes.subarray(bytes.length - 6).toString(), '%%EOF\n');
});

test('PDF composite rejects invalid JPEGs, dimensions and oversized documents', () => {
  assert.throws(() => buildPdfFromJpeg(Uint8Array.from([1, 2]), 1, 1), /valid JPEG/);
  assert.throws(() => buildPdfFromJpeg(JPEG, 0, 1), /dimensions/);
  assert.throws(() => buildPdfFromJpeg(JPEG, 4096, 4097), /16 megapixels/);
});
