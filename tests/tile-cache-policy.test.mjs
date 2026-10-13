import test from 'node:test';
import assert from 'node:assert/strict';

const {
  TILE_CACHE_DEFAULT_BYTES,
  TILE_CACHE_MAX_BYTES,
  TILE_CACHE_MIN_BYTES,
  tileCacheBudgetForDevice,
} = await import('../src/tileCachePolicy.ts');

test('tile cache policy keeps low-memory devices at the minimum budget', () => {
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 1, hardwareConcurrency: 2 }), TILE_CACHE_MIN_BYTES);
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 2, hardwareConcurrency: 4 }), TILE_CACHE_MIN_BYTES);
});

test('tile cache policy gives mid-range devices a bounded budget', () => {
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 4, hardwareConcurrency: 4 }), 4 * 1024 * 1024);
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 6, hardwareConcurrency: 4 }), TILE_CACHE_DEFAULT_BYTES);
});

test('tile cache policy raises the budget only for capable desktops', () => {
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 8, hardwareConcurrency: 8 }), TILE_CACHE_MAX_BYTES);
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 16, hardwareConcurrency: 16 }), TILE_CACHE_MAX_BYTES);
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 8, hardwareConcurrency: 4 }), TILE_CACHE_DEFAULT_BYTES);
});

test('mobile devices stay capped even when browser hints are generous', () => {
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: 16, hardwareConcurrency: 16, mobile: true }), 4 * 1024 * 1024);
});

test('unknown or invalid hints use the safe default', () => {
  assert.equal(tileCacheBudgetForDevice(), TILE_CACHE_DEFAULT_BYTES);
  assert.equal(tileCacheBudgetForDevice({ deviceMemory: Number.NaN, hardwareConcurrency: 0 }), TILE_CACHE_DEFAULT_BYTES);
});
