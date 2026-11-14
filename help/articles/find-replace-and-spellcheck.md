---
title: Find, replace and check spelling
summary: Replace words across all type layers with Find and Replace Text, and list unknown words with Check Spelling, all inside your browser.
category: type
order: 80
level: beginner
keywords: [search text, replace text, spelling, typo, spell check, proofread]
related: [edit-text-on-canvas, add-text, command-search]
updated: 2026-11-14
---

Both commands work on the editable type layers of the current document. Your text is never sent anywhere.

## Find and replace text

![The Find and Replace Text dialog replacing "Summer" with "Winter"](img/find-replace-dialog.jpg "Find and Replace Text")

1. Choose **Edit > Find and Replace Text…**, or click **Find & Replace…** in the Paragraph settings of the Text section.
2. In the **Find** box, enter the text to look for.
3. In the **Replace with** box, enter the new text. Leave it empty to delete every match.
4. Optionally tick **Match case** or **Whole words only**.
5. Click **Replace all**.

The status bar reports how many matches were replaced in how many layers. All replacements are one history step. If nothing matches, the document does not change.

Good to know:

- Only editable type layers are searched. Rasterized type, shapes, paths and pixel layers are left alone.
- Replacement text takes the character styling of the text it replaces.
- The replacement is inserted exactly as typed; there are no wildcards or patterns.
- The command is unavailable when the document has no type layers.

To search for menu commands rather than text, use [Search commands](command-search).

## Check spelling

![The Check Spelling dialog listing words from a type layer](img/spellcheck-dialog.jpg "Check Spelling lists words it doesn't know")

1. Choose **Edit > Check Spelling…**, or click **Check spelling…** in the Paragraph settings.
2. The dialog lists each word it does not recognise once, grouped under the type layer it comes from, with the number of times it occurs. The first time you open it in a session, it shows "Loading word list…" for a moment.
3. Fix the words on the canvas (see [Edit text on the canvas](edit-text-on-canvas)) or with Find and Replace.
4. Click **Close** or press <kbd>Esc</kbd>.

Check Spelling does not change anything by itself.

Check Spelling compares your words with a built-in list of about 3,700 common English words, in British and American spellings. It also accepts their regular forms: plurals and verb endings (*hours*, *edited*, *editing*), comparisons (*brighter*, *brightest*), endings such as *-ly* and *-ness*, and common prefixes such as *un-* and *re-*. Short all-capital words (acronyms of up to five letters, such as *RGB*) and single letters are skipped, and hyphenated words are checked part by part. In the example above, only *teh* is listed.

The list is part of the editor, so the check also works offline. If it cannot be loaded, the dialog says so and uses a minimal list instead.

> [!IMPORTANT]
> Check Spelling is a list of hints, not a full spell checker. Names, technical terms and rarer words can be listed even when they are spelled correctly. It does not suggest corrections, check grammar or check other languages; use Find and Replace to change a word.

While you type on the canvas, your browser may also underline misspelt words with its own spell checker, in the language your browser is set to.
