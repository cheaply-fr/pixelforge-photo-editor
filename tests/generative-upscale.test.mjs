import test from 'node:test';
import assert from 'node:assert/strict';
import { planGenerativeUpscale } from '../src/generativeUpscale.ts';

test('Generative Upscale plans a bounded 2x request without mutating inputs', () => {
  const request = { factor: 2, method: 'automatic' };
  const plan = planGenerativeUpscale(1440, 960, request);
  assert.deepEqual(plan, { factor: 2, method: 'automatic', width: 2880, height: 1920 });
  assert.deepEqual(request, { factor: 2, method: 'automatic' });
});

test('Generative Upscale accepts a 4x request at the pixel budget boundary', () => {
  assert.deepEqual(planGenerativeUpscale(1000, 1000, { factor: 4, method: 'bilinear' }), {
    factor: 4,
    method: 'bilinear',
    width: 4000,
    height: 4000,
  });
});

test('Generative Upscale rejects unsupported factors and methods', () => {
  assert.throws(
    () => planGenerativeUpscale(100, 100, { factor: 3, method: 'automatic' }),
    /2x or 4x/,
  );
  assert.throws(
    () => planGenerativeUpscale(100, 100, { factor: 2, method: 'nearest' }),
    /supported upscale method/,
  );
});

test('Generative Upscale fails closed when the output exceeds document limits', () => {
  assert.throws(
    () => planGenerativeUpscale(4096, 4096, { factor: 2, method: 'automatic' }),
    /16,000 pixels and 16 megapixels/,
  );
  assert.throws(
    () => planGenerativeUpscale(16000, 16000, { factor: 2, method: 'automatic' }),
    /16,000 pixels and 16 megapixels/,
  );
});
