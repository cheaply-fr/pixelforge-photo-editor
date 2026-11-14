# Keyboard shortcuts dialog contract

`Edit > Keyboard Shortcuts…` opens a local, read-only reference generated from
the same menu definitions used by the command search palette. This keeps labels
and advertised shortcuts from drifting between menus, search, and the help
surface. The list includes shortcuts even when a command is temporarily
disabled by the current document; availability is still enforced by the
command guard when the command is invoked.

The reference is a table with Command, Menu and Shortcut columns (row header,
menu name and a key cap), scrolling under a sticky header inside the dialog so
the custom-binding sections stay reachable on phones. It also lists
**Search commands** (`Ctrl+F`, Edit menu), which the command search palette
leaves out of its own results.

The dialog is searchable, keyboard-focusable, dismissible with Escape or its
Close button, and contains no account or network dependency. It intentionally
does not offer arbitrary shortcut rebinding yet: rebinding needs a versioned
preference schema, collision detection, platform-specific modifier mapping,
and migration/restore coverage before it can be enabled safely.

Desktop and mobile browser tests cover opening the menu item, visible shortcut
rows, filtering, the separated table columns, the Search commands row, and
dismissal (`tests/browser/keyboard-shortcuts.spec.ts`,
`tests/browser/shortcuts-audit.spec.ts`).
