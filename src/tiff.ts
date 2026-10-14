/**
 * Bounded classic TIFF composite decoder.
 *
 * This reads 8-bit chunky RGB/RGBA or grayscale/alpha strips. It intentionally
 * does not claim support for tiled, planar, palette, CMYK, floating-point,
 * BigTIFF, multipage, metadata or lossless container round trips.
 */

const MAX_PIXELS = 16_000_000;
const MAX_DIMENSION = 16_000;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const PACKBITS_COMPRESSION = 32773;

type Endian = 'little' | 'big';
type Reader = { bytes: Uint8Array; offset: number; endian: Endian };
type Entry = { type: number; count: number; valueOffset: number; inline: Uint8Array };

const TYPE_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4 };

function ensure(reader: Reader, length: number): void {
  if (!Number.isInteger(length) || length < 0 || reader.offset + length > reader.bytes.length)
    throw new Error('TIFF data is truncated');
}

function readU8(reader: Reader): number {
  ensure(reader, 1);
  return reader.bytes[reader.offset++];
}

function readU16(reader: Reader): number {
  const first = readU8(reader), second = readU8(reader);
  return reader.endian === 'little' ? first | (second << 8) : (first << 8) | second;
}

function readU32(reader: Reader): number {
  const a = readU8(reader), b = readU8(reader), c = readU8(reader), d = readU8(reader);
  return reader.endian === 'little'
    ? (a + b * 0x100 + c * 0x10000 + d * 0x1000000) >>> 0
    : (a * 0x1000000 + b * 0x10000 + c * 0x100 + d) >>> 0;
}

function readAt(reader: Reader, offset: number, length: number): Uint8Array {
  if (!Number.isInteger(offset) || offset < 0 || offset + length > reader.bytes.length)
    throw new Error('TIFF offset is outside the file');
  return reader.bytes.subarray(offset, offset + length);
}

function readValue(reader: Reader, entry: Entry, index: number): number {
  const width = TYPE_BYTES[entry.type];
  if (!width) throw new Error('TIFF field type is not supported');
  if (!Number.isInteger(index) || index < 0 || index >= entry.count)
    throw new Error('TIFF field index is invalid');
  const bytes = entry.count * width <= 4
    ? entry.inline
    : readAt(reader, entry.valueOffset, entry.count * width);
  const local: Reader = { bytes, offset: index * width, endian: reader.endian };
  if (entry.type === 1) return readU8(local);
  if (entry.type === 3) return readU16(local);
  if (entry.type === 4) return readU32(local);
  throw new Error('TIFF ASCII fields are not supported for pixel data');
}

function values(reader: Reader, entry: Entry | undefined): number[] {
  if (!entry) return [];
  return Array.from({ length: entry.count }, (_, index) => readValue(reader, entry, index));
}

function decodePackBits(encoded: Uint8Array, expected: number): Uint8Array {
  const output = new Uint8Array(expected);
  let source = 0;
  let target = 0;
  while (source < encoded.length && target < expected) {
    const control = encoded[source++];
    if (control <= 127) {
      const count = control + 1;
      if (source + count > encoded.length || target + count > expected)
        throw new Error('TIFF PackBits strip is malformed');
      output.set(encoded.subarray(source, source + count), target);
      source += count;
      target += count;
    } else if (control !== 128) {
      const count = 257 - control;
      if (source >= encoded.length || target + count > expected)
        throw new Error('TIFF PackBits strip is malformed');
      output.fill(encoded[source++], target, target + count);
      target += count;
    }
  }
  if (target !== expected) throw new Error('TIFF PackBits strip is incomplete');
  return output;
}

function decodeStrip(encoded: Uint8Array, expected: number, compression: number): Uint8Array {
  if (compression === 1) {
    if (encoded.length < expected) throw new Error('TIFF strip is incomplete');
    return encoded.slice(0, expected);
  }
  if (compression === PACKBITS_COMPRESSION) return decodePackBits(encoded, expected);
  throw new Error('TIFF compression is not supported; export a flattened PNG or JPEG');
}

export type TiffComposite = {
  width: number;
  height: number;
  samplesPerPixel: number;
  compression: 'raw' | 'packbits';
  pixels: Uint8ClampedArray;
};

/** Decode a classic TIFF 8-bit chunky RGB/RGBA or grayscale/alpha composite. */
export function decodeTiffComposite(input: Uint8Array): TiffComposite {
  if (input.byteLength > MAX_INPUT_BYTES) throw new Error('TIFF file exceeds 64 MB');
  if (input.byteLength < 8) throw new Error('TIFF data is truncated');
  const marker = String.fromCharCode(input[0], input[1]);
  if (marker !== 'II' && marker !== 'MM') throw new Error('Not a TIFF file');
  const reader: Reader = { bytes: input, offset: 2, endian: marker === 'II' ? 'little' : 'big' };
  if (readU16(reader) !== 42) throw new Error('BigTIFF or unsupported TIFF version');
  const ifdOffset = readU32(reader);
  if (!ifdOffset) throw new Error('TIFF has no image directory');
  reader.offset = ifdOffset;
  const fieldCount = readU16(reader);
  if (fieldCount > 256) throw new Error('TIFF image directory is too large');
  const entries = new Map<number, Entry>();
  for (let index = 0; index < fieldCount; index += 1) {
    const tag = readU16(reader);
    const type = readU16(reader);
    const count = readU32(reader);
    if (!TYPE_BYTES[type] || !count || count > 1_000_000) throw new Error('TIFF field is malformed');
    const inline = readAt(reader, reader.offset, 4).slice();
    reader.offset += 4;
    const valueReader: Reader = { bytes: inline, offset: 0, endian: reader.endian };
    const offset = readU32(valueReader);
    entries.set(tag, { type, count, valueOffset: offset, inline });
  }
  const width = values(reader, entries.get(256))[0];
  const height = values(reader, entries.get(257))[0];
  const bits = values(reader, entries.get(258));
  const compression = values(reader, entries.get(259))[0] ?? 1;
  const photometric = values(reader, entries.get(262))[0];
  const stripOffsets = values(reader, entries.get(273));
  const samplesPerPixel = values(reader, entries.get(277))[0] ?? 1;
  const rowsPerStrip = values(reader, entries.get(278))[0];
  const stripByteCounts = values(reader, entries.get(279));
  const planar = values(reader, entries.get(284))[0] ?? 1;
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS)
    throw new Error('TIFF image exceeds 16 megapixels');
  if (!bits.length || bits.some((value) => value !== 8)) throw new Error('Only 8-bit TIFF composites are supported');
  const rgb = photometric === 2 && (samplesPerPixel === 3 || samplesPerPixel === 4);
  const gray = (photometric === 0 || photometric === 1) && (samplesPerPixel === 1 || samplesPerPixel === 2);
  if (!rgb && !gray) throw new Error('Only chunky 8-bit RGB or grayscale TIFF composites are supported');
  if (planar !== 1) throw new Error('Planar TIFF data is not supported');
  if (!rowsPerStrip || stripOffsets.length !== stripByteCounts.length)
    throw new Error('TIFF strip metadata is incomplete');
  const bytesPerRow = width * samplesPerPixel;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let strip = 0; strip < stripOffsets.length; strip += 1) {
    const startRow = strip * rowsPerStrip;
    if (startRow >= height) break;
    const rowCount = Math.min(rowsPerStrip, height - startRow);
    const decoded = decodeStrip(readAt(reader, stripOffsets[strip], stripByteCounts[strip]), rowCount * bytesPerRow, compression);
    for (let row = 0; row < rowCount; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const source = (row * bytesPerRow) + column * samplesPerPixel;
        const target = ((startRow + row) * width + column) * 4;
        if (rgb) {
          pixels[target] = decoded[source];
          pixels[target + 1] = decoded[source + 1];
          pixels[target + 2] = decoded[source + 2];
          pixels[target + 3] = samplesPerPixel === 4 ? decoded[source + 3] : 255;
        } else {
          const value = photometric === 0 ? 255 - decoded[source] : decoded[source];
          pixels[target] = value;
          pixels[target + 1] = value;
          pixels[target + 2] = value;
          pixels[target + 3] = samplesPerPixel === 2 ? decoded[source + 1] : 255;
        }
      }
    }
  }
  return {
    width,
    height,
    samplesPerPixel,
    compression: compression === 1 ? 'raw' : 'packbits',
    pixels,
  };
}
