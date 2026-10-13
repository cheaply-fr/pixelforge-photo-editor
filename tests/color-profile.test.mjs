import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColorProfile, validColorProfile } from '../src/colorProfile.ts';

test('color profiles are bounded and normalize legacy omissions to sRGB', () => {
  assert.equal(validColorProfile('srgb'), true);
  assert.equal(validColorProfile('display-p3'), true);
  assert.equal(validColorProfile('rec2020'), false);
  assert.equal(normalizeColorProfile(undefined), 'srgb');
  assert.equal(normalizeColorProfile('display-p3'), 'display-p3');
});
