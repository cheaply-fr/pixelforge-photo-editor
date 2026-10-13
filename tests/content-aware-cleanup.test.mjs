import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_AWARE_MAX_OPERATIONS,
  CONTENT_AWARE_MAX_RADIUS,
  applyContentAwareFill,
  applyContentAwareFills,
  validContentAwareFill,
  validContentAwareFills,
} from '../src/contentAwareCleanup.ts';
import { neutral } from '../src/document.ts';
import { prepareDraftForStorage, validateDraft } from '../src/drafts.ts';

const rgba = (width, height, fill = [80, 120, 160, 255]) => {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) output.set(fill, offset);
  return output;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const fill = (overrides = {}) => ({
  version: 1,
  mask: 'mask-1',
  radius: 4,
  opacity: 1,
  ...overrides,
});

test('fills a small masked blemish from nearby context without mutating source', () => {
  const width = 11, height = 11, source = rgba(width, height);
  for (let y = 4; y <= 6; y += 1)
    for (let x = 4; x <= 6; x += 1)
      source.set([240, 25, 25, 255], (y * width + x) * 4);
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 4; y <= 6; y += 1)
    for (let x = 4; x <= 6; x += 1) mask[y * width + x] = 255;
  const before = source.slice();
  const result = applyContentAwareFills(source, width, height, [fill()], { 'mask-1': mask });
  assert.deepEqual(source, before);
  assert.deepEqual(pixel(result, width, 5, 5), [80, 120, 160, 255]);
  assert.deepEqual(pixel(result, width, 0, 0), [80, 120, 160, 255]);
});

test('feathered mask and opacity blend RGB only while preserving alpha', () => {
  const width = 7, height = 7, source = rgba(width, height);
  source.set([220, 30, 40, 150], (3 * width + 3) * 4);
  const mask = new Uint8ClampedArray(width * height);
  mask[3 * width + 3] = 128;
  const result = new Uint8ClampedArray(source);
  applyContentAwareFill(result, source, width, height, mask, fill({ opacity: 0.5 }));
  const center = pixel(result, width, 3, 3);
  assert.equal(center[3], 150);
  assert.ok(center[0] < 220 && center[0] > 80);
});

test('unselected pixels and transparent RGB stay source-safe', () => {
  const width = 5, height = 5, source = rgba(width, height);
  source.set([255, 0, 255, 0], (2 * width + 2) * 4);
  const mask = new Uint8ClampedArray(width * height);
  mask[2 * width + 2] = 255;
  const output = applyContentAwareFills(source, width, height, [fill()], { 'mask-1': mask });
  assert.deepEqual(pixel(output, width, 0, 0), pixel(source, width, 0, 0));
  assert.deepEqual(pixel(output, width, 2, 2), [0, 0, 0, 0]);
});

test('large selections without local context safely become a no-op', () => {
  const width = 9, height = 9, source = rgba(width, height), mask = new Uint8ClampedArray(width * height);
  mask.fill(255);
  const output = applyContentAwareFills(source, width, height, [fill({ radius: 8 })], { 'mask-1': mask });
  assert.deepEqual(output, source);
});

test('multiple operations replay deterministically and reject missing masks', () => {
  const width = 4, height = 4, source = rgba(width, height), mask = new Uint8ClampedArray(width * height);
  mask[width + 1] = 255;
  const options = [fill({ radius: 2 }), fill({ radius: 3, opacity: 0.5 })];
  const one = applyContentAwareFills(source, width, height, options, { 'mask-1': mask });
  const two = applyContentAwareFills(source, width, height, options, { 'mask-1': mask });
  assert.deepEqual(one, two);
  assert.throws(() => applyContentAwareFills(source, width, height, [fill({ mask: 'missing' })], { 'mask-1': mask }), /mask is unavailable/);
});

test('metadata validation bounds identifiers, radius, opacity and count', () => {
  assert.equal(validContentAwareFill(fill()), true);
  assert.equal(validContentAwareFills([fill(), fill({ radius: CONTENT_AWARE_MAX_RADIUS })]), true);
  assert.equal(validContentAwareFill(fill({ version: 2 })), false);
  assert.equal(validContentAwareFill(fill({ mask: 'bad mask' })), false);
  assert.equal(validContentAwareFill(fill({ radius: CONTENT_AWARE_MAX_RADIUS + 1 })), false);
  assert.equal(validContentAwareFill(fill({ opacity: 2 })), false);
  assert.equal(validContentAwareFills(Array.from({ length: CONTENT_AWARE_MAX_OPERATIONS + 1 }, () => fill())), false);
});

test('content-aware mask references survive draft validation and malformed assets fail closed', () => {
  const assetId = '11111111-1111-4111-8111-111111111111';
  const maskId = '22222222-2222-4222-8222-222222222222';
  const layerId = '33333333-3333-4333-8333-333333333333';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const document = {
    version: 2,
    name: 'Content-aware fixture',
    index: 0,
    settings: { tool: 'select', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
    assets: {
      [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 },
      [maskId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 },
    },
    history: [{
      w: 1,
      h: 1,
      active: layerId,
      layers: [{
        id: layerId,
        name: 'Cleanup layer',
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        matrix: [1, 0, 0, 1, 0, 0],
        adjustments: { ...neutral },
        kind: 'raster',
        asset: assetId,
        contentAwareFills: [fill({ mask: maskId })],
        contentAwareMoves: [{ version: 1, mask: maskId, dx: 1, dy: 0, radius: 2, opacity: 1 }],
        contentAwareScales: [{ version: 1, mask: maskId, scaleX: 1.2, scaleY: 0.9, radius: 2, opacity: 1 }],
      }],
    }],
  };
  const reopened = validateDraft(JSON.parse(JSON.stringify(prepareDraftForStorage(document))));
  assert.deepEqual(reopened.history[0].layers[0].contentAwareFills, [fill({ mask: maskId })]);
  assert.deepEqual(reopened.history[0].layers[0].contentAwareMoves, document.history[0].layers[0].contentAwareMoves);
  assert.deepEqual(reopened.history[0].layers[0].contentAwareScales, document.history[0].layers[0].contentAwareScales);
  assert.throws(() => validateDraft({
    ...document,
    assets: { [assetId]: document.assets[assetId] },
  }), /Invalid layer document/);
});
