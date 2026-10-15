import test from 'node:test';
import assert from 'node:assert/strict';
import { brushTextureOpacity, normalizeBrushTexture } from '../src/brushTexture.ts';

test('brush texture clamps persisted values and leaves zero exact', () => {
  assert.equal(normalizeBrushTexture(-2), 0);
  assert.equal(normalizeBrushTexture(42.4), 42);
  assert.equal(normalizeBrushTexture(200), 100);
  assert.equal(brushTextureOpacity(4, 8, 0), 1);
});

test('brush texture is deterministic and stays within bounded opacity', () => {
  const first = brushTextureOpacity(21.5, 14.25, 100);
  assert.equal(first, brushTextureOpacity(21.5, 14.25, 100));
  assert.ok(first >= 0.45 && first <= 1);
  assert.notEqual(first, brushTextureOpacity(21.5, 14.25, 20));
});
