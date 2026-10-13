import test from 'node:test';
import assert from 'node:assert/strict';
import { filterActionParameters } from '../src/filterActionParameters.ts';

test('filter Action parameters capture normalized editable controls without source data', () => {
  assert.deepEqual(filterActionParameters({
    type: 'add-noise', amount: 42, radius: 7, angle: -12,
    centerX: 0.2, centerY: 0.8, seed: 4294967295,
    noiseMonochromatic: true, noiseDistribution: 'gaussian',
  }), {
    amount: 42, radius: 7, angle: -12, centerX: 0.2, centerY: 0.8,
    seed: 4294967295, threshold: 25, noiseMonochromatic: true,
    noiseDistribution: 'gaussian',
  });
});

test('filter Action parameters fail closed to bounded defaults', () => {
  assert.deepEqual(filterActionParameters({ type: 'gaussian-blur', amount: Infinity, radius: -5, seed: -2 }), {
    amount: 0, radius: 0, angle: 0, centerX: 0.5, centerY: 0.5,
    seed: 4294967294, threshold: 25, noiseMonochromatic: false, noiseDistribution: 'uniform',
  });
});

test('filter Action parameters retain effect-specific thresholds', () => {
  assert.equal(filterActionParameters({ type: 'dust-scratches', threshold: 9 }).threshold, 9);
  assert.equal(filterActionParameters({ type: 'reduce-noise', threshold: 999 }).threshold, 255);
});
