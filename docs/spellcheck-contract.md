# Check Spelling contract

`Edit > Check Spelling…` scans editable text layers locally and lists the
unique words it does not recognise, with occurrence counts, per layer. It never
uploads or persists text outside the existing local project and leaves every
layer and pixel unchanged. It is a hint list, not a complete language, grammar
or provider-backed spell checker, and the dialog says so.

## Word list

- `src/spellcheckWords.ts` holds about 3,700 common English base words plus
  irregular forms (went, children, better…), contractions and a few editor
  terms (JPEG, RGB…). The list was **written for PixelForge** from general
  English vocabulary; it is not copied from SCOWL, ENABLE, Hunspell or any
  other third-party list, so it carries no separate licence and is covered by
  the repository's own licence. British and American spellings of common words
  are both included.
- The list is a separate lazy chunk (`loadSpellingDictionary()`), loaded the
  first time the dialog opens and cached for the session. It is bundled with
  the app, so the check works offline. If the chunk cannot load, the dialog
  falls back to the small built-in vocabulary and says so.
- `src/spellcheck.ts` accepts regular inflections of a known base word, up to
  two affixes deep: plural/verb endings (-s, -es, -ies, -ed, -ing, with doubled
  consonants and silent-e), comparison (-er, -est, -ier, -iest), -ly, -ness,
  -ment, -ful, -less, -able/-ible, -en, -ish, -y, -ion/-ation, -ity, -al, -ic,
  and common prefixes (un-, re-, pre-, non-, over-, under-, out-, mis-, dis-,
  sub-, super-, multi-, auto-). So "golden", "hours", "edited" and "quickly"
  pass while "teh" or "wrld" are listed. Words of up to five capital letters
  (acronyms) and single letters are skipped; hyphenated words are checked part
  by part.
- Names, technical terms and rarer words can be listed even when they are
  correctly spelled. There are no suggestions or replacements; use
  Edit > Find and Replace Text… to change a word.

The command is disabled when no editable text layer exists, is dismissible with
Escape or Close, and is covered by pure tests (`tests/spellcheck.test.mjs`:
tokenizer, counts, the "Teh golden hour" regression, inflection rules, lazy
single load) and desktop/mobile browser coverage that creates a misspelling
through the existing editable text workflow (`tests/browser/spellcheck.spec.ts`,
`tests/browser/shortcuts-audit.spec.ts`).
