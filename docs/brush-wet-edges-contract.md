# Brush Wet Edges contract

Brush, Pencil and Eraser expose a persisted **Wet edges** amount from 0 to
100%. It applies a deterministic radial opacity falloff that keeps the tip
edge at full strength while slightly reducing the centre, producing a bounded
edge-weighted dab without hidden state or network work.

The setting is validated in project settings, survives local/project round
trips, is included in the regular source-safe stamp path and is covered by
pure mask/persistence tests plus desktop/mobile browser acceptance. Amount 0
is an exact identity. This is a predictable local approximation; it does not
claim Photoshop's stateful wet-media accumulation, bristle physics or pigment
mixing.
