import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPEN_TYPE, normalizeOpenType, openTypeCanvasValues, validOpenType } from '../src/openType.ts';

test('OpenType defaults are complete and valid', () => {
  assert.equal(validOpenType(DEFAULT_OPEN_TYPE), true);
  assert.deepEqual(normalizeOpenType(undefined), DEFAULT_OPEN_TYPE);
});

test('OpenType normalizes legacy and unsafe values without aliases', () => {
  assert.deepEqual(normalizeOpenType({ kerning: 'none', ligatures: false, smallCaps: true }), {
    ligatures: false,
    discretionaryLigatures: false,
    contextualAlternates: true,
    kerning: 'none',
    smallCaps: true,
  });
  assert.equal(validOpenType({ ...DEFAULT_OPEN_TYPE, kerning: 'forged' }), false);
  assert.equal(validOpenType({ ...DEFAULT_OPEN_TYPE, smallCaps: 'yes' }), false);
});

test('OpenType maps deterministically to browser typography values', () => {
  assert.deepEqual(openTypeCanvasValues({ ligatures: false, discretionaryLigatures: true, contextualAlternates: false, kerning: 'normal', smallCaps: true }), {
    fontKerning: 'normal',
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"calt" 0, "dlig"',
    fontVariantCaps: 'small-caps',
  });
});
