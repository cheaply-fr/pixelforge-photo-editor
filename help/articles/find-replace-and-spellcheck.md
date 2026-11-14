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
2. In **Find**, enter the text to look for.
3. In **Replace with**, enter the new text. Leave it empty to delete every match.
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
2. The dialog lists each unknown word once, grouped under the text it comes from.
3. Fix the words on the canvas (see [Edit text on the canvas](edit-text-on-canvas)) or with Find and Replace.
4. Click **Close** or press <kbd>Esc</kbd>.

Check Spelling does not change anything by itself.

> [!IMPORTANT]
> Check Spelling uses a small English word list built into the editor, so it is a list of hints, not a full spell checker. It also lists correct words that are not in its list (in the example above, *golden* and *hour*), and it does not check grammar or other languages.

While you type on the canvas, your browser may also underline misspelt words with its own spell checker, in the language your browser is set to.
