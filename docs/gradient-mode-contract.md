# Gradient mode contract

The Gradient tool supports persisted **Linear** and **Radial** geometry. Both
use the active foreground colour fading to transparent, preserve the original
raster asset until one undoable pointer-up commit, and remain local to the
browser. Radial mode uses the drag start as its centre and the drag distance as
its bounded radius; linear mode retains the existing start-to-end direction.

The mode is validated in project settings, defaults to Linear for older drafts,
and is covered by desktop/mobile UI, pixel-change, reload and portable-project
round-trip tests. This contract does not claim Photoshop's full gradient-stop,
noise, dithering, or gradient-map feature set.
