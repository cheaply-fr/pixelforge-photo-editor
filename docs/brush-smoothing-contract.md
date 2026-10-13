# Brush smoothing contract

Brush, Pencil and Eraser expose a persisted **Smoothing** setting from 0 to
100%. Pointer samples are stabilized locally before raster stamps are placed;
the response is bounded, deterministic and never overshoots the raw sample.
Zero is an exact raw-pointer path, and the maximum retains a small responsive
step so a finite drag cannot freeze at its first point. The source asset stays
immutable until pointer-up commits one undoable raster edit.

The setting is part of the existing validated draft settings, defaults to zero
for older documents, and remains anonymous/offline. Pure tests cover clamping,
determinism and directional bounds; the existing browser brush suite covers
desktop/mobile pointer strokes, persistence and source-safe commits. This is a
bounded local stabilizer, not a claim of Photoshop's full predictive stroke
engine or hardware-specific latency parity.
