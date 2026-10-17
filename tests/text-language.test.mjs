import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TEXT_LANGUAGE,
  normalizeTextLanguage,
  resolvedTextDirection,
  validTextLanguageSettings,
} from '../src/textLanguage.ts';

test('text language defaults are complete and valid', () => {
  assert.equal(validTextLanguageSettings(DEFAULT_TEXT_LANGUAGE), true);
  assert.deepEqual(normalizeTextLanguage(undefined), DEFAULT_TEXT_LANGUAGE);
});

test('text language normalization rejects unsupported values without aliases', () => {
  assert.deepEqual(normalizeTextLanguage({ language: 'fr', direction: 'rtl', hyphenation: true }), {
    language: 'fr', direction: 'rtl', hyphenation: true,
  });
  assert.deepEqual(normalizeTextLanguage({ language: 'xx', direction: 'sideways', hyphenation: 'yes' }), DEFAULT_TEXT_LANGUAGE);
  assert.equal(validTextLanguageSettings({ ...DEFAULT_TEXT_LANGUAGE, language: 'xx' }), false);
});

test('auto direction resolves for right-to-left languages', () => {
  assert.equal(resolvedTextDirection({ language: 'ar', direction: 'auto' }), 'rtl');
  assert.equal(resolvedTextDirection({ language: 'he', direction: 'auto' }), 'rtl');
  assert.equal(resolvedTextDirection({ language: 'fr', direction: 'auto' }), 'ltr');
  assert.equal(resolvedTextDirection({ language: 'ar', direction: 'ltr' }), 'ltr');
});

