# Text tool font contract

The Text tool exposes the bounded local/system font list already supported by
the document renderer (`Arial`, `Georgia`, `Courier New` and `Verdana`). The
selection is stored in the versioned draft `settings.fontFamily` field and is
used when creating a new editable text layer. Existing text layers retain
their own editable `fontFamily` and can still be changed from the Layers
panel or the Update All Text Layers command.

Font identifiers are allow-listed during draft validation. Unknown or
unbounded values fail closed without replacing the current draft. No font
file, external provider, document pixels or personal data is uploaded by the
Text tool. Browser rendering still depends on the local platform's installed
font fallback; full OpenType shaping, licensed font providers and missing-font
substitution diagnostics remain separate roadmap work.

Pure persistence/validation coverage is in
`tests/persistence-contract.test.mjs`. Desktop and mobile acceptance covers
the Text tool selection, new-layer font assignment and reload persistence in
`tests/browser/type-style-presets.spec.ts`.

## Font library update

The Text tool, Layers panel and Update All Text Layers family controls now
list the system families plus the self-hosted library (grouped by category,
with a searchable "Browse fonts" picker). Draft settings, type-style presets
and batch updates accept system or library families; text layers themselves
accept any bounded family name for portability. See
[`font-library-contract.md`](./font-library-contract.md).
