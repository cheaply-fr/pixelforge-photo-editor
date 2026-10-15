import test from 'node:test';
import assert from 'node:assert/strict';
import { isGradientStops, normalizeGradientStops, MAX_GRADIENT_STOPS } from '../src/gradientStops.ts';

test('gradient stops validate ordering, bounds, and palette size', () => {
  assert.equal(isGradientStops([{ position: 20, color: '#00ff00' }, { position: 80, color: '#0000ff' }]), true);
  assert.equal(isGradientStops([{ position: 80, color: '#0000ff' }, { position: 20, color: '#00ff00' }]), false);
  assert.equal(isGradientStops([{ position: 0, color: '#00ff00' }]), false);
  assert.equal(isGradientStops([{ position: 20, color: '#fff' }]), false);
  assert.equal(isGradientStops(Array.from({ length: MAX_GRADIENT_STOPS + 1 }, (_, index) => ({
    position: index + 1,
    color: '#ffffff',
  }))), false);
});

test('gradient stop normalization is detached, sorted, lower-case, and duplicate-safe', () => {
  const source = [
    { position: 70, color: '#ABCDEF' },
    { position: 30, color: '#123456' },
    { position: 30, color: '#ffffff' },
  ];
  const normalized = normalizeGradientStops(source);
  assert.deepEqual(normalized, [
    { position: 30, color: '#123456' },
    { position: 70, color: '#abcdef' },
  ]);
  assert.notEqual(normalized, source);
});

