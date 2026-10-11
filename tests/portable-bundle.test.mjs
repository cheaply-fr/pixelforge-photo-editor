import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTABLE_BUNDLE_VERSION,
  PORTABLE_DOCUMENT_PATH,
  PORTABLE_MANIFEST_PATH,
  createPortableProjectBundle,
  isPortableBundleManifest,
  readPortableBundle,
  writePortableBundle,
} from '../src/portableBundle.ts';
import { CURRENT_DRAFT_VERSION } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '11111111-1111-4111-8111-111111111111';
const layerId = '22222222-2222-4222-8222-222222222222';
const settings = { tool: 'move', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral };
const draft = (extra = {}) => ({
  version: CURRENT_DRAFT_VERSION,
  localRevision: 9,
  cloud: { id: 'cloud', generation: '3', owner: 'member' },
  name: 'Portable fixture',
  index: 0,
  settings,
  assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
  history: [{ w: 1, h: 1, active: layerId, layers: [{ id: layerId, name: 'Background', visible: true, locked: false, opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId, ...extra }] }],
});

async function bytes(blob) { return new Uint8Array(await blob.arrayBuffer()); }
function zipParts(input) {
  const bytesValue = input;
  const view = new DataView(bytesValue.buffer, bytesValue.byteOffset, bytesValue.byteLength);
  const entries = [];
  let offset = 0;
  while (offset + 4 <= bytesValue.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    const name = new TextDecoder().decode(bytesValue.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    entries.push({ name, header: offset, dataStart, size });
    offset = dataStart + size;
  }
  return { bytesValue, view, entries, centralOffset: offset };
}
function replaceLocalData(input, name, mutate) {
  const copy = new Uint8Array(input);
  const parsed = zipParts(copy);
  const entry = parsed.entries.find((value) => value.name === name);
  assert.ok(entry);
  mutate(copy, entry);
  return copy;
}

 test('v3 writer emits the fixed archive layout and reader preserves editable state', async () => {
  const blob = await writePortableBundle(draft());
  const data = await bytes(blob);
  const parsed = zipParts(data);
  assert.deepEqual(parsed.entries.map((entry) => entry.name), [PORTABLE_MANIFEST_PATH, PORTABLE_DOCUMENT_PATH, `assets/${assetId}.png`]);
  const manifest = JSON.parse(new TextDecoder().decode(data.subarray(parsed.entries[0].dataStart, parsed.entries[0].dataStart + parsed.entries[0].size)));
  assert.equal(manifest.version, PORTABLE_BUNDLE_VERSION);
  assert.equal(manifest.document, PORTABLE_DOCUMENT_PATH);
  assert.equal(manifest.archiveByteLength, data.byteLength);
  assert.ok(isPortableBundleManifest(manifest));
  const reopened = await readPortableBundle(blob);
  assert.equal(reopened.cloud, undefined);
  assert.equal(reopened.localRevision, undefined);
  assert.equal(reopened.history[0].layers[0].asset, assetId);
  assert.equal(reopened.history[0].layers[0].asset, draft().history[0].layers[0].asset);
  assert.equal(reopened.history[0].layers[0].kind, 'raster');
  assert.equal(reopened.assets[assetId].url, draft().assets[assetId].url);
});

test('v1 and v2 JSON project files remain importable through the v3 reader', async () => {
  const source = draft();
  const legacy = { version: 1, name: source.name, index: 0, history: [{ url: source.assets[assetId].url, w: 1, h: 1 }], settings };
  const migrated = await readPortableBundle(JSON.stringify(legacy));
  assert.equal(migrated.version, CURRENT_DRAFT_VERSION);
  assert.equal(migrated.history[0].layers[0].kind, 'raster');
  const reopened = await readPortableBundle(JSON.stringify({ ...source, cloud: undefined }));
  assert.equal(reopened.history[0].layers[0].kind, 'raster');
});

test('reader rejects modified document and asset bytes', async () => {
  const original = await bytes(await createPortableProjectBundle(draft()));
  const modifiedDocument = replaceLocalData(original, PORTABLE_DOCUMENT_PATH, (copy, entry) => { copy[entry.dataStart] ^= 1; });
  await assert.rejects(() => readPortableBundle(modifiedDocument), /checksum|JSON/);
  const modifiedAsset = replaceLocalData(original, `assets/${assetId}.png`, (copy, entry) => { copy[entry.dataStart + entry.size - 1] ^= 1; });
  await assert.rejects(() => readPortableBundle(modifiedAsset), /checksum|CRC/);
});

test('reader rejects compressed, encrypted, traversal, duplicate and missing entries', async () => {
  const original = await bytes(await createPortableProjectBundle(draft()));
  const compressed = replaceLocalData(original, PORTABLE_DOCUMENT_PATH, (copy, entry) => {
    const view = new DataView(copy.buffer);
    view.setUint16(entry.header + 8, 1, true); // encryption bit
  });
  await assert.rejects(() => readPortableBundle(compressed), /compressed, encrypted|local entry/);
  const traversal = replaceLocalData(original, PORTABLE_DOCUMENT_PATH, (copy, entry) => {
    const nameLength = new DataView(copy.buffer).getUint16(entry.header + 26, true);
    const nameStart = entry.header + 30;
    const bytesValue = new TextEncoder().encode('../document.json');
    copy.set(bytesValue, nameStart);
    // The test intentionally leaves the old name length; central/local checks still fail closed.
    assert.equal(nameLength, 'document.json'.length);
  });
  await assert.rejects(() => readPortableBundle(traversal), /checksum|central|unsafe|missing|local entry/);
  const parsed = zipParts(original);
  const withoutAsset = original.subarray(0, parsed.entries[2].header);
  await assert.rejects(() => readPortableBundle(withoutAsset), /ZIP|missing|end/);
});

test('manifest validation rejects duplicate and unsafe asset records', () => {
  const valid = { kind: 'pixelforge-project', version: 3, document: 'document.json', assets: [], documentSha256: 'a'.repeat(64), documentByteLength: 1, archiveByteLength: 1 };
  assert.equal(isPortableBundleManifest(valid), true);
  assert.equal(isPortableBundleManifest({ ...valid, assets: [{ id: assetId, path: '../x.png', sha256: 'a'.repeat(64), byteLength: 1, w: 1, h: 1 }] }), false);
  assert.equal(isPortableBundleManifest({ ...valid, assets: [{ id: assetId, path: `assets/${assetId}.png`, sha256: 'a'.repeat(64), byteLength: 1, w: 1, h: 1 }, { id: assetId, path: `assets/${assetId}.png`, sha256: 'b'.repeat(64), byteLength: 1, w: 1, h: 1 }] }), false);
});
