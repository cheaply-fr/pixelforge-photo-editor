# PSD/PSB composite import contract

PixelForge accepts a bounded subset of Photoshop documents at the import
boundary. PSD (version 1) and PSB (version 2) files are decoded only when
their flattened composite is 8-bit RGB/RGBA or 8-bit grayscale/alpha. Raw
channel data and PackBits RLE are supported. The decoder rejects malformed,
ZIP-compressed, other colour modes, other bit depths, zero-sized and larger
than 16-megapixel documents before changing the current draft.

The result is a new editable raster asset. Layer records, masks, adjustment
layers, smart-object links, ICC profiles, guides, text, vector paths and
container metadata are intentionally discarded. A visible notice says that
the import is flattened and records the lost structure. Transparent RGB is
normalised by the ordinary raster import boundary; alpha is preserved.

The same decoder is used for a new raster document, an added image layer and
an embedded smart object. Unsupported or malformed input fails closed and
leaves the current document, history and pixels unchanged. This is bounded
flattened compatibility, not layered PSD/PSB round-trip support.

Pure tests cover raw RGB, RLE RGB, grayscale/alpha, malformed headers,
unsupported compression and the 16-megapixel guard. Desktop and mobile
acceptance covers real file input, representative RGB/alpha pixels, the
flattening disclosure, and unchanged-draft failure behavior.
