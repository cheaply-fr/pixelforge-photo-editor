# Custom command shortcut contract

PixelForge keeps its Photoshop-style menu shortcuts as the built-in baseline
and lets users add local overrides from **Edit → Keyboard Shortcuts…**. Every
working menu command, including commands without a built-in shortcut, can
receive an override. An override is a single key, punctuation key, or function-key chord with optional
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

Built-in menu shortcuts follow the same exact-modifier rule. `Ctrl+F`
(Search commands), `Ctrl+Shift+F` (Fade…), `Ctrl+Alt+Shift+F` (Find Layers),
`Ctrl+,` (Hide Layers) and `Ctrl+Alt+Z` (Toggle Last State) are resolved by
`src/menuShortcuts.ts` and run through the command dispatcher, so the menu's
disabled state is honoured; a disabled command reports that in the status bar.
`Cmd` is accepted for `Ctrl` on macOS, and when Option changes the produced
character the physical letter key decides. `tests/menu-shortcuts.test.mjs`
cross-checks every shortcut label in the menu definitions against the table of
handled chords, so a menu cannot advertise a key that does something else.

The contract is intentionally local and opt-in. It does not claim that every
menu entry is enabled or that browser-reserved shortcuts can be intercepted.
Pure tests cover punctuation/function-key validation, version failure,
collision handling, alias normalization, and exact modifier matching.
Desktop/mobile acceptance covers applying a built-in and no-default command
chord, invoking each, reload persistence, disabled-command guards, and the
existing shortcut listing/filter behavior.
