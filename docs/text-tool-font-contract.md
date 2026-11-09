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

The Type tool's on-canvas editing, character runs and the font-loading
interface (family strings, `document.fonts` waits and re-layout) are defined
in [`type-tool-contract.md`](./type-tool-contract.md). Character-run families
are not limited to this allow-list, so a font library can provide more.

Pure persistence/validation coverage is in
`tests/persistence-contract.test.mjs`. Desktop and mobile acceptance covers
the Text tool selection, new-layer font assignment and reload persistence in
`tests/browser/type-style-presets.spec.ts`.
