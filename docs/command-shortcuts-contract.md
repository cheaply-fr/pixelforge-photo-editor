# Custom command shortcut contract

PixelForge keeps its Photoshop-style menu shortcuts as the built-in baseline
and lets users add local overrides from **Edit → Keyboard Shortcuts…**. An
override is a single key, punctuation key, or function-key chord with optional
Shift, Ctrl, Alt/Option, or Cmd modifiers. Chords are normalized to a stable
`ctrl+meta+alt+shift+key` order, aliases are accepted at input, and duplicate
or malformed bindings are discarded deterministically.

Overrides are stored in the versioned `pixelforge.command-shortcuts` local
preference envelope. They contain command identifiers and validated chords
only; no pixels, project data, credentials, or network state are stored. A
blank/reset value removes the override and restores the advertised built-in
shortcut. A custom command match is exact about every modifier and is routed
through the normal command dispatcher, so lock, selection, quick-mask,
history, cancellation, and privacy guards remain authoritative.

The contract is intentionally local and opt-in. It does not claim that every
menu entry is enabled or that browser-reserved shortcuts can be intercepted.
Pure tests cover punctuation/function-key validation, version failure,
collision handling, alias normalization, and exact modifier matching.
Desktop/mobile acceptance covers applying a command chord, invoking it,
reload persistence, and the existing shortcut listing/filter behavior.
