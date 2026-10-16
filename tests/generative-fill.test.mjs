import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentAwareFill,
  validContentAwareFill,
  GENERATIVE_FILL_MAX_PROMPT,
} from '../src/contentAwareCleanup.ts';

function fixture() {
  const width = 9;
  const height = 9;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 20 + x * 8;
      source[offset + 1] = 40 + y * 7;
      source[offset + 2] = 80 + ((x + y) % 3) * 20;
      source[offset + 3] = 255;
    }
  }
  const mask = new Uint8ClampedArray(width * height);
  mask[4 * width + 4] = 255;
  return { width, height, source, mask };
}

test('local Generative Fill is deterministic, source-safe and alpha-safe', () => {
  const { width, height, source, mask } = fixture();
  const before = new Uint8ClampedArray(source);
  const first = new Uint8ClampedArray(source);
  const second = new Uint8ClampedArray(source);
  const fill = {
    version: 1,
    mask: 'mask-1',
    radius: 5,
    opacity: 1,
    mode: 'texture',
    prompt: 'soft woven blue fabric',
    seed: 42,
  };
  assert.equal(validContentAwareFill(fill), true);
  assert.equal(applyContentAwareFill(first, source, width, height, mask, fill), true);
  assert.equal(applyContentAwareFill(second, source, width, height, mask, fill), true);
  assert.deepEqual([...source], [...before]);
  assert.deepEqual([...first], [...second]);
  assert.notDeepEqual([...first], [...source]);
  assert.equal(first[4 * width * 4 + 3], 255);
  assert.deepEqual(first.slice(0, 4), source.slice(0, 4));
});

test('Generative Fill rejects malformed prompts, seeds and modes', () => {
  const base = { version: 1, mask: 'mask-1', radius: 4, opacity: 1, mode: 'texture', seed: 1 };
  assert.equal(validContentAwareFill({ ...base, prompt: 'x'.repeat(GENERATIVE_FILL_MAX_PROMPT + 1) }), false);
  assert.equal(validContentAwareFill({ ...base, mode: 'remote-model' }), false);
  assert.equal(validContentAwareFill({ ...base, seed: -1 }), false);
  assert.equal(validContentAwareFill({ ...base, seed: 1.5 }), false);
});

test('legacy content-aware fill metadata remains valid and deterministic', () => {
  const { width, height, source, mask } = fixture();
  const first = new Uint8ClampedArray(source);
  const second = new Uint8ClampedArray(source);
  const fill = { version: 1, mask: 'mask-1', radius: 4, opacity: 1 };
  assert.equal(validContentAwareFill(fill), true);
  assert.equal(applyContentAwareFill(first, source, width, height, mask, fill), true);
  assert.equal(applyContentAwareFill(second, source, width, height, mask, fill), true);
  assert.deepEqual([...first], [...second]);
});
