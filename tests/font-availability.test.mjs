import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFontAvailability,
  fontCheckShorthand,
  normalizeFontFamily,
} from '../src/fontAvailability.ts';

test('font availability normalizes bounded family names and check shorthands', () => {
  assert.equal(normalizeFontFamily('  Georgia  '), 'Georgia');
  assert.equal(fontCheckShorthand('Georgia'), '16px "Georgia"');
  assert.equal(normalizeFontFamily(''), undefined);
  assert.equal(normalizeFontFamily('bad\nfont'), undefined);
  assert.equal(fontCheckShorthand(undefined), undefined);
});

test('font availability is explicit and fails closed when browser checks throw', () => {
  assert.equal(
    checkFontAvailability('Arial', () => true),
    'available',
  );
  assert.equal(
    checkFontAvailability('Missing Font', () => false),
    'fallback',
  );
  assert.equal(
    checkFontAvailability('Arial', () => {
      throw new Error('blocked');
    }),
    'fallback',
  );
  assert.equal(
    checkFontAvailability(undefined, () => true),
    'fallback',
  );
});
