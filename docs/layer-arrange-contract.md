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

