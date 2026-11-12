import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTED_COMPOSITE_MIN_PIXELS,
  PresentedComposite,
  retainPresentedComposite,
} from '../src/presentedComposite.ts';
import {
  COMPOSITE_CACHE_MIN_LAYERS,
  COMPOSITE_SNAPSHOT_DESKTOP,
  COMPOSITE_SNAPSHOT_LOW_MEMORY,
  COMPOSITE_SNAPSHOT_MOBILE,
  compositeEquivalenceKey,
} from '../src/compositeCache.ts';

test('a copy is kept only for large, tall documents on devices with room for one', () => {
  assert.equal(retainPresentedComposite(2646, 4096, 77, COMPOSITE_SNAPSHOT_DESKTOP), true);
  assert.equal(retainPresentedComposite(2646, 4096, 77, COMPOSITE_SNAPSHOT_MOBILE), true);
  assert.equal(retainPresentedComposite(2646, 4096, 77, COMPOSITE_SNAPSHOT_LOW_MEMORY), false, 'low-memory devices keep none');
  assert.equal(retainPresentedComposite(1200, 800, 77, COMPOSITE_SNAPSHOT_DESKTOP), false, 'small documents render fast');
  assert.equal(retainPresentedComposite(2646, 4096, COMPOSITE_CACHE_MIN_LAYERS - 1, COMPOSITE_SNAPSHOT_DESKTOP), false, 'short stacks render fast');
  assert.equal(retainPresentedComposite(2646, 4096, COMPOSITE_CACHE_MIN_LAYERS, COMPOSITE_SNAPSHOT_DESKTOP), true);
  assert.equal(retainPresentedComposite(PRESENTED_COMPOSITE_MIN_PIXELS, 1, 8, COMPOSITE_SNAPSHOT_DESKTOP), true);
  // A frame bigger than the whole budget is not copied.
  assert.equal(retainPresentedComposite(8000, 8000, 77, COMPOSITE_SNAPSHOT_MOBILE), false);
  assert.equal(retainPresentedComposite(NaN, 4096, 77, COMPOSITE_SNAPSHOT_DESKTOP), false);
});

test('the copy matches only its own key and size, and can be reused or cleared', () => {
  const kept = new PresentedComposite();
  assert.equal(kept.match('k', 10, 10), undefined);
  const surface = { id: 1 };
  kept.store('k', 10, 10, surface);
  assert.equal(kept.match('k', 10, 10), surface);
  assert.equal(kept.hits, 1);
  assert.equal(kept.match('other', 10, 10), undefined);
  assert.equal(kept.match('k', 11, 10), undefined);
  assert.equal(kept.match(undefined, 10, 10), undefined);
  assert.equal(kept.reusable(10, 10), surface, 'the next copy draws into the same surface');
  assert.equal(kept.reusable(20, 10), undefined);
  assert.equal(kept.key, 'k');
  kept.clear();
  assert.equal(kept.match('k', 10, 10), undefined);
  assert.equal(kept.key, undefined);
});

test('adding an empty paint layer keeps the composite key, painting on it does not', () => {
  const assets = {
    a: { url: 'data:image/png;base64,AAAA', w: 4, h: 4 },
    empty: { url: 'data:image/png;base64,BBBB', w: 1, h: 1 },
    painted: { url: 'data:image/png;base64,CCCC', w: 4, h: 4 },
  };
  const layer = (id, asset, extra = {}) => ({ id, name: id, kind: 'raster', asset, visible: true, opacity: 1, ...extra });
  const base = { w: 4, h: 4, layers: [layer('bottom', 'a'), layer('top', 'a', { name: 'Top' })] };
  const inert = (item) => item.asset === 'empty';
  const key = (frame) => compositeEquivalenceKey(frame, assets, inert, () => undefined);
  const withEmpty = { ...base, layers: [base.layers[0], layer('new', 'empty'), base.layers[1]] };
  assert.equal(key(withEmpty), key(base), 'empty layer insert is pixel-neutral');
  assert.equal(key({ ...withEmpty, layers: withEmpty.layers.map((item) => item.id === 'top' ? { ...item, name: 'Renamed' } : item) }), key(base));
  const painted = { ...base, layers: [base.layers[0], layer('new', 'painted'), base.layers[1]] };
  assert.notEqual(key(painted), key(base), 'painting changes the key, so the kept copy is not reused');
});
