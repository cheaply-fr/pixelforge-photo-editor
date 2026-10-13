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
full gradient noise or gradient-map feature set.
