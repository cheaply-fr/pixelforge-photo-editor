import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  applyColorModePixels,
  normalizeColorMode,
} from '../src/colorMode.ts';

test('color mode normalization accepts only RGB and grayscale', () => {
  assert.deepEqual(COLOR_MODES, ['rgb', 'grayscale']);
  assert.equal(normalizeColorMode(undefined), DEFAULT_COLOR_MODE);
  assert.equal(normalizeColorMode('cmyk'), DEFAULT_COLOR_MODE);
  assert.equal(normalizeColorMode('grayscale'), 'grayscale');
});

test('grayscale mode uses Rec. 709 luminance, preserves alpha and source bytes', () => {
  const source = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 128, 4, 5, 6, 0,
  ]);
  const result = applyColorModePixels(source, 'grayscale');
  assert.deepEqual(
    Array.from(result),
    [54, 54, 54, 255, 182, 182, 182, 128, 5, 5, 5, 0],
  );
  assert.deepEqual(
    Array.from(source),
    [255, 0, 0, 255, 0, 255, 0, 128, 4, 5, 6, 0],
  );
});

test('RGB mode is a detached identity and malformed buffers fail closed', () => {
  const source = new Uint8ClampedArray([1, 2, 3, 4]);
  const result = applyColorModePixels(source, 'rgb');
  assert.deepEqual(Array.from(result), Array.from(source));
  assert.notEqual(result, source);
  assert.throws(
    () => applyColorModePixels(new Uint8ClampedArray([1, 2, 3]), 'rgb'),
    /RGBA/,
  );
});
