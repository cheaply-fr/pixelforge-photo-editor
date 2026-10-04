# Local action recipe contract

PixelForge action recipes are short, local command sequences for repeatable
editing. They are available to anonymous users and do not contain source
pixels, object URLs, EXIF/GPS metadata, cloud tokens or Marketplace identity.
Recipes are stored separately from the editable `.pixelforge` document in
browser localStorage under a versioned envelope (`pixelforge.actions.v1`), so
clearing recipes cannot mutate a draft and a malformed recipe cannot prevent
the editor from opening.

## Model and limits

Each recipe has a stable id, bounded name, timestamps, and at most 64 ordered
steps. A step contains a stable id, an allow-listed command id, a display
label, and at most 16 scalar parameters. The serialized envelope is version 1
and is capped at 256 KB. Unknown keys, duplicate ids, control characters,
invalid dates, unsupported commands, non-finite numbers and oversized values
are rejected before adoption.

The first allow-listed commands are deterministic local corrections, filter
effects, selection composition, mask toggles, flips/rotations and merge or
flatten commands. Dialog-opening commands, file intake, exports, account
operations, network requests and `noop` are never recorded. A command remains
subject to the normal active-layer, lock, visibility and Quick Mask guards
when it is replayed.

## Recording and replay

Edit → Action recipes opens the recorder. Starting a recipe creates an empty
record, and successful command dispatches append immutable steps until the
user stops recording. Replay runs steps in order through the existing editor
command dispatcher, preserving the usual undo/history and source-asset
contracts. Replay stops at the first rejected step and reports its index and a
bounded error; cancellation is checked before every step. A recipe with no
steps cannot run. Deleting a recipe affects only this browser's recipe store.

This is a local deterministic recipe foundation, not Photoshop Actions
compatibility. Folder watchers, parameterized batch jobs, OS automation,
recorded pointer gestures and synchronized cloud recipes remain later work.

## Required evidence

Pure tests cover allow-listing, immutability, scalar and envelope bounds,
duplicate-id rejection, serialization round trips, removal/rename, failure
isolation and cancellation. Desktop and mobile browser tests cover opening the
surface, recording a filter command, local persistence after reload, replay,
deletion and closing without document mutation. The full protected CI and live
revision gates remain required before release claims.
