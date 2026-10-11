# Layer lock contract

`Layer → Lock Layers…` applies one immutable lock operation to the current selected layer set. Legacy frames without `selectedLayerIds` use the active layer; an explicit empty selection remains a no-op. Toggle mode locks the set when any selected layer is unlocked and unlocks it only when every selected layer is already locked.

The command preserves source assets, selection metadata, active-layer state and all other frame fields. A selected layer inside a locked group is rejected and the menu is disabled until the containing group is unlocked. Invalid or stale selection IDs fail closed. The operation is one undoable history commit and is replayable through local action recipes.

Pure tests cover legacy fallback, multi-layer immutability, deterministic modes, toggle semantics, stale selections and locked-group guards. Browser acceptance covers menu activation, panel state, toggle recovery and locked-group disabling on desktop and mobile projects.
