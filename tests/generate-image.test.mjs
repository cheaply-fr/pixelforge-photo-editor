import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGenerateImageRequest,
  renderGeneratedImage,
  validGeneratedImageRequest,
  GENERATE_IMAGE_MAX_PROMPT,
} from '../src/generateImage.ts';

test('normalizes styles, colours and bounded dimensions', () => {
  const result = normalizeGenerateImageRequest({ prompt: 'blue stripes', width: 96, height: 64, seed: 7 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.style, 'stripes');
  assert.deepEqual(result.request.colors[0], [55, 119, 235]);
  assert.equal(validGeneratedImageRequest(result.request), true);
});

test('renders deterministic opaque pixels with representative style variation', () => {
  const result = normalizeGenerateImageRequest({ prompt: 'red dots', width: 48, height: 48, seed: 9 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const first = renderGeneratedImage(result.request);
  const second = renderGeneratedImage(result.request);
  assert.deepEqual(first, second);
  assert.equal(first.length, 48 * 48 * 4);
  assert.equal(new Set(first.filter((_value, index) => index % 4 === 3)).size, 1);
  assert.ok(new Set(first).size > 3);
});

test('rejects empty, oversized, malformed and over-budget requests', () => {
  assert.equal(normalizeGenerateImageRequest({ prompt: '', width: 64, height: 64 }).ok, false);
  assert.equal(normalizeGenerateImageRequest({ prompt: 'x'.repeat(GENERATE_IMAGE_MAX_PROMPT + 1), width: 64, height: 64 }).ok, false);
  assert.equal(normalizeGenerateImageRequest({ prompt: 'noise', width: 1.5, height: 64 }).ok, false);
  assert.equal(normalizeGenerateImageRequest({ prompt: 'noise', width: 1024, height: 1024, seed: 1 }).ok, true);
  assert.equal(normalizeGenerateImageRequest({ prompt: 'noise', width: 2048, height: 64, seed: 1 }).ok, false);
});
