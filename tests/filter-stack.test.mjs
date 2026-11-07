import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSmartFilter,
  effectiveSmartFilters,
  moveSmartFilter,
  normalizeSmartFilterStack,
  removeSmartFilter,
  setSmartFilterEnabled,
  smartFilterEntries,
  validSmartFilters,
} from '../src/smartFilters.ts';
import { layerFilterCacheKey } from '../src/layerFilterCache.ts';
import { applyFilterEffectsPixels } from '../src/filterEffects.ts';

const effect = (type, extra = {}) => ({
  type, amount: 80, radius: 4, angle: 0, centerX: 0.5, centerY: 0.5, seed: 2, ...extra,
});
const types = (stack) => stack.map((item) => item.type);

test('stack entries keep a hidden flag that never renders', () => {
  const stack = [effect('mosaic'), { ...effect('wind'), enabled: false }, effect('gaussian-blur')];
  assert.equal(validSmartFilters(stack), true);
  assert.deepEqual(types(effectiveSmartFilters(stack)), ['mosaic', 'gaussian-blur']);
  assert.deepEqual(
    smartFilterEntries(stack).map(({ effect: item, enabled }) => [item.type, enabled]),
    [['mosaic', true], ['wind', false], ['gaussian-blur', true]],
  );
  // The UI entry exposes a plain effect, never the storage flag.
  assert.equal('enabled' in smartFilterEntries(stack)[1].effect, false);
});

test('stacks written before toggling existed load unchanged', () => {
  const legacy = [effect('mosaic'), effect('wind')];
  assert.equal(validSmartFilters(legacy), true);
  assert.deepEqual(types(effectiveSmartFilters(legacy)), ['mosaic', 'wind']);
  assert.deepEqual(normalizeSmartFilterStack(legacy), effectiveSmartFilters(legacy));
  assert.equal(normalizeSmartFilterStack(legacy).some((item) => 'enabled' in item), false);
});

test('validation rejects a non-boolean enabled flag and malformed entries', () => {
  assert.equal(validSmartFilters([{ ...effect('mosaic'), enabled: 'no' }]), false);
  assert.equal(validSmartFilters([{ ...effect('mosaic'), enabled: true }]), true);
  assert.equal(validSmartFilters([{ type: 'nope' }]), false);
  assert.equal(validSmartFilters('mosaic'), false);
});

test('toggle, reorder and remove are immutable and keep other entries intact', () => {
  const stack = [effect('mosaic'), effect('wind'), effect('gaussian-blur')];
  const frozen = structuredClone(stack);

  const hidden = setSmartFilterEnabled(stack, 1, false);
  assert.equal(hidden[1].enabled, false);
  assert.deepEqual(types(effectiveSmartFilters(hidden)), ['mosaic', 'gaussian-blur']);
  const shown = setSmartFilterEnabled(hidden, 1, true);
  assert.equal('enabled' in shown[1], false);
  assert.deepEqual(shown, normalizeSmartFilterStack(stack));

  assert.deepEqual(types(moveSmartFilter(stack, 0, 1)), ['wind', 'mosaic', 'gaussian-blur']);
  assert.deepEqual(types(moveSmartFilter(stack, 2, -1)), ['mosaic', 'gaussian-blur', 'wind']);
  assert.deepEqual(types(moveSmartFilter(stack, 0, -1)), ['mosaic', 'wind', 'gaussian-blur']);
  assert.deepEqual(types(moveSmartFilter(stack, 2, 1)), ['mosaic', 'wind', 'gaussian-blur']);
  // A hidden entry carries its flag when moved.
  const movedHidden = moveSmartFilter(hidden, 1, 1);
  assert.deepEqual(types(movedHidden), ['mosaic', 'gaussian-blur', 'wind']);
  assert.equal(movedHidden[2].enabled, false);

  assert.deepEqual(types(removeSmartFilter(stack, 1)), ['mosaic', 'gaussian-blur']);
  assert.throws(() => removeSmartFilter(stack, 3), RangeError);
  assert.throws(() => setSmartFilterEnabled(stack, -1, true), RangeError);
  assert.throws(() => moveSmartFilter(stack, 1.5, 1), RangeError);
  assert.deepEqual(stack, frozen);
});

test('appending keeps hidden entries and never stores a flag on the new one', () => {
  const stack = setSmartFilterEnabled([effect('mosaic')], 0, false);
  const next = appendSmartFilter(stack, { ...effect('wind'), enabled: false });
  assert.deepEqual(types(next), ['mosaic', 'wind']);
  assert.equal(next[0].enabled, false);
  assert.equal('enabled' in next[1], false);
});

test('the layer cache key follows only the enabled filters, in order', () => {
  const asset = 'asset-1';
  const assets = { [asset]: { url: 'data:image/png;base64,AAAA', w: 4, h: 4 } };
  const layer = (smartFilters) => ({ kind: 'raster', asset, smartFilters, adjustments: {} });
  const ab = layerFilterCacheKey(layer([effect('mosaic'), effect('wind')]), assets);
  const ba = layerFilterCacheKey(layer([effect('wind'), effect('mosaic')]), assets);
  const aHidden = layerFilterCacheKey(layer([effect('mosaic'), { ...effect('wind'), enabled: false }]), assets);
  const a = layerFilterCacheKey(layer([effect('mosaic')]), assets);
  assert.ok(ab && ba && a);
  assert.notEqual(ab, ba);
  assert.equal(aHidden, a);
  // Every entry hidden: nothing expensive to cache.
  assert.equal(layerFilterCacheKey(layer([{ ...effect('mosaic'), enabled: false }]), assets), undefined);
});

test('stack order changes rendered pixels deterministically', () => {
  const width = 12;
  const height = 8;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < source.length; index += 4)
    source.set([(index * 7) & 255, (index * 3) & 255, (index * 11) & 255, 255], index);
  const run = (stack) =>
    effectiveSmartFilters(stack).reduce(
      (pixels, item) => applyFilterEffectsPixels(pixels, width, height, item),
      source,
    );
  const forward = run([effect('mosaic'), effect('emboss', { amount: 100, radius: 2 })]);
  const sameAgain = run([effect('mosaic'), effect('emboss', { amount: 100, radius: 2 })]);
  const hiddenSecond = run([effect('mosaic'), { ...effect('emboss', { amount: 100, radius: 2 }), enabled: false }]);
  assert.deepEqual(forward, sameAgain);
  assert.deepEqual(hiddenSecond, run([effect('mosaic')]));
  assert.notDeepEqual(forward, hiddenSecond);
});
