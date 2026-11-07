import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_MAX_EDGE,
  createReferenceImage,
  referenceObjectFit,
  referenceRect,
  referenceSourcePixel,
  referenceStoredSize,
  validReferenceImage,
} from '../src/referenceImage.ts';

const ID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const assets = { [ID]: { w: 400, h: 200 } };

test('new references start visible, unlocked, contain-fitted at half opacity', () => {
  const reference = createReferenceImage(ID, 'sketch.png');
  assert.deepEqual(reference, {
    asset: ID,
    name: 'sketch.png',
    opacity: 0.5,
    visible: true,
    locked: false,
    fit: 'contain',
    sample: false,
  });
  assert.equal(validReferenceImage(reference, assets), true);
  assert.equal(createReferenceImage(ID, '').name, 'Reference');
  assert.equal(createReferenceImage(ID, 'x'.repeat(400)).name.length, 160);
});

test('validation rejects malformed or unknown reference metadata', () => {
  const good = createReferenceImage(ID, 'ref');
  const bad = [
    null,
    [],
    { ...good, asset: 'not-a-uuid' },
    { ...good, asset: '11111111-2222-4333-8444-555555555555' },
    { ...good, opacity: 1.5 },
    { ...good, opacity: -0.1 },
    { ...good, opacity: Number.NaN },
    { ...good, visible: 'yes' },
    { ...good, locked: 1 },
    { ...good, sample: undefined },
    { ...good, fit: 'tile' },
    { ...good, name: 'x'.repeat(161) },
    { ...good, extra: true },
  ];
  for (const value of bad) assert.equal(validReferenceImage(value, assets), false, JSON.stringify(value));
  assert.equal(
    validReferenceImage(good, { [ID]: { w: REFERENCE_MAX_EDGE + 1, h: 10 } }),
    false,
    'oversized reference assets are rejected',
  );
});

test('stored size is downscaled to the longest-edge cap and never upscaled', () => {
  assert.deepEqual(referenceStoredSize(4096, 2646), { w: 2048, h: 1323 });
  assert.deepEqual(referenceStoredSize(2646, 4096), { w: 1323, h: 2048 });
  assert.deepEqual(referenceStoredSize(800, 600), { w: 800, h: 600 });
  assert.deepEqual(referenceStoredSize(100000, 1, 2048), { w: 2048, h: 1 });
  assert.throws(() => referenceStoredSize(0, 10));
});

test('fit rectangles match CSS object-fit placement', () => {
  // 400×200 source in a 200×200 canvas.
  assert.deepEqual(referenceRect('contain', 200, 200, 400, 200), { x: 0, y: 50, w: 200, h: 100 });
  assert.deepEqual(referenceRect('cover', 200, 200, 400, 200), { x: -100, y: 0, w: 400, h: 200 });
  assert.deepEqual(referenceRect('stretch', 200, 200, 400, 200), { x: 0, y: 0, w: 200, h: 200 });
  assert.equal(referenceObjectFit('contain'), 'contain');
  assert.equal(referenceObjectFit('cover'), 'cover');
  assert.equal(referenceObjectFit('stretch'), 'fill');
});

test('document points map to reference pixels for each fit', () => {
  // Contain: letterbox rows return null, inside maps proportionally.
  assert.equal(referenceSourcePixel('contain', 200, 200, 400, 200, 100, 10), null);
  assert.deepEqual(referenceSourcePixel('contain', 200, 200, 400, 200, 0, 50), { x: 0, y: 0 });
  assert.deepEqual(referenceSourcePixel('contain', 200, 200, 400, 200, 199.9, 149.9), { x: 399, y: 199 });
  assert.equal(referenceSourcePixel('contain', 200, 200, 400, 200, 100, 150), null);
  // Cover: the canvas centre column is the source centre column.
  assert.deepEqual(referenceSourcePixel('cover', 200, 200, 400, 200, 100, 100), { x: 200, y: 100 });
  assert.deepEqual(referenceSourcePixel('cover', 200, 200, 400, 200, 0, 0), { x: 100, y: 0 });
  // Stretch.
  assert.deepEqual(referenceSourcePixel('stretch', 200, 200, 400, 200, 100, 100), { x: 200, y: 100 });
  // Off canvas.
  assert.equal(referenceSourcePixel('stretch', 200, 200, 400, 200, -1, 5), null);
  assert.equal(referenceSourcePixel('stretch', 200, 200, 400, 200, 200, 5), null);
});

test('frames validate a reference, keep its asset, and exclude it from the pixel budget', async () => {
  const { commonLayer, neutral, validateFrame, referencedAssets, layerPixelUsage } = await import('../src/document.ts');
  const layer = { ...commonLayer('Levels'), kind: 'adjustment', adjustments: { ...neutral } };
  const refAsset = { url: 'data:image/png;base64,AAAA', w: 400, h: 200 };
  const frame = { w: 8, h: 8, layers: [layer], active: layer.id, reference: createReferenceImage(ID, 'guide.png') };
  assert.doesNotThrow(() => validateFrame(frame, { [ID]: refAsset }));
  assert.deepEqual(Object.keys(referencedAssets([frame], { [ID]: refAsset, other: refAsset })), [ID]);
  assert.equal(layerPixelUsage(frame, { [ID]: refAsset }), 0);
  // Legacy frames without a reference still validate.
  const { reference: _omit, ...legacy } = frame;
  assert.doesNotThrow(() => validateFrame(legacy, {}));
  // Missing asset, malformed fields and nested smart-object references fail closed.
  assert.throws(() => validateFrame(frame, {}), /Invalid layer document/);
  assert.throws(() => validateFrame({ ...frame, reference: { ...frame.reference, opacity: 2 } }, { [ID]: refAsset }), /Invalid layer document/);
  assert.throws(() => validateFrame(frame, { [ID]: refAsset }, 1), /Invalid layer document/);
});