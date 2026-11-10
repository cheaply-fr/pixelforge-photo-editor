import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADIENT_PREVIEW_MAX_PIXELS,
  downscaleMask,
  maskBounds,
  planGradientPreview,
  toPreviewPoint,
} from '../src/gradientPreview.ts';
import {
  SelectionSnapshotCache,
  maskDigest,
  selectionSnapshotKey,
} from '../src/selectionSnapshotCache.ts';

// ---------------------------------------------------------------------------
// Gradient preview plan

test('small layers keep the exact full-resolution gradient preview', () => {
  assert.equal(planGradientPreview(400, 200), null);
  assert.equal(planGradientPreview(1200, 800), null);
  assert.equal(planGradientPreview(1000, 1500), null); // exactly the budget
});

test('large layers preview within the pixel budget at a uniform scale', () => {
  for (const [width, height] of [[2646, 4096], [5000, 5000], [1501, 1000], [10000, 300]]) {
    const plan = planGradientPreview(width, height);
    assert.ok(plan, `${width}x${height}`);
    assert.deepEqual(plan.rect, { x: 0, y: 0, width, height });
    assert.ok(plan.scale > 0 && plan.scale < 1);
    assert.ok(plan.width * plan.height <= GRADIENT_PREVIEW_MAX_PIXELS * 1.01, `${plan.width}x${plan.height}`);
    // Aspect ratio is kept within a pixel of rounding.
    assert.ok(Math.abs(plan.width / plan.height - width / height) < 0.01 * (width / height) + 1 / plan.height);
  }
  // 10.8 MP drops to about 1/7 of the pixels per preview frame.
  const poster = planGradientPreview(2646, 4096);
  assert.ok(poster.scale < 0.4 && poster.scale > 0.35, String(poster.scale));
});

test('a selection limits the preview region; small selections render at full resolution', () => {
  const small = planGradientPreview(2646, 4096, { x: 100, y: 200, width: 300, height: 400 });
  assert.deepEqual(small, { rect: { x: 100, y: 200, width: 300, height: 400 }, scale: 1, width: 300, height: 400 });
  // Partly outside the layer: clamped.
  const edge = planGradientPreview(1000, 1000, { x: -50, y: 900, width: 200, height: 300 });
  assert.deepEqual(edge.rect, { x: 0, y: 900, width: 150, height: 100 });
  // Empty or fully outside: nothing to preview.
  assert.deepEqual(planGradientPreview(1000, 1000, { x: 0, y: 0, width: 0, height: 0 }).width, 0);
  assert.deepEqual(planGradientPreview(1000, 1000, { x: 2000, y: 0, width: 10, height: 10 }).width, 0);
  // A large selection is scaled into the budget.
  const big = planGradientPreview(4000, 4000, { x: 0, y: 0, width: 3000, height: 3000 });
  assert.ok(big.scale < 1 && big.width * big.height <= GRADIENT_PREVIEW_MAX_PIXELS * 1.01);
  assert.throws(() => planGradientPreview(0, 10), /positive/);
  assert.throws(() => planGradientPreview(10, 10, null, 0), /budget/);
});

test('preview points and masks map consistently into the reduced surface', () => {
  const plan = { rect: { x: 100, y: 50, width: 400, height: 200 }, scale: 0.5, width: 200, height: 100 };
  assert.deepEqual(toPreviewPoint(plan, { x: 100, y: 50 }), { x: 0, y: 0 });
  assert.deepEqual(toPreviewPoint(plan, { x: 500, y: 250 }), { x: 200, y: 100 });
  assert.deepEqual(toPreviewPoint(plan, { x: 300, y: 150 }), { x: 100, y: 50 });
  // A layer mask whose left half of the rect is selected.
  const width = 600, height = 300, mask = new Uint8ClampedArray(width * height);
  for (let y = 50; y < 250; y += 1) for (let x = 100; x < 300; x += 1) mask[y * width + x] = 255;
  const small = downscaleMask(mask, width, plan);
  assert.equal(small.length, 200 * 100);
  assert.equal(small[0], 255);
  assert.equal(small[99], 255);
  assert.equal(small[100], 0);
  assert.equal(small[99 * 200 + 199], 0);
});

test('mask bounds find the covered rectangle', () => {
  const width = 50, height = 40, mask = new Uint8ClampedArray(width * height);
  assert.equal(maskBounds(mask, width, height), null);
  mask[10 * width + 7] = 1;
  mask[30 * width + 44] = 200;
  mask[12 * width + 3] = 255;
  assert.deepEqual(maskBounds(mask, width, height), { x: 3, y: 10, width: 42, height: 21 });
  assert.throws(() => maskBounds(mask, width, height + 1), /match/);
});

// ---------------------------------------------------------------------------
// Selection snapshot reuse

test('equal selection values on the same placement share one key; any change makes a new key', () => {
  const rect = { kind: 'rect', x: 10, y: 20, width: 30, height: 40 };
  const key = selectionSnapshotKey(rect, 'layer', [1, 0, 0, 1, 0, 0], 100, 80);
  // Property order and fresh objects (undo/redo, Reselect) do not matter.
  assert.equal(selectionSnapshotKey({ height: 40, width: 30, y: 20, x: 10, kind: 'rect' }, 'layer', [1, 0, 0, 1, 0, 0], 100, 80), key);
  assert.notEqual(selectionSnapshotKey({ ...rect, x: 11 }, 'layer', [1, 0, 0, 1, 0, 0], 100, 80), key);
  assert.notEqual(selectionSnapshotKey(rect, 'other', [1, 0, 0, 1, 0, 0], 100, 80), key);
  assert.notEqual(selectionSnapshotKey(rect, 'layer', [1, 0, 0, 1, 5, 0], 100, 80), key);
  assert.notEqual(selectionSnapshotKey(rect, 'layer', [1, 0, 0, 1, 0, 0], 101, 80), key);
});

test('mask digests separate different coverage and sizes', () => {
  const a = new Uint8ClampedArray(64 * 32), b = a.slice();
  b[700] = 1;
  assert.equal(maskDigest(a, 64, 32), maskDigest(a.slice(), 64, 32));
  assert.notEqual(maskDigest(a, 64, 32), maskDigest(b, 64, 32));
  assert.notEqual(maskDigest(a, 64, 32), maskDigest(a, 32, 64));
  // Swapped values at two positions change the digest.
  const c = a.slice(), d = a.slice();
  c[1] = 9; c[2] = 3;
  d[1] = 3; d[2] = 9;
  assert.notEqual(maskDigest(c, 64, 32), maskDigest(d, 64, 32));
  assert.throws(() => maskDigest(a, 10, 10), /match/);
});

test('the snapshot cache reuses by key and by digest, drops missing assets and stays bounded', () => {
  const assets = new Set(['m1', 'm2']);
  const present = (id) => assets.has(id);
  const cache = new SelectionSnapshotCache(3);
  assert.equal(cache.lookup('k1', present), undefined);
  cache.remember('k1', 'd1', 'm1');
  assert.equal(cache.lookup('k1', present), 'm1');
  // Same mask from a different selection value.
  assert.equal(cache.lookupDigest('d1', present), 'm1');
  cache.remember('k2', 'd1', 'm1');
  assert.equal(cache.lookup('k2', present), 'm1');
  // An asset purged from the document is never returned.
  assets.delete('m1');
  assert.equal(cache.lookup('k1', present), undefined);
  assert.equal(cache.lookupDigest('d1', present), undefined);
  // LRU bound.
  cache.remember('a', 'da', 'm2');
  cache.remember('b', 'db', 'm2');
  cache.remember('c', 'dc', 'm2');
  cache.remember('d', 'dd', 'm2');
  assert.ok(cache.size <= 3);
  assert.equal(cache.lookup('a', present), undefined);
  assert.equal(cache.lookup('d', present), 'm2');
});
