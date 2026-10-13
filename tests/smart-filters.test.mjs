import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSmartFilter, effectiveSmartFilters, SMART_FILTER_MAX, validSmartFilters } from '../src/smartFilters.ts';

const effect = (type = 'mosaic') => ({ type, amount: 80, radius: 4, angle: 0, centerX: 0.5, centerY: 0.5, seed: 2 });

test('smart filter stacks normalize and preserve order through bounded round trips', () => {
  const stack = effectiveSmartFilters([effect('mosaic'), effect('gaussian-blur')]);
  assert.deepEqual(stack.map((item) => item.type), ['mosaic', 'gaussian-blur']);
  assert.equal(validSmartFilters(stack), true);
  assert.deepEqual(JSON.parse(JSON.stringify(stack)), stack);
});

test('smart filter append is immutable and bounded', () => {
  const first = [effect('mosaic')];
  const next = appendSmartFilter(first, effect('wind'));
  assert.equal(first.length, 1);
  assert.deepEqual(next.map((item) => item.type), ['mosaic', 'wind']);
  assert.throws(() => appendSmartFilter(Array.from({ length: SMART_FILTER_MAX }, () => effect()), effect()), /limited/);
  assert.throws(() => appendSmartFilter(undefined, { type: 'not-a-filter' }), /invalid/);
});

test('smart filter validation rejects malformed or oversized stacks', () => {
  assert.equal(validSmartFilters([]), true);
  assert.equal(validSmartFilters([effect(), { type: 'none' }]), false);
  assert.equal(validSmartFilters(Array.from({ length: SMART_FILTER_MAX + 1 }, () => effect())), false);
});
