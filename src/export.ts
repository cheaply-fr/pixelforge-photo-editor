import { encodePsdComposite } from './psdExport.ts';
import { encodePdfComposite } from './pdfExport.ts';
import { convertRgbaProfile, type ColorProfile } from './colorProfile.ts';

/**
 * Create an export-only canvas in a requested profile. The editable document
 * stays untouched; conversion is explicit and bounded at the export boundary.
 */
export function convertCanvasProfile(
  image: HTMLCanvasElement,
  from: ColorProfile,
  to: ColorProfile,
): HTMLCanvasElement {
  if (from === to) return image;
  const source = image.getContext('2d')?.getImageData(0, 0, image.width, image.height);
  if (!source) throw new Error('Color profile conversion is unavailable in this browser.');
  const output = image.ownerDocument.createElement('canvas');
  output.width = image.width;
  output.height = image.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Color profile conversion is unavailable in this browser.');
  const converted = convertRgbaProfile(source.data, image.width, image.height, from, to);
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(converted);
  context.putImageData(pixels, 0, 0);
  return output;
}

export const EXPORT_FORMATS = ['png', 'jpeg', 'webp', 'psd', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Target-size controls are intentionally bounded so an invalid draft cannot
 * trigger an unbounded encoder/search loop or claim an impossible guarantee. */
export const MIN_EXPORT_TARGET_BYTES = 1024;
export const MAX_EXPORT_TARGET_BYTES = 64 * 1024 * 1024;
/** Keep a multi-snapshot download bounded on memory-constrained devices. */
export const MAX_BATCH_EXPORT_BYTES = 256 * 1024 * 1024;
export const exportLabels: Record<ExportFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  psd: 'PSD',
  pdf: 'PDF',
};

/** Convert a user document name into a portable, non-ambiguous archive stem. */
export function safeBatchStem(name: string): string {
  const stem = name
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return stem || 'pixelforge-edit';
}

export function validExportQuality(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  );
}

export function validExportTargetBytes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_EXPORT_TARGET_BYTES &&
    value <= MAX_EXPORT_TARGET_BYTES
  );
}

// Encode the composite, not the source file: no original EXIF/GPS metadata is copied.
// A browser may silently fall back to PNG for an unsupported MIME type; reject that
// result rather than download PNG bytes with a JPEG/WebP filename.
export async function encodeImage(
  image: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  if (!EXPORT_FORMATS.includes(format) || !validExportQuality(quality))
    throw new Error('Choose a supported format and quality from 1 to 100.');
  if (format === 'psd') return encodePsdComposite(image);
  if (format === 'pdf') return encodePdfComposite(image);
  let output = image;
  if (format === 'jpeg') {
    output = image.ownerDocument.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const context = output.getContext('2d');
    if (!context)
      throw new Error('Image export is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0);
  }
  const mime = `image/${format}`;
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, mime, format === 'png' ? undefined : quality / 100),
  );
  if (!blob || blob.size === 0)
    throw new Error(
      'The browser could not encode this image. Your editable draft is kept.',
    );
  if (blob.type !== mime)
    throw new Error(
      `${exportLabels[format]} export is unavailable in this browser. Try PNG instead.`,
    );
  return blob;
}

export type TargetEncodeResult = {
  blob: Blob;
  /** The quality actually used for the encoded blob. */
  quality: number;
  targetBytes: number;
  /** False means even quality 1 could not fit; no dimensions were silently reduced. */
  targetMet: boolean;
};

/**
 * Encode a lossy format at the highest quality that fits a byte target.
 *
 * Browser encoders are asynchronous and their output is content dependent, so
 * this uses a bounded binary search over the integer quality range. The
 * returned blob is always a valid encode; `targetMet` makes an impossible
 * target explicit instead of silently changing dimensions or dropping pixels.
 */
export async function encodeImageForTarget(
  image: HTMLCanvasElement,
  format: ExportFormat,
  targetBytes: number,
): Promise<TargetEncodeResult> {
  if (format !== 'jpeg' && format !== 'webp')
    throw new Error(
      'Target-size export requires JPEG or WebP; PNG is lossless and PSD/PDF are flattened composites.',
    );
  if (!validExportTargetBytes(targetBytes))
    throw new Error('Choose a target between 1 KB and 64 MB.');

  const maximum = await encodeImage(image, format, 100);
  if (maximum.size <= targetBytes)
    return { blob: maximum, quality: 100, targetBytes, targetMet: true };

  let low = 1;
  let high = 99;
  let best: { blob: Blob; quality: number } | undefined;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const blob = await encodeImage(image, format, quality);
    if (blob.size <= targetBytes) {
      best = { blob, quality };
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }
  if (best) return { ...best, targetBytes, targetMet: true };

  // Keep the user's pixels and dimensions when the request is impossible.
  const minimum = await encodeImage(image, format, 1);
  return {
    blob: minimum,
    quality: 1,
    targetBytes,
    targetMet: minimum.size <= targetBytes,
  };
}

export type ZipEntry = {
  /** A relative path. Absolute paths and `..` segments are rejected. */
  name: string;
  data: Blob | Uint8Array | string;
};

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

/**
 * Build a small, standards-compliant ZIP archive using the store method.
 *
 * Batch exports are generated entirely in the browser. Keeping entries
 * uncompressed avoids shipping a compression runtime and preserves the exact
 * bytes produced by the browser image encoder. The archive remains readable
 * by Finder, Windows Explorer and common ZIP libraries.
 */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error('The batch export has no files.');
  if (entries.length > 0xffff)
    throw new Error('Batch export exceeds ZIP entry limits.');
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const names = new Set<string>();
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const name = entry.name.replaceAll('\\', '/');
    if (
      !name ||
      name.startsWith('/') ||
      name.split('/').some((part) => part === '..' || part === '') ||
      names.has(name)
    )
      throw new Error('Batch export contains an unsafe or duplicate filename.');
    names.add(name);
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 0xffff)
      throw new Error('Batch export filename is too long.');
    const data =
      typeof entry.data === 'string'
        ? encoder.encode(entry.data)
        : entry.data instanceof Blob
          ? new Uint8Array(await entry.data.arrayBuffer())
          : entry.data;
    if (data.length > 0xffffffff || offset > 0xffffffff)
      throw new Error('Batch export exceeds ZIP format limits.');
    const checksum = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, ZIP_LOCAL_SIGNATURE, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 filenames; no encryption
    view.setUint16(8, 0, true); // store (no compression)
    view.setUint16(10, 0, true); // deterministic DOS time/date
    view.setUint16(12, 0, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    local.push(header, data);

    const directory = new Uint8Array(46 + nameBytes.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, ZIP_CENTRAL_SIGNATURE, true);
    directoryView.setUint16(4, 20, true); // version made by
    directoryView.setUint16(6, 20, true); // version needed
    directoryView.setUint16(8, 0x0800, true);
    directoryView.setUint16(10, 0, true);
    directoryView.setUint16(12, 0, true);
    directoryView.setUint16(14, 0, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, data.length, true);
    directoryView.setUint32(24, data.length, true);
    directoryView.setUint16(28, nameBytes.length, true);
    directoryView.setUint16(30, 0, true); // extra length
    directoryView.setUint16(32, 0, true); // comment length
    directoryView.setUint16(34, 0, true); // disk number
    directoryView.setUint16(36, 0, true); // internal attributes
    directoryView.setUint32(38, 0, true); // external attributes
    directoryView.setUint32(42, offset, true);
    directory.set(nameBytes, 46);
    central.push(directory);
    centralSize += directory.length;
    offset += header.length + data.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, ZIP_END_SIGNATURE, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  const parts: BlobPart[] = [...local, ...central, end].map((part) => {
    // Copy into a plain ArrayBuffer so TypeScript and older browsers do not
    // treat a SharedArrayBuffer-backed view as an unsafe BlobPart.
    const copy = new Uint8Array(part.byteLength);
    copy.set(part);
    return copy.buffer as ArrayBuffer;
  });
  return new Blob(parts, { type: 'application/zip' });
}

/** CRC-32 required by the ZIP store format. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
