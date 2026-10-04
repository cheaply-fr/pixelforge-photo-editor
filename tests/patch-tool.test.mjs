import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PATCH_MAX_OFFSET,
  applyPatchStroke,
  applyPatchStrokes,
  validPatchStroke,
  validPatchStrokes,
} from '../src/patchTool.ts';
import { prepareDraftForStorage, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const rgba = (width, height, fill = [20, 40, 60, 255]) => {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4)
    output.set(fill, offset);
  return output;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const stroke = (overrides = {}) => ({
  version: 1,
  points: [{ x: 6, y: 5 }],
  size: 5,
  hardness: 100,
  opacity: 1,
  sourceOffset: { x: -5, y: 0 },
  ...overrides,
});

test('patch copies an immutable source neighbourhood and preserves source pixels', () => {
  const width = 12;
  const height = 10;
  const source = rgba(width, height);
  for (let y = 3; y <= 7; y += 1)
    for (let x = 1; x <= 4; x += 1)
      source.set([230, 25, 25, 255], (y * width + x) * 4);
  const original = source.slice();
  const result = applyPatchStrokes(source, width, height, [stroke()]);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(result, width, 6, 5), [230, 25, 25, 255]);
  assert.deepEqual(pixel(result, width, 0, 0), [20, 40, 60, 255]);
});

test('patch follows a destination stroke, clips source edges and keeps alpha unchanged', () => {
  const width = 8;
  const height = 6;
  const source = rgba(width, height);
  for (let y = 1; y <= 4; y += 1)
    for (let x = 0; x <= 2; x += 1)
      source.set([10, 220, 30, 180], (y * width + x) * 4);
  const result = applyPatchStrokes(source, width, height, [
    stroke({
      points: [
        { x: 4, y: 1 },
        { x: 5, y: 3 },
        { x: 7, y: 5 },
      ],
      size: 4,
      hardness: 50,
      opacity: 0.8,
      sourceOffset: { x: -4, y: 0 },
    }),
  ]);
  assert.equal(pixel(result, width, 4, 1)[3], 255);
  assert.equal(pixel(result, width, 5, 3)[3], 255);
  assert.deepEqual(pixel(result, width, 7, 5), [20, 40, 60, 255]);
});

test('patch selection alpha clips writes without changing unselected pixels', () => {
  const width = 9;
  const height = 9;
  const source = rgba(width, height);
  source.set([255, 0, 0, 255], (4 * width + 1) * 4);
  const mask = new Uint8ClampedArray(width * height);
  mask[4 * width + 4] = 255;
  const result = applyPatchStrokes(
    source,
    width,
    height,
    [
      stroke({
        points: [{ x: 4, y: 4 }],
        size: 3,
        sourceOffset: { x: -3, y: 0 },
      }),
    ],
    mask,
  );
  assert.deepEqual(pixel(result, width, 4, 4), [255, 0, 0, 255]);
  assert.deepEqual(pixel(result, width, 3, 4), [20, 40, 60, 255]);
});

test('patch validation rejects malformed, oversized and out-of-bounds metadata', () => {
  assert.equal(validPatchStroke(stroke(), 12, 10), true);
  assert.equal(
    validPatchStrokes([stroke(), stroke({ points: [{ x: 8, y: 8 }] })], 12, 10),
    true,
  );
  assert.equal(validPatchStroke({ ...stroke(), version: 2 }, 12, 10), false);
  assert.equal(validPatchStroke({ ...stroke(), opacity: 2 }, 12, 10), false);
  assert.equal(
    validPatchStroke({ ...stroke(), points: [{ x: 12, y: 2 }] }, 12, 10),
    false,
  );
  assert.equal(
    validPatchStroke(
      { ...stroke(), sourceOffset: { x: -PATCH_MAX_OFFSET - 1, y: 0 } },
      12,
      10,
    ),
    false,
  );
  assert.equal(
    validPatchStrokes(
      Array.from({ length: 65 }, () => stroke()),
      12,
      10,
    ),
    false,
  );
  assert.throws(
    () =>
      applyPatchStroke(
        new Uint8ClampedArray(3),
        new Uint8ClampedArray(4),
        1,
        1,
        stroke(),
      ),
    /RGBA/,
  );
});

test('patch rendering neutralizes hidden RGB and is deterministic', () => {
  const source = rgba(7, 7);
  source.set([255, 0, 255, 0], (3 * 7 + 3) * 4);
  const one = applyPatchStrokes(source, 7, 7, [
    stroke({ points: [{ x: 3, y: 3 }], sourceOffset: { x: 0, y: 0 } }),
  ]);
  const two = applyPatchStrokes(source, 7, 7, [
    stroke({ points: [{ x: 3, y: 3 }], sourceOffset: { x: 0, y: 0 } }),
  ]);
  assert.deepEqual(one, two);
  assert.deepEqual(pixel(one, 7, 3, 3), [0, 0, 0, 0]);
});

test('patch metadata and selected tool survive editable project and draft storage validation', () => {
  const assetId = '11111111-1111-4111-8111-111111111111';
  const layerId = '22222222-2222-4222-8222-222222222222';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const document = {
    version: 2,
    name: 'Patch fixture',
    index: 0,
    settings: {
      tool: 'patch', zoom: 72, color: '#000000', size: 18,
      text: '', fontSize: 56, ...neutral,
    },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: layerId,
      layers: [{
        id: layerId, name: 'Patch layer', visible: true, locked: false,
        opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0],
        adjustments: { ...neutral }, kind: 'raster', asset: assetId,
        patchStrokes: [stroke({ points: [{ x: 0, y: 0 }], sourceOffset: { x: 0, y: 0 } })],
      }],
    }],
  };
  const reopened = validateDraft(JSON.parse(JSON.stringify(prepareDraftForStorage(document))));
  assert.equal(reopened.settings.tool, 'patch');
  assert.deepEqual(reopened.history[0].layers[0].patchStrokes, [stroke({ points: [{ x: 0, y: 0 }], sourceOffset: { x: 0, y: 0 } })]);
  assert.throws(() => validateDraft({
    ...document,
    history: [{ ...document.history[0], layers: [{
      ...document.history[0].layers[0], patchStrokes: [stroke({ version: 9, points: [{ x: 0, y: 0 }], sourceOffset: { x: 0, y: 0 } })],
    }] }],
  }), /Invalid layer document/);
});
