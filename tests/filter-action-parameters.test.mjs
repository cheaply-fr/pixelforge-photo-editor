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
    noiseDistribution: 'gaussian', gradientShadow: '#000000',
    gradientHighlight: '#ffffff', gradientBlend: 'normal', gradientStops: '[]', filterExtra: '{}',
  });
});

test('filter Action parameters fail closed to bounded defaults', () => {
  assert.deepEqual(filterActionParameters({ type: 'gaussian-blur', amount: Infinity, radius: -5, seed: -2 }), {
    amount: 0, radius: 0, angle: 0, centerX: 0.5, centerY: 0.5,
    seed: 4294967294, threshold: 25, noiseMonochromatic: false, noiseDistribution: 'uniform',
    gradientShadow: '#000000', gradientHighlight: '#ffffff', gradientBlend: 'normal', gradientStops: '[]', filterExtra: '{}',
  });
});

test('filter Action parameters retain effect-specific thresholds', () => {
  assert.equal(filterActionParameters({ type: 'dust-scratches', threshold: 9 }).threshold, 9);
  assert.equal(filterActionParameters({ type: 'reduce-noise', threshold: 999 }).threshold, 255);
  assert.equal(filterActionParameters({ type: 'ai-denoise' }).threshold, 18);
  assert.equal(filterActionParameters({ type: 'ai-denoise', threshold: 42 }).threshold, 42);
  assert.equal(filterActionParameters({ type: 'ai-sharpen' }).threshold, 22);
});

test('filter Action parameters retain bounded Gradient Map appearance', () => {
  assert.deepEqual(filterActionParameters({
    type: 'gradient-map',
    gradientMap: { shadow: '#123456', highlight: '#fedcba', blend: 'screen', stops: [{ position: 30, color: '#abcdef' }] },
  }), {
    amount: 0, radius: 0, angle: 0, centerX: 0.5, centerY: 0.5,
    seed: 0, threshold: 25, noiseMonochromatic: false, noiseDistribution: 'uniform',
    gradientShadow: '#123456', gradientHighlight: '#fedcba', gradientBlend: 'screen',
    gradientStops: '[{"position":30,"color":"#abcdef"}]', filterExtra: '{}',
  });
});

test('filter Action parameters retain effect-specific geometry', () => {
  const fieldParameters = filterActionParameters({
    type: 'field-blur',
    fieldPoints: [{ x: 0.25, y: 0.75, radius: 18 }],
  });
  assert.deepEqual(JSON.parse(fieldParameters.filterExtra), {
    fieldPoints: [{ x: 0.25, y: 0.75, radius: 18 }],
  });
  const tiltParameters = filterActionParameters({
    type: 'tilt-shift',
    tiltShift: { focusWidth: 0.4, feather: 0.3 },
  });
  assert.deepEqual(JSON.parse(tiltParameters.filterExtra), {
    tiltShift: { focusWidth: 0.4, feather: 0.3 },
  });
  const adaptiveParameters = filterActionParameters({
    type: 'adaptive-wide-angle',
    adaptiveWideAngle: { horizontal: 72, vertical: 28 },
  });
  assert.deepEqual(JSON.parse(adaptiveParameters.filterExtra), {
    adaptiveWideAngle: { horizontal: 72, vertical: 28 },
  });
});

test('filter Action parameters retain Neural Filters controls without source data', () => {
  const parameters = filterActionParameters({
    type: 'neural-enhance', amount: 85, radius: 2,
    neuralEnhance: { luminance: 52, color: 38, texture: 56 },
  });
  assert.deepEqual(JSON.parse(parameters.filterExtra), {
    neuralEnhance: { luminance: 52, color: 38, texture: 56 },
  });
});
