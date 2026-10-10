# Merge Visible contract

`Layer > Merge Visible` commits one reversible raster layer for the effective
visible composite. The operation renders the current frame through the normal
Canvas compositor, so transforms, opacity, blend modes, masks, adjustments,
styles and isolated group blending are represented in the RGBA result.

The pure planner (`src/layerMergeVisible.ts`) resolves the flat bottom-to-top
stack deterministically. A layer is a source when it is visible and either is
at the document root or belongs to an existing visible group. Hidden layers,
hidden groups and unrelated metadata remain in the frame. The replacement is
inserted at the highest visible source slot and is a root layer, preventing a
folder's opacity or blend mode from being applied twice. Empty groups are
removed; groups that still contain hidden members are retained.

Explicit artboard membership is repaired without widening an artboard's scope:
an artboard containing every visible source receives the replacement at the
first source position, a partial membership drops its removed source IDs but
does not receive the full-document composite, and an artboard with no source
membership is cloned unchanged. Legacy artboards with omitted `layerIds` keep
their full-canvas meaning.

Planning and applying never mutate the input frame or source layer records.
The page command captures both the history frame pointer/index and the
document revision before awaiting rendering; if another edit, selection,
undo/redo travel or import owns the document when rendering finishes, the
result is discarded before a raster asset or history entry is created.

Focused evidence lives in `tests/layer-merge-visible.test.mjs` and
`tests/browser/merge-visible.spec.ts`. The pure suite covers stack/group/
hidden resolution, root replacement, artboard repair and source immutability;
the browser suite runs in the configured desktop and mobile projects and
covers RGBA/alpha preservation, menu enablement, grouped compositing,
undo/redo, local reload and project export.
