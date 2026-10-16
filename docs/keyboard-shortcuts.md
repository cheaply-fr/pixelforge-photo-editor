# Keyboard shortcuts

PixelForge follows the Photoshop shortcut vocabulary where the corresponding
tool or document action exists. The editor is a browser application, so
unsupported desktop commands such as print, quit, clipboard layer operations,
merge and rulers remain unhandled. Screen modes use the Photoshop `F` cycle;
the preference is UI-only and does not change pixels or document history.
Shortcuts are ignored while a text field, select, or dialog is being edited.
Use `Cmd` on macOS and `Ctrl` on Windows/Linux.

## Tools

| Key | PixelForge behavior |
| --- | --- |
| `V` | Move |
| `H` | Hand |
| `Z` | Zoom |
| `I` | Eyedropper |
| `G` | Cycle Gradient and Fill |
| `B` | Cycle Brush, Pencil and Color Replace |
| `S` | Clone |
| `J` | Healing |
| `C` | Crop |
| `E` | Eraser |
| `O` | Cycle Dodge, Burn and Sponge (Shift reverses) |
| `R` | Cycle Rotate View, Smudge, Blur and Sharpen (Shift reverses) |
| `T` | Text |
| `U` | Cycle Rectangle and Ellipse |
| `M` | Cycle rectangular, elliptical, single-row and single-column marquee |
| `L` | Lasso |
| `W` | Magic Wand |
| `Q` | Toggle Quick Mask mode |
| `D` | Reset foreground/background to black/white |
| `X` | Swap foreground/background colors |
| `[` / `]` | Decrease/increase brush size |

`P` activates the straight-segment Pen and `A` activates Direct Selection. Pen
clicks place path nodes; click the first node after three or more points to
close and commit the editable path layer. Escape cancels an open Pen gesture or
a Direct Selection drag. Photoshop tools that PixelForge has not implemented
yet (for example Freeform/Curvature Pen) remain planned; **R cycles Rotate View and Smudge, with Shift reversing the family; the menu and toolbar controls persist only the viewport angle. Escape cancels an in-progress Rotate View gesture.**

## Commands and view

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+N` | New white document |
| `Cmd/Ctrl+O` | Open image |
| `Cmd/Ctrl+S` | Open the image export dialog |
| `Cmd/Ctrl+Shift+S` | Download an editable project file |
| `Cmd/Ctrl+Z` or `Cmd/Ctrl+Alt+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` | Redo |
| `Cmd/Ctrl+A` | Select the entire canvas |
| `Cmd/Ctrl+D` or `Cmd/Ctrl+Shift+A` | Deselect |
| `Cmd/Ctrl+I` or `Cmd/Ctrl+Shift+I` | Invert the current selection |
| `Cmd/Ctrl+G` | Put the active layer in a new group |
| `Cmd/Ctrl+Shift+G` | Remove the active layer from its group |
| `Cmd/Ctrl+J` | Duplicate the active layer |
| `Cmd/Ctrl+Alt+I` | Open image resize |
| `0` | Fit to screen |
| `1` | Actual size |
| `+` / `-` | Zoom in/out |
| `F` | Cycle Standard Screen Mode, Full Screen with Menu and Full Screen |
| `Escape` | Exit a reduced screen mode, or close an open menu |

Quick Mask mode uses the current selection as its starting alpha. Paint hides
selected pixels with the standard red overlay; hold `Alt` or enable Reveal in
the Quick Mask panel to restore them. Exiting converts the painted alpha back
to a canvas-sized selection mask. Undo/redo and document-changing commands are
disabled until Quick Mask mode is exited so the active alpha cannot drift from
the current frame.

## Menu keyboard access

Menu triggers are keyboard buttons. Press `Enter` or `Space` to open a menu,
or `ArrowDown`/`ArrowUp` to open it and focus its first/last enabled command.
Inside an open menu, `ArrowDown` and `ArrowUp` move through enabled commands
with wrapping; `Home` and `End` jump to the first and last enabled command.
`Enter` or `Space` activates the focused command, `Escape` closes the menu and
returns focus to its trigger, and `Tab` closes the popup before moving to the
next control. Disabled roadmap entries are skipped by keyboard navigation.

This focus model is covered in the desktop and mobile Playwright projects so
the Photoshop-style command inventory remains usable without a pointer.

Shortcuts operate on the current local draft and remain available without an
account. The foreground/background pair is included in draft and project-file
settings, with `#ffffff` used for older drafts that do not contain a background
color. `R` cycles the current Rotate View/retouch family; the retouch flyout
groups Smudge, Blur and Sharpen with their visible icons and remembered active
variant.
