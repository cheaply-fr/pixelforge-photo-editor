import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SPELLING_DICTIONARY,
  createSpellingDictionary,
  findSpellingHints,
  inflectionStems,
  isKnownWord,
  loadSpellingDictionary,
} from '../src/spellcheck.ts';

test('findSpellingHints returns deterministic unknown words and counts', () => {
  assert.deepEqual(findSpellingHints('Hello wrld wrld, canvas.'), [{ word: 'wrld', count: 2 }]);
});

test('findSpellingHints ignores short tokens and punctuation', () => {
  assert.deepEqual(findSpellingHints('A an is it!'), []);
});

test('findSpellingHints rejects non-text input', () => {
  assert.throws(() => findSpellingHints(null), /string/);
});

test('the bundled common-word list knows everyday words such as "golden hour" (production defect)', async () => {
  const dictionary = await loadSpellingDictionary();
  assert.ok(dictionary.size >= 3000, `dictionary has ${dictionary.size} words`);
  assert.deepEqual(findSpellingHints('Teh golden hour', dictionary), [{ word: 'teh', count: 1 }]);
  assert.deepEqual(findSpellingHints('The quick brown fox jumps over the lazy dog', dictionary), []);
  assert.deepEqual(findSpellingHints('Summer sale: everything must go! Visit our new store downtown today.', dictionary), []);
  assert.deepEqual(findSpellingHints("Don't miss it, we're opening soon. Children's photos in RGB and HDR.", dictionary), []);
  assert.deepEqual(
    findSpellingHints('Wellcome to the beutiful beach', dictionary).map((hint) => hint.word),
    ['beutiful', 'wellcome'],
  );
  assert.equal(await loadSpellingDictionary(), dictionary, 'the list is loaded once');
});

test('regular inflections of known words are accepted, nonsense stems are not', () => {
  const dictionary = createSpellingDictionary('gold hour edit quick happy brush memory stop');
  for (const word of ['golden', 'hours', 'edited', 'editing', 'quickly', 'happiest', 'happiness', 'brushes', 'memories', 'stopped', 'unhappy'])
    assert.equal(isKnownWord(word, dictionary), true, word);
  for (const word of ['wrld', 'teh', 'goldn', 'hourz']) assert.equal(isKnownWord(word, dictionary), false, word);
  assert.ok(inflectionStems('stopping').includes('stop'));
  assert.ok(inflectionStems('memories').includes('memory'));
});

test('without the loaded list only the small built-in vocabulary is known', () => {
  assert.equal(BUILT_IN_SPELLING_DICTIONARY.has('golden'), false);
  assert.deepEqual(findSpellingHints('Lorem ipsum dolor sit amet'), []);
});
