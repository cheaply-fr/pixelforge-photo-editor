# Gradient mode contract

The Gradient tool supports persisted **Linear**, **Radial** and **Reflected** geometry. The
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
preview). On very large layers each preview frame still re-renders the whole
layer, so the preview frame rate drops with layer size.
