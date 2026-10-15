import test from 'node:test';
import assert from 'node:assert/strict';
import { findSpellingHints } from '../src/spellcheck.ts';

test('findSpellingHints returns deterministic unknown words and counts', () => {
  assert.deepEqual(findSpellingHints('Hello wrld wrld, canvas.'), [{ word: 'wrld', count: 2 }]);
});

test('findSpellingHints ignores short tokens and punctuation', () => {
  assert.deepEqual(findSpellingHints('A an is it!'), []);
});

test('findSpellingHints rejects non-text input', () => {
  assert.throws(() => findSpellingHints(null), /string/);
});
