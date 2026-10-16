# Image Adjustments chooser contract

`Image → Adjustments` is an accessible local family chooser for PixelForge's
existing nondestructive adjustment controls. It exposes Levels, Curves,
Hue/Saturation, Color Balance, and Sharpen and Noise as explicit choices and
routes the selected command through the same document guards and inspector
controls as the direct menu entries. Opening the chooser is read-only; the
chosen adjustment remains source-safe, undo-aware, and local to the selected
layer.

The chooser is deliberately a bounded menu-family surface rather than a claim
of Photoshop's full adjustment-layer dialog or colour-management parity. It
does not upload pixels or create a second adjustment implementation. Desktop
and mobile acceptance covers the family entry, dialog semantics, selection and
close behavior; the individual adjustment suites remain authoritative for
pixel, persistence, lock and round-trip behavior.
