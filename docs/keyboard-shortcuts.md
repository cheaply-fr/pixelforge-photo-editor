# Keyboard shortcuts

PixelForge follows the Photoshop shortcut vocabulary where the corresponding
tool or document action exists. The editor is a browser application, so
unsupported desktop commands such as print, quit, merge and rulers remain
unhandled. Screen modes use the Photoshop `F` cycle;
the preference is UI-only and does not change pixels or document history.
Shortcuts are ignored while a text field, select, or dialog is being edited.
Use `Cmd` on macOS and `Ctrl` on Windows/Linux.

## Tools

Every tool's key is the letter shown on its toolbar badge, in its tooltip and
in its flyout; `src/toolKeys.ts` is the single table behind them, and
`tests/tool-keys.test.mjs` checks that each advertised key reaches its tool
from any other tool. A family key selects the family's first tool, then cycles
through the family on repeated presses; `Shift` cycles backwards. Keys with
`Ctrl`, `Cmd` or `Alt` never select tools.

| Key | PixelForge behavior |
| --- | --- |
| `V` | Move |
| `H` | Hand |
| `Z` | Zoom |
| `R` | Rotate View |
| `Shift+R` | Smudge, Blur and Sharpen: selects the last one used (Smudge at first) from any tool, then cycles Smudge → Blur → Sharpen while one of them is active |
| `I` | Cycle Eyedropper, Color Sampler, Ruler, Note, Audio Annotation and Count |
| `M` | Cycle Rectangular, Elliptical, Single Row and Single Column Marquee |
| `L` | Cycle Lasso, Polygonal Lasso, Magnetic Lasso and Selection Brush |
| `W` | Cycle Selection Brush, Quick Selection and Magic Wand |
| `C` | Cycle Crop, Perspective Crop, Slice and Slice Select |
| `K` | Cycle Frame, Mask Brush, Mask Eraser and Adjustment Brush |
| `S` | Cycle Clone and Pattern Stamp |
| `J` | Cycle Healing, Spot Healing, Patch and Red Eye |
| `Y` | Cycle History Brush and Art History Brush |
| `O` | Cycle Dodge, Burn and Sponge |
| `B` | Cycle Brush, Pencil, Color Replace and Mixer Brush |
| `G` | Cycle Gradient and Fill |
| `E` | Cycle Eraser, Background Eraser and Magic Eraser |
| `P` | Cycle Pen, Freeform Pen and Curvature Pen |
| `A` | Cycle Path Selection and Direct Selection |
| `T` | Cycle Horizontal Type, Vertical Type, Horizontal Type Mask and Vertical Type Mask |
| `U` | Cycle Rectangle, Rounded Rectangle, Ellipse, Line, Polygon and Custom Shape |
| `Q` | Toggle Quick Mask mode |
| `D` | Reset foreground/background to black/white |
| `X` | Swap foreground/background colors |
| `F` | Cycle Standard Screen Mode, Full Screen with Menu and Full Screen |
| `[` / `]` | Decrease/increase brush size (1–5,000 px; proportional steps: 1 px below 10, 5 px below 100, 10/25/50/100/200/500 px for larger brushes) for every painting tool, including Smudge. `Ctrl+[` / `Ctrl+]` are Send Backward / Bring Forward |

Photoshop gives Smudge, Blur and Sharpen no default key; PixelForge keeps
Photoshop's `R` = Rotate View and adds `Shift+R` for that family, which the
toolbar badge shows as `⇧R`. Add/Delete Anchor Point and Convert Point have no
shortcut, as in Photoshop, and are chosen from the Pen flyout. Pen clicks place
path nodes; click the first node after three or more points to close and
commit the editable path layer. Escape cancels an open Pen gesture, a Path
Selection, Convert Point or Direct Selection drag, or an in-progress Rotate
View gesture. Rotate View persists only the viewport angle.

## Commands and view

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+N` | New white document |
| `Cmd/Ctrl+O` | Open image |
| `Cmd/Ctrl+S` | Open the image export dialog |
| `Cmd/Ctrl+Shift+S` | Download an editable project file |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` | Redo |
| `Cmd/Ctrl+Alt+Z` | Edit > Toggle Last State: switch to the previous state; press again to switch back (see below) |
| `Cmd/Ctrl+F` | Search commands |
| `Cmd/Ctrl+Shift+F` | Edit > Fade… |
| `Cmd/Ctrl+Alt+Shift+F` | Select > Find Layers (focuses the Find layers field) |
| `Cmd/Ctrl+,` | Layer > Hide Layers (toggles the active layer's visibility) |
| `Cmd/Ctrl+C` / `Cmd/Ctrl+Shift+C` | Copy Layer / Copy Merged |
| `Cmd/Ctrl+X` / `Cmd/Ctrl+V` | Cut Layer / Paste Layer (or paste a clipboard image when no layer was copied) |
| `Cmd/Ctrl+T` | Free Transform |
| `Cmd/Ctrl+Shift+L` | Auto Tone |
| `Cmd/Ctrl+A` | Select the entire canvas |
| `Cmd/Ctrl+D` or `Cmd/Ctrl+Shift+A` | Deselect |
| `Cmd/Ctrl+I` or `Cmd/Ctrl+Shift+I` | Invert the current selection |
| `Cmd/Ctrl+G` | Put the active layer in a new group |
| `Cmd/Ctrl+Shift+G` | Remove the active layer from its group |
| `Cmd/Ctrl+J` | Duplicate the active layer |
| `Cmd/Ctrl+]` / `Cmd/Ctrl+[` | Bring Forward / Send Backward the selected layers |
| `Cmd/Ctrl+Shift+]` / `Cmd/Ctrl+Shift+[` | Bring to Front / Send to Back the selected layers |
| `Alt+↑` / `Alt+↓` (Layers panel row focused) | Bring Forward / Send Backward that row; add `Shift` for front/back |
| `Delete` / `Backspace` (Layers panel row focused) | Delete that row (or the selection it belongs to) |
| `Delete` / `Backspace` (canvas, with a selection) | Clear the selected pixels of the active raster layer |
| `Shift+F5` | Edit > Fill… dialog |
| `Alt+Backspace` (`Option+Delete` on macOS) | Fill the selection, or the whole layer with no selection, with the foreground colour at 100 % Normal |
| `Ctrl+Backspace` (`Cmd+Delete` on macOS) | Fill the selection, or the whole layer with no selection, with the background colour at 100 % Normal |
| `Cmd/Ctrl+Alt+I` | Open image resize |
| `0` | Fit to screen |
| `1` | Actual size |
| `+` / `-` | Zoom in/out |
| `F` | Cycle Standard Screen Mode, Full Screen with Menu and Full Screen |
| `Escape` | Exit a reduced screen mode, or close an open menu |
| `F6` or `Cmd/Ctrl+.` | Move focus into the active tool's options in the properties sidebar |

The quick fills are also Edit > Fill with Foreground Color and Edit > Fill
with Background Color, so touch devices reach them from the menu. Each is one
undoable step on the active visible, unlocked raster layer. An empty selection
(for example a Lasso drawn entirely off the canvas) fills nothing and shows
"No pixels are selected" (docs/selection-composition-contract.md).

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

## Menu shortcuts match exactly

Every shortcut printed in a menu does what that menu item does, and modifiers
match exactly: `Ctrl+F`, `Ctrl+Shift+F` and `Ctrl+Alt+Shift+F` are three
different commands. Fade…, Find Layers, Hide Layers, Toggle Last State and
Search commands are routed through the same command dispatcher as the menus
(`src/menuShortcuts.ts`), so a command that is disabled for the current
document reports that instead of doing something else. A custom binding from
Edit > Keyboard Shortcuts… takes priority over these built-in keys (except
`Ctrl+F`, which always opens Search commands). `tests/menu-shortcuts.test.mjs`
cross-checks every shortcut label in the menu definitions against the handled
chords, and `tests/browser/shortcuts-audit.spec.ts` presses each fixed one on
desktop and mobile.

Toggle Last State alternates between the state you were on and the one before
it (or the next one when there is nothing to undo); pressing it repeatedly
bounces between those two states instead of stepping further back. Undo,
Redo, a History jump or a new edit starts a fresh toggle from wherever the
document is (`src/toggleLastState.ts`).

Shortcuts operate on the current local draft and remain available without an
account. The foreground/background pair is included in draft and project-file
settings, with `#ffffff` used for older drafts that do not contain a background
color. The retouch flyout groups Smudge, Blur and Sharpen with their visible
icons and remembered active variant; `Shift+R` returns to that variant.
