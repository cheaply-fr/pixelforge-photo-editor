/**
 * Bounded PSD/PSB composite decoder.
 *
 * This intentionally reads only the flattened composite image. Photoshop
 * layer records, masks, adjustment metadata, profiles and the original
 * container are not imported into the editable document.
 */

const MAX_PIXELS = 16_000_000;
const MAX_DIMENSION = 16_000;

type Reader = { bytes: Uint8Array; offset: number };

function ensure(reader: Reader, length: number): void {
  if (
    !Number.isInteger(length) ||
    length < 0 ||
    reader.offset + length > reader.bytes.length
  )
    throw new Error('PSD data is truncated');
}

function readU8(reader: Reader): number {
  ensure(reader, 1);
  return reader.bytes[reader.offset++];
}

function readU16(reader: Reader): number {
  return (readU8(reader) << 8) | readU8(reader);
}

function readU32(reader: Reader): number {
  return (
    readU8(reader) * 0x1000000 +
    (readU8(reader) << 16) +
    (readU8(reader) << 8) +
    readU8(reader)
  );
}

function skip(reader: Reader, length: number): void {
  ensure(reader, length);
  reader.offset += length;
}

function readBytes(reader: Reader, length: number): Uint8Array {
  ensure(reader, length);
  const result = reader.bytes.subarray(reader.offset, reader.offset + length);
  reader.offset += length;
  return result;
}

function signature(reader: Reader, expected: string): void {
  const actual = String.fromCharCode(...readBytes(reader, expected.length));
  if (actual !== expected) throw new Error('Not a PSD/PSB file');
}

function decodePackBits(encoded: Uint8Array, width: number): Uint8Array {
  const output = new Uint8Array(width);
  let source = 0;
  let target = 0;
  while (source < encoded.length && target < width) {
    const control = encoded[source++];
    if (control <= 127) {
      const count = control + 1;
      if (source + count > encoded.length || target + count > width)
        throw new Error('PSD PackBits row is malformed');
      output.set(encoded.subarray(source, source + count), target);
      source += count;
      target += count;
    } else if (control !== 128) {
      const count = 257 - control;
      if (source >= encoded.length || target + count > width)
        throw new Error('PSD PackBits row is malformed');
      output.fill(encoded[source++], target, target + count);
      target += count;
    }
  }
  if (target !== width) throw new Error('PSD PackBits row is incomplete');
  return output;
}

function readRawPlane(
  reader: Reader,
  width: number,
  height: number,
): Uint8Array {
  const plane = new Uint8Array(width * height);
  plane.set(readBytes(reader, plane.length));
  return plane;
}

function readRlePlane(
  reader: Reader,
  width: number,
  height: number,
  rowLengths: Uint16Array,
): Uint8Array {
  const plane = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const decoded = decodePackBits(readBytes(reader, rowLengths[row]), width);
    plane.set(decoded, row * width);
  }
  return plane;
}

export type PsdComposite = {
  width: number;
  height: number;
  channels: number;
  compression: 'raw' | 'rle';
  pixels: Uint8ClampedArray;
};

/** Decode a PSD/PSB 8-bit RGB or grayscale flattened composite. */
export function decodePsdComposite(input: Uint8Array): PsdComposite {
  const reader: Reader = { bytes: input, offset: 0 };
  signature(reader, '8BPS');
  const version = readU16(reader);
  if (version !== 1 && version !== 2)
    throw new Error('Unsupported PSD version');
  skip(reader, 6);
  const channels = readU16(reader);
  const height = readU32(reader);
  const width = readU32(reader);
  const depth = readU16(reader);
  const colorMode = readU16(reader);
  if (
    !width ||
    !height ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    throw new Error('PSD image exceeds 16 megapixels');
  if (depth !== 8) throw new Error('Only 8-bit PSD composites are supported');
  const rgb = colorMode === 3 && (channels === 3 || channels === 4);
  const gray = colorMode === 1 && (channels === 1 || channels === 2);
  if (!rgb && !gray)
    throw new Error('Only 8-bit RGB or grayscale PSD composites are supported');
  skip(reader, readU32(reader));
  skip(reader, readU32(reader));
  skip(reader, readU32(reader));
  const compressionValue = readU16(reader);
  if (compressionValue !== 0 && compressionValue !== 1)
    throw new Error('PSD compression is not supported');
  let planes: Uint8Array[];
  if (compressionValue === 0) {
    planes = Array.from({ length: channels }, () =>
      readRawPlane(reader, width, height),
    );
  } else {
    // The PSD RLE table contains every channel's row lengths before any row data.
    const rowLengths = Array.from({ length: channels }, () => {
      const lengths = new Uint16Array(height);
      for (let row = 0; row < height; row += 1) lengths[row] = readU16(reader);
      return lengths;
    });
    planes = rowLengths.map((lengths) =>
      readRlePlane(reader, width, height, lengths),
    );
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    if (rgb) {
      pixels[index * 4] = planes[0][index];
      pixels[index * 4 + 1] = planes[1][index];
      pixels[index * 4 + 2] = planes[2][index];
      pixels[index * 4 + 3] = planes[3]?.[index] ?? 255;
    } else {
      pixels[index * 4] = planes[0][index];
      pixels[index * 4 + 1] = planes[0][index];
      pixels[index * 4 + 2] = planes[0][index];
      pixels[index * 4 + 3] = planes[1]?.[index] ?? 255;
    }
  }
  return {
    width,
    height,
    channels,
    compression: compressionValue === 0 ? 'raw' : 'rle',
    pixels,
  };
}
