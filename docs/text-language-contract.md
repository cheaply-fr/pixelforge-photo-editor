# Text language options contract

PixelForge now enables `Type → Language Options` for an editable text layer.
The command stores a bounded local `languageOptions` object with a language
hint (`auto`, English, French, German, Spanish, Italian, Portuguese, Dutch,
Arabic, Hebrew, Japanese, Korean or Chinese), an explicit or automatic
left-to-right/right-to-left direction, and a hyphenation intent flag.

Language metadata is optional for legacy drafts and is normalized at the
document boundary. Invalid values fail closed. Rendering applies the resolved
Canvas 2D direction while retaining source text, transforms, authored line
breaks and undo history. Hyphenation is intentionally metadata-only until a
bounded layout engine exists; PixelForge does not claim full OpenType,
language-specific shaping, font embedding or Adobe paragraph-engine parity.

The options dialog and Layers panel expose the same values, and desktop/mobile
acceptance covers menu guards, Arabic right-to-left rendering, undo-safe edits,
reload and portable project round trips. Browser font shaping remains local;
no provider, font download or network request is introduced.

