# Menu visibility preference contract

**Edit → Menus…** provides one bounded workspace preference: show or hide
commands that are explicitly disabled because they belong to a later roadmap
stage. The default keeps those entries visible as a capability map. Hiding
them removes only the disabled roadmap entries and adjacent separator noise;
working commands, their enabled/disabled state for the current document, the
command search palette and the document model are unchanged.

The preference is versioned JSON in browser `localStorage`, independent of
drafts and private cloud projects. Unknown versions and malformed values fail
closed to the default. Applying the preference never mutates history, layers,
pixels or project files. The desktop/mobile acceptance test covers hiding,
reload persistence, reopening the dialog and restoring the default.
