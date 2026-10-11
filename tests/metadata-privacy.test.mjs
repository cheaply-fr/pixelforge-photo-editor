import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DOCUMENT_METADATA,
  effectiveDocumentMetadata,
  validDocumentMetadata,
  normalizeDocumentMetadata,
} from '../src/metadata.ts';
import { neutral } from '../src/document.ts';
import { CURRENT_DRAFT_VERSION, stripPrivateMetadata, validateDraft } from '../src/drafts.ts';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '11111111-1111-4111-8111-111111111111';
const layerId = '22222222-2222-4222-8222-222222222222';
const base = (metadata) => ({
  version: CURRENT_DRAFT_VERSION,
  name: 'Metadata fixture',
  index: 0,
  metadata,
  settings: {
    tool: 'move',
    zoom: 72,
    color: '#000000',
    size: 18,
    text: '',
    fontSize: 56,
    ...neutral,
  },
  assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
  history: [{
    w: 1,
    h: 1,
    active: layerId,
    layers: [{
      id: layerId,
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      matrix: [1, 0, 0, 1, 0, 0],
      adjustments: { ...neutral },
      kind: 'raster',
      asset: assetId,
    }],
  }],
});

test('document metadata validates bounded printable fields and defaults safely', () => {
  assert.equal(validDocumentMetadata(DEFAULT_DOCUMENT_METADATA), true);
  assert.deepEqual(effectiveDocumentMetadata(undefined), DEFAULT_DOCUMENT_METADATA);
  const metadata = { title: '  Coastline  ', description: 'A local draft', author: 'Ada' };
  assert.deepEqual(effectiveDocumentMetadata(metadata), { ...metadata, title: 'Coastline' });
  assert.equal(validDocumentMetadata({ ...metadata, title: 'bad\nvalue' }), false);
  assert.equal(validDocumentMetadata({ ...metadata, description: 'x'.repeat(2001) }), false);
  assert.equal(validDocumentMetadata({ ...metadata, author: 3 }), false);
});

test('description line endings normalize at the privacy boundary', () => {
  assert.deepEqual(normalizeDocumentMetadata({ title: '', description: 'line 1\r\nline 2', author: '' }), {
    title: '', description: 'line 1\nline 2', author: '',
  });
});

test('metadata and export privacy survive validated project JSON round trip', () => {
  const source = base({ title: 'Sea', description: 'Local only', author: 'Faro' });
  const reopened = validateDraft(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(reopened.metadata, source.metadata);
  assert.throws(
    () => validateDraft({ ...source, metadata: { ...source.metadata, title: 'x\u0000y' } }),
    /Invalid document metadata/,
  );
  assert.throws(() => normalizeDocumentMetadata({ ...source.metadata, extra: 'reject' }), /only title, description and author/);
});

test('private cloud envelopes strip local File Info before transport', () => {
  const source = base({ title: 'Never upload', description: 'Local only', author: 'PixelForge' });
  const cloud = stripPrivateMetadata(source);
  assert.equal('metadata' in cloud, false);
  assert.equal(cloud.name, source.name);
  assert.equal(cloud.history.length, source.history.length);
});
