# Image mode contract

`Image → Mode` toggles the bounded local document mode between `RGB Color` and
`Grayscale`. The mode is a frame property, so it is undoable, survives local
draft reloads and portable project files, and does not rewrite source asset
bytes. Rendering applies Rec. 709 luminance to the composed RGBA output while
preserving every alpha value; switching back to RGB reveals the original source
colours because the conversion is nondestructive.

Legacy frames without `colorMode` normalize to RGB. Unknown values fail closed
at the frame-validation boundary. CMYK, Lab, indexed colour, bit-depth changes
and profile/demosaicing conversions remain outside this local contract.

Pure pixel and validation coverage is in `tests/color-mode.test.mjs`.
Desktop/mobile menu, undo, reload, project round-trip, alpha and source-asset
coverage is in `tests/browser/color-mode.spec.ts`.
