import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FONT_PREVIEW_SIZE,
  FONT_PREVIEW_SIZES,
  fontPreviewPixels,
  nextFontPreviewSize,
  normalizeFontPreviewSize,
} from '../src/fontPreview.ts';

test('font preview normalization fails closed and keeps a stable cycle', () => {
  assert.deepEqual(FONT_PREVIEW_SIZES, ['small', 'medium', 'large']);
  assert.equal(normalizeFontPreviewSize(undefined), DEFAULT_FONT_PREVIEW_SIZE);
  assert.equal(normalizeFontPreviewSize('huge'), DEFAULT_FONT_PREVIEW_SIZE);
  assert.equal(nextFontPreviewSize('small'), 'medium');
  assert.equal(nextFontPreviewSize('medium'), 'large');
  assert.equal(nextFontPreviewSize('large'), 'small');
});

test('font preview sizes map to bounded option pixels', () => {
  assert.equal(fontPreviewPixels('small'), 12);
  assert.equal(fontPreviewPixels('medium'), 16);
  assert.equal(fontPreviewPixels('large'), 22);
  assert.equal(fontPreviewPixels('unsupported'), 16);
});
