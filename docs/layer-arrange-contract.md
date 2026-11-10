# Layer Arrange contract

PixelForge stores `Frame.layers` from bottom to top. Layer Arrange operates on
the persisted `selectedLayerIds` set (or the active layer for legacy frames)
and never bakes source pixels, transforms, masks, styles or adjustments.

The four root-level commands are:

- **Bring to Front** removes the selected layers and appends them in their
  existing stack order.
- **Bring Forward** moves every selected layer one unselected stack position
  toward the top while preserving the selected layers' relative order.
- **Send Backward** moves every selected layer one unselected stack position
  toward the bottom while preserving relative order.
- **Send to Back** prepends the selected layers in their existing stack order.

Clipping groups (a base and the consecutive layers clipped to it) are kept
intact. A selected base expands the plan to its whole clipping group. A
Bring Forward / Send Backward step of a layer outside a clipping group moves
past the entire group in one step instead of landing between the base and
its clipped layers; a clipped layer moving inside its own group still steps
one layer, and leaving the group releases only that layer. The panel's
Raise/Lower buttons use the same step rule for the active layer. See
`clipping-mask-contract.md`.

Keyboard: Ctrl/Cmd+] is Bring Forward, Ctrl/Cmd+[ Send Backward,
Ctrl/Cmd+Shift+] Bring to Front and Ctrl/Cmd+Shift+[ Send to Back (matched by
physical key, so layouts where Shift changes the bracket character still
work). With a Layers panel row focused, the same keys (and Alt+ArrowUp /
Alt+ArrowDown, plus Shift for front/back) arrange that row (or the selection
it belongs to), keep focus on it and announce the new position in the panel's
live region ("Paint 3 moved above Paint 2, 4 of 9"). The Layers panel also
offers drag-and-drop and a row menu with the four commands; drag-and-drop has
its own planner (`src/layerDragReorder.ts`), documented in
`layers-panel-interaction-contract.md`.

The planner rejects an absent/empty selection, missing or duplicate IDs, and
locked layers. Selecting any folder member expands the plan to the complete
folder block, preserving member order and the folder's isolated blend/opacity
semantics while moving it atomically. Missing folder metadata is rejected
fail-closed. A command that is already at its requested boundary is a
validated no-op and does not create a history entry. Successful moves preserve
the active layer and selected IDs, and are persisted through normal local
draft/project history and undo.

Pure planner/apply tests cover single and multiple selections, grouped-block
moves, stack-boundary no-ops, legacy active-layer fallback, immutable input
frames and every guard.
The desktop/mobile layer acceptance suite covers menu and panel invocation,
selection/order persistence, undo and reload, plus locked/grouped disabled
states.

