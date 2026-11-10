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

## Font library update

The Text tool, Layers panel and Update All Text Layers family controls now
list the system families plus the self-hosted library (grouped by category,
with a searchable "Browse fonts" picker). Draft settings, type-style presets
and batch updates accept system or library families; text layers themselves
accept any bounded family name for portability. See
[`font-library-contract.md`](./font-library-contract.md).

## One Font control

The Text section's **Font** picker (accessible name "Text tool font") is the
single font-family control: it sets the font for new type and, when a type
layer is selected or characters are being edited, restyles that layer or
those characters as one undo step (see #249). The Character panel no longer
has its own font-family picker. The Type options bar shown above the canvas
while a type tool is active mirrors the same state through the same action.
The Layers panel picker is labelled **Layer font (whole layer)**: it sets the
whole layer's family and does not change the default for new type.

Evidence: `tests/browser/audit-vector-type.spec.ts` (desktop and mobile).
