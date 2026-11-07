# Undo history purge contract

`Edit → Purge Undo History…` is an explicit local memory-control action. The
confirmation dialog keeps the current frame and clears all earlier undo and
redo snapshots; it does not flatten layers, remove assets, alter the document
name, or delete the local draft. The retained frame is validated through the
normal `commit(..., replace=true)` boundary, so the current document remains
editable and project export contains one valid history entry.

The command is disabled when no prior snapshot exists or while Quick Mask is
active. Pure tests cover immutable planning and invalid indexes. Desktop/mobile
acceptance covers confirmation, disabled Undo state, current dimensions, and a
portable project round trip. Purging is irreversible for the discarded history
states; the explicit confirmation is required before it runs.

## History capacity

The in-memory undo/redo stack (`src/historyBudget.ts`) keeps up to
`HISTORY_MAX_STEPS` = 240 states and a device-aware budget of referenced image
data: 320 MiB on desktop, 128 MiB on mobile or devices reporting ≤ 4 GB
`navigator.deviceMemory`, 96 MiB at ≤ 2 GB. Each distinct asset is counted once
by its data-URL length (its retained heap size). When a commit exceeds the
budget the oldest undo states are released first; redo states are released
only after every undo state is gone, and the current frame is always kept. A
new edit after undo still discards the abandoned redo branch. A current frame
referencing more than 64 MiB (`DOCUMENT_MAX_ASSET_BYTES`) is refused with an
explanation that names the device budget.

Local drafts, duplicates, cloud saves and portable projects persist only the
window around the current state that fits 24 states (the draft schema limit),
the 64 MiB referenced-asset cap and 768 assets (`selectPersistedHistory`,
nearest undo/redo neighbours first). Format 3 drafts store assets by content
hash, so keeping a full window costs one new asset record per edit. So a
larger in-memory history cannot make a local save fail. The History panel marks
the remaining states as memory-only; they are not restored after reload. The
Purge dialog states the capacity and releases that memory immediately.

Assets remain base64 PNG data URLs. Moving history assets to `Blob`s would cut
retained bytes by ~25% but touches every consumer of `Asset.url` (render
worker, validation, drafts, cloud, portable bundles) and is left for the
content-addressed draft storage work.
