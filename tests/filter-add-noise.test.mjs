import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const source = new Uint8ClampedArray([
  40, 80, 120, 255,
  90, 120, 150, 255,
  200, 30, 70, 255,
  1, 2, 3, 0,
]);

test('Add Noise is deterministic, bounded and source-safe', () => {
  const settings = { type: 'add-noise', amount: 35, seed: 42, noiseMonochromatic: false };
  const first = applyFilterEffectsPixels(source, 2, 2, settings);
  const second = applyFilterEffectsPixels(source, 2, 2, settings);
  assert.deepEqual(first, second);
  assert.deepEqual(source, new Uint8ClampedArray([
    40, 80, 120, 255,
    90, 120, 150, 255,
    200, 30, 70, 255,
    1, 2, 3, 0,
  ]));
  assert.deepEqual(Array.from(first.slice(12)), [1, 2, 3, 0]);
  assert.notDeepEqual(Array.from(first.slice(0, 12)), Array.from(source.slice(0, 12)));
  assert.equal(validFilterEffects(effectiveFilterEffects(settings)), true);
});

test('Add Noise amount zero is identity and monochromatic channels share a delta', () => {
  const identity = applyFilterEffectsPixels(source, 2, 2, { type: 'add-noise', amount: 0, seed: 7 });
  assert.deepEqual(identity, source);
  const mono = applyFilterEffectsPixels(new Uint8ClampedArray([120, 120, 120, 255]), 1, 1, {
    type: 'add-noise', amount: 25, seed: 9, noiseMonochromatic: true,
  });
  assert.equal(mono[0], mono[1]);
  assert.equal(mono[1], mono[2]);
});

test('Add Noise normalization clamps seed and rejects malformed metadata', () => {
  const normalized = effectiveFilterEffects({ type: 'add-noise', amount: 130, seed: -1, noiseMonochromatic: 'yes', noiseDistribution: 'gaussian' });
  assert.equal(normalized.amount, 100);
  assert.equal(normalized.seed, 0xffffffff);
  assert.equal(normalized.noiseMonochromatic, false);
  assert.equal(normalized.noiseDistribution, 'gaussian');
  assert.equal(validFilterEffects({ ...normalized, amount: -1 }), false);
});

test('Add Noise distribution changes the deterministic bounded result', () => {
  const uniform = applyFilterEffectsPixels(source, 2, 2, { type: 'add-noise', amount: 35, seed: 42, noiseDistribution: 'uniform' });
  const gaussian = applyFilterEffectsPixels(source, 2, 2, { type: 'add-noise', amount: 35, seed: 42, noiseDistribution: 'gaussian' });
  assert.notDeepEqual(gaussian, uniform);
  assert.deepEqual(gaussian.slice(12), source.slice(12));
  assert.deepEqual(gaussian, applyFilterEffectsPixels(source, 2, 2, { type: 'add-noise', amount: 35, seed: 42, noiseDistribution: 'gaussian' }));
});
