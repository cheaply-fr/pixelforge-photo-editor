# Embedded Smart Object contract

PixelForge supports a bounded local Smart Object model for anonymous, bookmark-safe editing. A Smart Object layer stores an immutable PNG asset reference plus an optional source filename (`kind: "smart-object"`, `asset`, `sourceName`). The source asset is never rewritten by transforms, opacity, blend, layer styles or supported adjustment controls; rendering decodes that source and applies the layer's editable metadata at composite time.

The Layers panel and Layer menu expose **Add smart object**, **New Smart Object…**, **Replace Contents…**, **Link Smart Object Contents** and **Rasterize**. Adding embeds a browser-readable image as a new layer. Replace Contents changes only the asset reference and source label while retaining the layer id, matrix, opacity, blend, styles, mask and adjustments. Selected smart-object layers can be linked locally: they receive a validated `linkId`, share the active source asset, and a later Replace Contents operation updates every linked instance while preserving each instance's transform and layer identity. The link is local draft metadata and never uploads or watches an external file. Rasterize renders the current smart object through the normal pipeline into a raster asset and commits one undoable history entry; the original source remains reachable through Undo/history until local history compaction.

Validation requires a valid UUID asset id, an existing PNG asset with bounded dimensions, an optional valid UUID `linkId`, and a source label no longer than 160 characters. Smart Objects support the common transform, mask, opacity, blend, style and adjustment metadata. Raster-only cleanup metadata (spot healing, patch and content-aware strokes) and editable solid-fill color are rejected for this bounded model. Referenced-asset compaction retains embedded source and mask assets so local drafts and project files remain reopenable.

The model intentionally excludes linked cloud assets, filesystem watches, PSD/PSB round trips, nested Smart Objects, embedded vector/video timelines, filter graphs and operating-system clipboard integration. Those capabilities need separate provider, format, worker and privacy contracts before activation. Unsupported formats still use the existing import disclosure and are not silently treated as editable Smart Objects.

Evidence gate:

- `tests/smart-objects.test.mjs` covers validation, malformed metadata, bounds, asset compaction and JSON round trips.
- `tests/browser/smart-objects.spec.ts` runs on desktop and mobile, asserting add/replace/rasterize, representative pixels, transform/source retention, linked-instance replacement, undo and reload persistence.
- Typecheck, lint, production build, full pure tests and focused browser tests must pass before merge; deployment and live revision checks remain separate release evidence.
