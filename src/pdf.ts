/**
 * Bounded single-page PDF composite decoder.
 *
 * PixelForge only imports the PDF shape it emits itself: one DeviceRGB,
 * 8-bit JPEG image XObject on one page. The JPEG remains the browser-decoded
 * raster source; page structure, vectors, text, fonts, profiles, metadata and
 * additional pages are intentionally rejected instead of being flattened by
 * an unknown browser PDF viewer.
 */

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_DIMENSION = 16_000;

export type PdfComposite = {
  width: number;
  height: number;
  jpeg: Uint8Array;
};

function ascii(input: Uint8Array): string {
  return new TextDecoder('latin1').decode(input);
}

function fail(message: string): never {
  throw new Error(message);
}

function readNumber(dictionary: string, key: string): number {
  const match = dictionary.match(new RegExp(`/${key}\\s+(\\d+)\\b`));
  if (!match) fail(`PDF image is missing ${key}`);
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) fail(`PDF ${key} is invalid`);
  return value;
}

/** Decode the one-image PDF composite emitted by `pdfExport.ts`. */
export function decodePdfComposite(input: Uint8Array): PdfComposite {
  if (!(input instanceof Uint8Array) || input.byteLength > MAX_INPUT_BYTES)
    fail('PDF file exceeds 64 MB');
  if (input.byteLength < 8 || !ascii(input.subarray(0, 7)).startsWith('%PDF-1.'))
    fail('Not a supported PDF file');
  const text = ascii(input);
  if (!/%%EOF\s*$/.test(text)) fail('PDF is truncated');

  const imageToken = '/Subtype /Image';
  const imageOffset = text.indexOf(imageToken);
  if (imageOffset < 0) fail('PDF has no supported JPEG image page');
  if (text.indexOf(imageToken, imageOffset + imageToken.length) >= 0)
    fail('PDF must contain exactly one image page');
  const dictionaryStart = text.lastIndexOf('<<', imageOffset);
  if (dictionaryStart < 0) fail('PDF image dictionary is malformed');
  const dictionaryEnd = text.indexOf('>>', imageOffset);
  if (dictionaryEnd < 0) fail('PDF image dictionary is truncated');
  const dictionary = text.slice(dictionaryStart, dictionaryEnd + 2);
  if (!/\/Type\s+\/XObject\b/.test(dictionary)) fail('PDF image object is malformed');
  if (!/\/ColorSpace\s+\/DeviceRGB\b/.test(dictionary))
    fail('Only DeviceRGB PDF images are supported');
  if (!/\/BitsPerComponent\s+8\b/.test(dictionary))
    fail('Only 8-bit PDF images are supported');
  if (!/\/Filter\s+\/DCTDecode\b/.test(dictionary))
    fail('Only JPEG PDF images are supported');
  const width = readNumber(dictionary, 'Width');
  const height = readNumber(dictionary, 'Height');
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS)
    fail('PDF image exceeds 16 megapixels');
  const length = readNumber(dictionary, 'Length');

  const streamToken = text.indexOf('stream', dictionaryEnd + 2);
  if (streamToken < 0) fail('PDF image stream is missing');
  let dataStart = streamToken + 'stream'.length;
  if (input[dataStart] === 0x0d && input[dataStart + 1] === 0x0a) dataStart += 2;
  else if (input[dataStart] === 0x0a || input[dataStart] === 0x0d) dataStart += 1;
  else fail('PDF image stream delimiter is malformed');
  const dataEnd = dataStart + length;
  if (dataEnd > input.length) fail('PDF image stream is truncated');
  const jpeg = input.slice(dataStart, dataEnd);
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
    fail('PDF image stream is not a JPEG');
  const endStream = text.indexOf('endstream', dataEnd);
  if (endStream < 0) fail('PDF image stream terminator is missing');
  if (text.slice(dataEnd, endStream).replace(/[\r\n]/g, '').trim() !== '')
    fail('PDF image stream has unexpected trailing bytes');
  return { width, height, jpeg };
}
