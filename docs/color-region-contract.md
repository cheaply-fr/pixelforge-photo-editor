# Colour region contract (Magic Wand and Fill)

Magic Wand and Fill (Paint Bucket) share one colour-region matcher,
`colorRegionMask` in `src/colorRegion.ts`. A pixel matches when each RGBA
channel lies within **Tolerance** (0–255, the shared `colorTolerance`
setting, default 24) of the pixel under the click.

Both tools show their options in the sidebar Tool options section:

- **Color tolerance** slider (shared with Quick Selection, Color Replace and
  the erasers).
- **Contiguous** (default on): grow a 4-connected region from the click.
  Off selects or fills every matching pixel of the sampled image.
- **Sample All Layers** (default off): sample the merged visible document
  instead of the active layer. Fill still writes only into the active raster
  layer (the frame-space region is resampled through the layer placement)
  and stays confined to an active selection.

`colorRegion.contiguous` and `colorRegion.sampleAllLayers` persist in
Settings. Older drafts omit `colorRegion` and load as contiguous, active layer
only (`normalizeColorRegionSettings`). Fill writes one history entry; Magic
Wand composes with the selection mode like other selection tools and reports
the options used in its status message. Anti-aliasing is not applied: wand
and fill edges are hard pixel edges.
