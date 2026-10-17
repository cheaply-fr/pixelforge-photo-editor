/**
 * Bounded flattened PSD composite encoder.
 *
 * The output is intentionally a simple Photoshop-compatible RGB document with
 * one composite image and no layer/mask, profile or metadata sections. PixelForge
 * keeps the editable .pixelforge project as the lossless document format.
 */

export const PSD_EXPORT_MIME = 'image/vnd.adobe.photoshop';
export const PSD_EXPORT_MAX_PIXELS = 16_000_000;
export const PSD_EXPORT_MAX_DIMENSION = 30_000;

function validDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= PSD_EXPORT_MAX_DIMENSION;
}

/** Encode an RGBA composite as an 8-bit RGB PSD with an alpha channel. */
export function encodePsdCompositePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Blob {
  if (!validDimension(width) || !validDimension(height))
    throw new Error('PSD export dimensions are outside the supported range.');
  const pixelCount = width * height;
  if (pixelCount > PSD_EXPORT_MAX_PIXELS)
    throw new Error('PSD export is limited to 16 megapixels.');
  if (pixels.length !== pixelCount * 4)
    throw new Error('PSD export pixels do not match the document dimensions.');

  // Header (26), three empty sections (12), compression (2), four raw planes.
  const bytes = new Uint8Array(40 + pixels.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x38425053); // 8BPS
  view.setUint16(4, 1); // PSD; PSB is deliberately not emitted here.
  view.setUint16(12, 4); // RGB + alpha channels
  view.setUint32(14, height);
  view.setUint32(18, width);
  view.setUint16(22, 8); // 8 bits/channel
  view.setUint16(24, 3); // RGB colour mode
  // Color mode data, image resources and layer/mask sections are all empty.
  view.setUint16(38, 0); // raw image data (no PackBits)

  let cursor = 40;
  for (let channel = 0; channel < 4; channel += 1) {
    for (let index = channel; index < pixels.length; index += 4)
      bytes[cursor++] = pixels[index];
  }
  return new Blob([bytes], { type: PSD_EXPORT_MIME });
}

/** Read a canvas composite and encode it without copying source metadata. */
export function encodePsdComposite(image: HTMLCanvasElement): Blob {
  const context = image.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('PSD export is unavailable in this browser.');
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return encodePsdCompositePixels(imageData.data, image.width, image.height);
}
