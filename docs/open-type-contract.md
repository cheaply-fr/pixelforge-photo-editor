# OpenType presentation contract

PixelForge exposes a bounded, editable OpenType presentation slice for text
layers. The Layers panel stores standard ligatures, discretionary ligatures,
contextual alternates, kerning (`auto`, `normal`, or `none`) and small caps in
the text layer's versioned project metadata. Type → OpenType focuses the same
controls for the selected text layer, and the settings remain undoable through
the normal layer history and portable project round trip.

Rendering requests these flags through the browser Canvas 2D typography
properties (`fontKerning`, `fontVariantLigatures`, `fontFeatureSettings` and
`fontVariantCaps`). Actual glyph shaping remains dependent on the selected
font and browser; PixelForge does not embed fonts, promise Adobe's complete
OpenType engine, or implement provider-backed font libraries, variable-font
axes, language-specific shaping, type-on-path alternates or vertical OpenType
features.

Pure tests cover defaults, malformed values and deterministic browser-value
mapping. Desktop/mobile acceptance covers Type-menu enablement, editable
controls, lock guards, representative project state, reload and portable
project import. No text, font or telemetry leaves the browser.
