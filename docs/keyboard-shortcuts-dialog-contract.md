# Keyboard shortcuts dialog contract

`Edit > Keyboard Shortcuts…` opens a local, read-only reference generated from
the same menu definitions used by the command search palette. This keeps labels
and advertised shortcuts from drifting between menus, search, and the help
surface. The list includes shortcuts even when a command is temporarily
disabled by the current document; availability is still enforced by the
command guard when the command is invoked.

The dialog is searchable, keyboard-focusable, dismissible with Escape or its
Close button, and contains no account or network dependency. It intentionally
does not offer arbitrary shortcut rebinding yet: rebinding needs a versioned
preference schema, collision detection, platform-specific modifier mapping,
and migration/restore coverage before it can be enabled safely.

Desktop and mobile browser tests cover opening the menu item, visible shortcut
rows, filtering, and dismissal.
