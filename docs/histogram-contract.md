# Histogram analysis contract

`Image → Analysis → Histogram` computes a bounded local histogram from the
currently rendered document composite. The dialog is read-only: opening or
closing it does not add a history entry, mutate layers, or upload pixels.

The renderer supplies RGBA pixels to `buildHistogram`. Fully transparent
samples are excluded from RGB and luminance bins because their RGB bytes are
not meaningful; partially transparent samples count as one visible sample and
their alpha bytes are included in the reported alpha total. Luminance uses the
Rec. 709 coefficients and is rounded into 256 bins. The dialog exposes
luminance, red, green and blue channels, plus visible-pixel count, mean
luminance, range and alpha total.

The implementation rejects empty or malformed RGBA buffers and keeps the
histogram at 256 bins per channel. It is intentionally a document analysis
approximation rather than Photoshop's profile-aware, print-proofing or
histogram-cache implementation. Source assets, metadata, history and project
serialization remain unchanged. Desktop and mobile browser coverage verifies
the menu entry, channel switching and Escape dismissal; pure tests cover
transparent pixels, statistics and malformed input.
