# Gradient mode contract

The Gradient tool supports persisted **Linear**, **Radial**, **Angle**, **Reflected** and
**Diamond** geometry (Angle and Diamond are described below). The
**Gradient end** setting can keep the default transparent endpoint or use the current
background colour. All three modes preserve the original raster asset until one
undoable pointer-up commit and remain local to the browser. Radial mode uses the
drag start as its centre and the drag distance as its bounded radius; linear mode
retains the existing start-to-end direction; reflected mode puts the foreground
colour at both ends and uses the selected endpoint colour at the midpoint unless
an authored midpoint colour is enabled. Reverse swaps the start and end colours
for Linear and Radial modes; Reflected remains symmetric.

The mode and endpoint are validated in project settings, default to Linear and
transparent for older drafts, and are covered by desktop/mobile UI, pixel-change,
reload and portable-project round-trip tests. Midpoint colours are bounded
six-digit RGB values and default to disabled for older drafts; its position is
bounded from 1% to 99% and defaults to 50%. Dither is a
bounded deterministic RGB variation applied only to nontransparent pixels and
defaults to zero. Reverse defaults to false for older drafts. Up to six ordered
interior colour stops are supported for Linear and Radial modes, bounded to
1%-99%, validated for strict ordering, persisted in local/project drafts, and
committed as one undoable raster operation. The legacy midpoint control remains
the fallback when no authored stop list exists; Reflected mode remains symmetric
and uses its legacy midpoint behaviour. This contract does not claim Photoshop's
full gradient-map or Adobe algorithm parity. A separate deterministic RGB Noise
control is bounded to 0%-100%, skips transparent pixels, preserves alpha, and
defaults to zero for older drafts.

## Angle and Diamond (toolbar audit I-23, 2026-11)

`gradientMode` also accepts `angle` and `diamond` (older drafts keep their
value; unknown values still fail validation). Canvas 2D has no native
equivalent, so both are rendered per pixel from a 256-entry lookup row drawn
with the same colour stops as Linear, so stops, midpoint, Reverse and the
transparent end behave identically (`src/gradientShapes.ts`). Angle sweeps a
full turn counter-clockwise on screen around the drag start, beginning at the
drag direction (a hard seam lies along it). Diamond uses `|u| + |v|` over the
drag length, where u and v are the offsets along and across the drag, so the
square is rotated to the drag with a corner at its end. Noise, Dither, Mode,
Opacity, selection confinement and the reduced live preview apply as for the
other types. Evidence: `tests/audit-retouch.test.mjs` and
`tests/browser/audit-retouch-paint.spec.ts` on desktop and mobile.

## Selection confinement

With an active selection, the Gradient and Paint Bucket tools change pixels
only inside it, as in Photoshop. The edit is rendered over the layer as
before and then blended back with the original pixels by the selection
coverage in the layer's own pixel space (the same mask the Brush uses), so a
feathered selection fades the edit in without darkening transparent edges
(the blend is premultiplied). A Paint Bucket click outside the selection
changes nothing and says "Click inside the selection to fill". Without a
selection both tools behave exactly as before.

Evidence: `src/selectionClip.ts` with `tests/selection-clip.test.mjs`
(full/zero/partial coverage, premultiplied edges, immutability, size checks)
and `tests/browser/selection-clipped-fills.spec.ts` on desktop and mobile
(rectangular gradient with undo, feathered edge, bucket inside/outside, and an
unchanged no-selection gradient). The three selection cases fail on the code
before this change.

## Transparent end and repeated gradients (2026-11-07)

With the Transparent end, the colour adjacent to the transparent stop fades
to alpha 0 in that same colour, so a foreground-to-transparent gradient no
longer passes through transparent white and leaves a grey fringe (#181,
merged `8def856`; `src/gradientStops.ts` with
`tests/gradient-transparent-end.test.mjs` and
`tests/browser/gradient-transparent-end.spec.ts`).

A second gradient on the same layer composites over the existing pixels: that
is the **Normal** mode and remains the default.

## Gradient mode and opacity (2026-11-07)

**Gradient mode** chooses how the gradient combines with the layer:
**Normal** (paint over, the previous behaviour), **Replace** (the layer's pixels
are discarded and become the gradient, including its transparent end), and the
separable blend modes Multiply, Screen, Overlay, Soft light, Hard light, Colour
dodge, Linear dodge (add), Colour burn, Darken, Lighten, Difference and
Exclusion, using the W3C Compositing formulas followed by source-over (over
transparent pixels a blend mode shows the gradient colour). **Gradient
opacity** (1–100%) scales the gradient's alpha. The gradient is rendered on its
own surface first, so Noise and Dither now vary only the gradient's pixels, not
the existing layer pixels beneath a transparent end. Selection confinement is
unchanged: Replace only replaces inside the selection.

Both settings persist (`gradientBlend`, `gradientOpacity`), default to Normal
and 100% for older drafts, and reject invalid values. Evidence:
`src/gradientBlend.ts` with `tests/gradient-blend.test.mjs`, and
`tests/browser/brush-gradient-options.spec.ts` (Normal vs Replace on a painted
layer, Screen at 50% brightening existing paint, reload persistence) on
desktop and mobile. The modes are local approximations, not Photoshop's
algorithms.

## Live preview while dragging (fix wave 2 polish, 2026-11-07)

Pointer-down decodes the layer and samples the selection once, in the
background. While dragging, the gradient for the latest pointer position is
rendered over the layer (Mode, Opacity, Noise, Dither and selection
confinement included) and shown through the shared preview scheduler from
#190: at most one composite per animation frame with one in flight, so fast
drags never queue renders. Pointer-up renders the same function for the
release point and commits one undo step; pointer cancel or a document change
restores the unchanged frame without a history entry. The preview and the
commit share `renderGradientBuffer`, so the last preview frame equals the
committed pixels. Evidence: `tests/browser/retouch-brush-polish.spec.ts` on
desktop and mobile (mid-drag pixels follow the pointer and update as it moves,
nothing is committed before release, the committed row equals the last
preview, one Undo restores the layer, a touch pointercancel leaves no
preview).

**Large layers.** The preview renders only the region the gradient can change
— the selection's bounding box, or the whole layer — and, when that region
exceeds 1.5 MP, at a uniform reduced scale within that budget
(`src/gradientPreview.ts`). The layer region and selection coverage are
downscaled once at pointer-down; each frame renders the gradient there,
upscales it into one of two full-size override surfaces that already hold the
untouched pixels outside the region, and hands that to the scheduler. A
10.8 MP layer therefore processes about 1.5 MP per preview frame. Small
layers (≤ 1.5 MP) and selections whose box fits the budget keep the exact
full-resolution preview. Pointer-up always renders and commits at full
resolution, so the committed pixels may differ slightly from a reduced preview
(within a few levels in the browser test) and keep the exact selection edge.
Noise and Dither are previewed at the reduced scale. The full-document
composite of each preview frame is unchanged. Evidence:
`tests/retouch-preview-cache.test.mjs` (budget, scale, aspect, selection
regions, point and mask mapping) and the 2400×1000 case in
`tests/browser/retouch-brush-polish.spec.ts` (the preview stays inside a
rectangular selection, matches the commit within 8 levels, commit keeps the
selection edge, one Undo).
