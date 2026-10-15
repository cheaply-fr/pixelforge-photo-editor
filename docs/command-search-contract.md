# Command search contract

`Edit → Search` opens a local command palette and `Ctrl+F`/`Cmd+F` opens the
same surface. Results are derived from the current menu inventory, include the
owning menu and advertised shortcut, and use the same enabled/disabled guards
as the menus. A disabled roadmap item remains visible but cannot run. Running a
command closes the palette and routes through the normal command dispatcher,
so history, quick-mask guards, persistence, and notices are not bypassed.

The palette is keyboard-focusable, touch-friendly, bounded to 30 results, and
does not send the query or document data to a provider. Desktop/mobile
acceptance covers menu activation, filtering, command execution, and the
keyboard shortcut.
