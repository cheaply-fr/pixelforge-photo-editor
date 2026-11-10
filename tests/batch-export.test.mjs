import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32, safeBatchStem } from '../src/export.ts';
import { normalizeBatchDocumentMetadata } from '../src/batch.ts';

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name, data: bytes.subarray(start, start + size) });
    offset = start + size;
  }
  const centralOffset = offset;
  const centralEntries = [];
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const size = view.getUint32(offset + 24, true);
    const checksum = view.getUint32(offset + 16, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    centralEntries.push({ name, size, checksum, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(view.getUint32(offset, true), 0x06054b50, 'end-of-directory follows central entries');
  assert.equal(view.getUint16(offset + 8, true), entries.length);
  assert.equal(view.getUint16(offset + 10, true), entries.length);
  assert.equal(view.getUint32(offset + 12, true), offset - centralOffset);
  assert.equal(view.getUint32(offset + 16, true), centralOffset);
  assert.deepEqual(centralEntries.map((entry) => entry.name), entries.map((entry) => entry.name));
  for (const entry of centralEntries) {
    const local = entries.find((candidate) => candidate.name === entry.name);
    assert.ok(local);
    assert.equal(entry.size, local.data.length);
    assert.equal(entry.checksum, crc32(local.data));
  }
  return entries;
}

test('CRC-32 and local ZIP entries match the public archive contract', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const archive = await createZip([
    { name: 'manifest.json', data: '{"snapshotCount":2}' },
    { name: 'history-001.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  ]);
  assert.equal(archive.type, 'application/zip');
  const entries = readStoredZip(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(entries.map((entry) => entry.name), ['manifest.json', 'history-001.png']);
  assert.equal(new TextDecoder().decode(entries[0].data), '{"snapshotCount":2}');
  assert.deepEqual([...entries[1].data], [0x89, 0x50, 0x4e, 0x47]);
});

test('ZIP writer rejects path traversal and duplicate names', async () => {
  await assert.rejects(
    createZip([{ name: '../private.txt', data: 'secret' }]),
    /unsafe or duplicate filename/,
  );
  await assert.rejects(
    createZip([
      { name: 'same.txt', data: 'one' },
      { name: 'same.txt', data: 'two' },
    ]),
    /unsafe or duplicate filename/,
  );
  await assert.rejects(
    createZip(Array.from({ length: 0x10000 }, (_, index) => ({ name: `entry-${index}.txt`, data: '' }))),
    /ZIP entry limits/,
  );
});

test('batch names are filesystem-safe', () => {
  assert.equal(safeBatchStem('  holiday / raw: 01  '), 'holiday-raw-01');
  assert.equal(safeBatchStem('///'), 'pixelforge-edit');
});

test('batch manifest metadata is normalized and rejects forged fields', () => {
  assert.deepEqual(
    normalizeBatchDocumentMetadata({ title: '  Draft  ', description: ' Notes\r\n', author: ' Faro ' }),
    { title: 'Draft', description: 'Notes', author: 'Faro' },
  );
  assert.throws(
    () => normalizeBatchDocumentMetadata({ title: '', description: '', author: '', gps: 'secret' }),
    /only title, description and author/,
  );
});
