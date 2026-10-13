import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTBOARD_ID,
  MAX_ARTBOARDS,
  MAX_ARTBOARD_LAYERS,
  createArtboard,
  effectiveArtboards,
  sanitizeArtboardLayerMembership,
  setArtboardVisibility,
  transformArtboard,
  validArtboard,
  validArtboards,
} from '../src/artboards.ts';

const frame = { w: 800, h: 600 };
const item = {
  id: 'hero', name: 'Hero', x: 40, y: 60, w: 320, h: 240,
  visible: true, locked: false, background: '#ffffff',
};

test('artboard metadata validates bounded rectangles and unique IDs', () => {
  assert.equal(validArtboard(item, frame.w, frame.h), true);
  assert.equal(validArtboards([item], frame.w, frame.h, 'hero'), true);
  assert.equal(validArtboards([item, { ...item }], frame.w, frame.h), false);
  assert.equal(validArtboard({ ...item, x: 700, w: 200 }, frame.w, frame.h), false);
  assert.equal(validArtboard({ ...item, background: 'rgba(0,0,0,.5)' }, frame.w, frame.h), false);
});

test('artboard collection rejects oversized collections and stale active IDs', () => {
  const many = Array.from({ length: MAX_ARTBOARDS + 1 }, (_, index) => ({
    ...item, id: `a-${index}`, x: 0, y: index, w: 20, h: 20,
  }));
  assert.equal(validArtboards(many, frame.w, frame.h), false);
  assert.equal(validArtboards([item], frame.w, frame.h, 'missing'), false);
  assert.throws(() => createArtboard({ name: 'outside', w: 100, h: 100, x: 780 }, frame.w, frame.h), /invalid/i);
});

test('artboard membership accepts bounded UUIDs and rejects duplicates or unknown IDs', () => {
  const layerId = '00000000-0000-4000-8000-000000000001';
  const otherId = '00000000-0000-4000-8000-000000000002';
  const known = new Set([layerId, otherId]);
  assert.equal(
    validArtboard({ ...item, layerIds: [layerId, otherId] }, frame.w, frame.h, known),
    true,
  );
  assert.equal(
    validArtboard({ ...item, layerIds: [layerId, layerId] }, frame.w, frame.h, known),
    false,
  );
  assert.equal(
    validArtboard({ ...item, layerIds: [layerId, 'missing'] }, frame.w, frame.h, known),
    false,
  );
  assert.equal(
    validArtboard(
      { ...item, layerIds: Array.from({ length: MAX_ARTBOARD_LAYERS + 1 }, () => layerId) },
      frame.w,
      frame.h,
      known,
    ),
    false,
  );
});

test('legacy frames get a virtual locked Canvas viewport without pixel allocations', () => {
  const legacy = effectiveArtboards(frame.w, frame.h);
  assert.equal(legacy.length, 1);
  assert.deepEqual(legacy[0], {
    id: `${ARTBOARD_ID}-canvas`, name: 'Canvas', x: 0, y: 0, w: 800, h: 600,
    visible: true, locked: true,
  });
  const copy = effectiveArtboards(frame.w, frame.h, [item]);
  copy[0].name = 'changed';
  assert.equal(item.name, 'Hero');
});

test('affine geometry moves and clips artboards while preserving identity', () => {
  const moved = transformArtboard(item, [1, 0, 0, 1, 10, 15], frame.w, frame.h);
  assert.deepEqual(moved, { ...item, x: 50, y: 75 });
  const clipped = transformArtboard(item, [1, 0, 0, 1, -100, -100], frame.w, frame.h);
  assert.deepEqual(clipped, { ...item, x: 0, y: 0, w: 260, h: 200 });
  assert.throws(() => transformArtboard(item, [1, 0, 0, 1, -900, 0], frame.w, frame.h), /outside/i);
});

test('destructive layer operations sanitize membership without mutating history', () => {
  const source = [{ ...item, layerIds: [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ] }];
  const next = sanitizeArtboardLayerMembership(source, [
    '00000000-0000-4000-8000-000000000002',
  ]);
  assert.deepEqual(next?.[0].layerIds, ['00000000-0000-4000-8000-000000000002']);
  assert.deepEqual(source[0].layerIds, [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]);
  assert.deepEqual(
    sanitizeArtboardLayerMembership([{ ...item, layerIds: [] }], []).at(0)?.layerIds,
    [],
  );
});

test('artboard visibility updates immutably and keeps one export target visible', () => {
  const source = [
    { ...item, id: 'hero', visible: true },
    { ...item, id: 'social', visible: true, x: 400 },
  ];
  const hidden = setArtboardVisibility(source, 'hero', false);
  assert.deepEqual(hidden.map((artboard) => artboard.visible), [false, true]);
  assert.equal(source[0].visible, true);
  assert.throws(() => setArtboardVisibility(hidden, 'social', false), /at least one/i);
  assert.throws(() => setArtboardVisibility(source, 'missing', false), /does not exist/i);
});
