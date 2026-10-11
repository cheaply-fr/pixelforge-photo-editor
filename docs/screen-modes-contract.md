# Screen modes contract

PixelForge exposes the three screen modes named by the Photoshop toolbar
reference: **Standard Screen Mode**, **Full Screen with Menu**, and **Full
Screen**. The `F` shortcut cycles through them in that order and `Escape`
returns to Standard. The View menu exposes each mode directly so keyboard,
pointer and touch users can reach the same state.

The mode is a workspace preference. It is persisted in the browser's
`pixelforge.screen-mode.v1` local-storage key, restored on a bookmark reload,
and validated against the exact three-value vocabulary. Malformed or missing
storage falls back to Standard. No screen-mode change creates an undo entry,
changes frame pixels, changes project history, or changes exported files.

Standard retains the complete editor chrome. Full Screen with Menu uses the
available viewport for the document while retaining the menu bar and tool
palette. Full Screen hides the document bar, menus, inspector and footer so
the canvas receives the available viewport. A persistent, keyboard-focusable
exit control remains visible in both reduced modes; `Escape` also exits. When
the browser supports the Fullscreen API, entering either reduced mode requests
native fullscreen and listens for native exit. Browsers that deny or omit the
API retain the CSS viewport mode and continue to provide the same exit path.

The feature is deliberately separate from document persistence. A restored
draft keeps its pixels, layers and history regardless of the mode selected on
the previous visit, and exporting a draft never serializes this UI preference.

Validation covers pure vocabulary/normalization/cycle behavior, menu commands,
`F` and `Escape` keyboard paths, malformed local storage, reload persistence,
native-fullscreen denial fallback, no history mutation, and desktop/mobile
viewport reachability.
