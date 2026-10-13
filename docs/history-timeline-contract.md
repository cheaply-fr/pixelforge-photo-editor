# History timeline contract

The inspector exposes a **History** panel backed by the same bounded immutable
frame stack used by Undo and Redo. Each entry identifies its position, active
layer, dimensions and layer count. The panel never stores generated pixels or
creates a second history model.

Selecting an earlier entry travels to that frame through the normal document
navigation boundary. The restored frame remains local, and a subsequent edit
starts a new branch by discarding only the abandoned redo tail, as before. The
current entry is disabled, invalid indexes are rejected, and the panel remains
usable with keyboard focus and a narrow mobile inspector.

Pure tests cover stable summaries, current-index normalization and invalid
restore targets. Desktop and mobile browser coverage verifies the visible
timeline, a new committed frame, restore navigation and the absence of a
local-draft conflict.
