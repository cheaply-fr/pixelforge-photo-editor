import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSecondaryBrushPreset, secondaryBrushOpacity } from '../src/brushSecondary.ts';

test('secondary brush preset validation defaults safely and preserves built-ins', () => {
  assert.equal(normalizeSecondaryBrushPreset(undefined), 'none');
  assert.equal(normalizeSecondaryBrushPreset('missing'), 'none');
  assert.equal(normalizeSecondaryBrushPreset('round-soft'), 'round-soft');
  assert.equal(normalizeSecondaryBrushPreset('pencil'), 'pencil');
});

test('secondary brush amount is bounded and deterministic', () => {
  assert.equal(secondaryBrushOpacity(undefined), 0);
  assert.equal(secondaryBrushOpacity(-10), 0);
  assert.equal(secondaryBrushOpacity(35.6), 0.36);
  assert.equal(secondaryBrushOpacity(120), 1);
});

