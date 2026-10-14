# TIFF composite import contract

PixelForge accepts a bounded subset of classic TIFF at the import boundary.
8-bit chunky RGB/RGBA and grayscale/alpha images are supported with raw or
PackBits strips, little- or big-endian headers, one image directory and a
maximum of 16 megapixels. BitsPerSample must declare one 8-bit value per
channel. The None and Horizontal differencing predictors are supported, and
TIFF orientation values 1 through 8 are normalized into the returned raster.
RGBA and grayscale/alpha files must explicitly declare associated or
unassociated alpha; associated RGB/gray samples are unpremultiplied safely.
The parser rejects BigTIFF, tiled or planar data, palette/CMYK/floating-point
samples, unsupported compression, malformed strip tables and oversized images
before the current draft changes.

The decoded result is a new flattened editable raster asset. TIFF metadata,
profiles, pages, layers, masks, paths and the original container are not
retained. Transparent RGB is normalised by the regular raster import boundary
and alpha is preserved. The same decoder serves open-image, image-layer,
smart-object and local batch input. Unsupported or malformed files fail closed
with the existing draft, history and pixels unchanged.

Pure tests cover endian variants, raw and PackBits pixel output, grayscale
photometric inversion, horizontal prediction, orientation normalization,
associated-alpha handling, malformed input, unsupported compression and the
16-megapixel guard. Desktop and mobile acceptance covers real TIFF input,
representative pixels, flattening disclosure and unchanged-draft failure.
