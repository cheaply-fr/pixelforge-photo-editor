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

// Regression: the hash returned a signed int32, so uniform samples were never
// positive (noise only darkened) and half of Gaussian samples clamped to an
// extreme (36% of pixels pure white on black).
const grey = (size, value) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) data.set([value, value, value, 255], i * 4);
  return data;
};
const stats = (data) => {
  let sum = 0, above = 0, below = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    n += 1;
    sum += data[i] - 128;
    if (data[i] > 128) above += 1;
    if (data[i] < 128) below += 1;
  }
  return { mean: sum / n, above: above / n, below: below / n };
};

for (const noiseDistribution of ['uniform', 'gaussian']) {
  test(`${noiseDistribution} Add Noise is zero-mean and symmetric on mid grey`, () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const out = applyFilterEffectsPixels(grey(200, 128), 200, 200, {
        type: 'add-noise', amount: 40, seed, noiseMonochromatic: true, noiseDistribution,
      });
      const { mean, above, below } = stats(out);
      assert.ok(Math.abs(mean) < 1.5, `seed ${seed} mean ${mean}`);
      assert.ok(Math.abs(above - below) < 0.02, `seed ${seed} above ${above} below ${below}`);
      assert.ok(above > 0.4, `seed ${seed} brightens about half the pixels`);
    }
  });
}

test('uniform Add Noise on black covers the full positive range', () => {
  const black = grey(400, 0);
  const out = applyFilterEffectsPixels(black, 400, 400, {
    type: 'add-noise', amount: 100, seed: 0, noiseMonochromatic: true, noiseDistribution: 'uniform',
  });
  let lit = 0, top = 0, over150 = 0;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] > 0) lit += 1;
    if (out[i] >= 254) top += 1;
    if (out[i] > 150) over150 += 1;
  }
  const n = 400 * 400;
  // Half the samples are positive; values above 150 occur ~(1 - 150/255) / 2.
  assert.ok(Math.abs(lit / n - 0.5) < 0.01, `lit ${lit / n}`);
  assert.ok(Math.abs(over150 / n - (1 - 150 / 255) / 2) < 0.01, `over150 ${over150 / n}`);
  assert.ok(top > 0 && top / n < 0.006, `top ${top / n}`);
});

test('Gaussian Add Noise rarely clips', () => {
  const out = applyFilterEffectsPixels(grey(400, 0), 400, 400, {
    type: 'add-noise', amount: 100, seed: 3, noiseMonochromatic: true, noiseDistribution: 'gaussian',
  });
  let clipped = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i] === 255) clipped += 1;
  // Samples are N(0, 1/2.5) clamped to ±1: P(z > 2.5) ≈ 0.62%.
  assert.ok(clipped / (400 * 400) < 0.012, `clipped ${clipped / (400 * 400)}`);
});
