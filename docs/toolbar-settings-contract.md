# Toolbar settings contract

`Edit > Toolbar…` exposes the compact palette column preference. `Auto` keeps
the responsive default (two columns at normal widths and three on wide editor
viewports); explicit two- or three-column choices are stored in local browser
preferences and restored on reload. Narrow mobile viewports cap the visual
layout at two columns to preserve touch targets, while the selected preference
remains visible and reversible.

The palette still derives its categories from the canonical tool taxonomy, so
the setting never inserts placeholder cells or duplicates subtools. It does
not upload settings or alter document pixels, layer history, drafts, or
projects. Desktop and mobile tests cover activation, persistence, and the
no-empty-slot contract. User-authored tool ordering, visibility, and shortcut
rebinding remain separate preference contracts.
