/**
 * File-format capability labels used at the import boundary.
 *
 * PixelForge currently stores imported source pixels as an editable raster
 * asset. It does not promise a lossless round trip for camera/container
 * formats or layered documents. Keeping this classification separate from
 * the browser decoder lets the UI give an honest message before it touches a
 * draft, even when a file has an unusual MIME type.
 */
export type ImportFormat =
  | 'raster'
  | 'heic'
  | 'tiff'
  | 'svg'
  | 'pdf'
  | 'psd'
  | 'raw'
  | 'unknown';

export type ImportCapability = 'supported' | 'conditional' | 'unsupported';

export type ImportFormatInfo = {
  format: ImportFormat;
  label: string;
  capability: ImportCapability;
  /** Whether the browser decoder may be attempted for this source. */
  tryDecode: boolean;
  /** User-facing disclosure for the flattened imported representation. */
  disclosure: string;
};

const HEIC_EXTENSIONS = new Set(['heic', 'heif', 'heics', 'heifs']);
const TIFF_EXTENSIONS = new Set(['tif', 'tiff']);
const SVG_EXTENSIONS = new Set(['svg', 'svgz']);
const PDF_EXTENSIONS = new Set(['pdf']);
const PSD_EXTENSIONS = new Set(['psd', 'psb']);
const RASTER_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);
const RAW_EXTENSIONS = new Set([
  '3fr',
  'arw',
  'cr2',
  'cr3',
  'dcr',
  'dng',
  'erf',
  'iiq',
  'k25',
  'kdc',
  'mef',
  'mos',
  'mrw',
  'nef',
  'nrw',
  'orf',
  'pef',
  'raf',
  'raw',
  'rw2',
  'rwl',
  'sr2',
  'srf',
  'x3f',
]);

function extensionOf(fileName: string): string {
  const basename = fileName.trim().replaceAll('\\', '/').split('/').pop() || '';
  const dot = basename.lastIndexOf('.');
  return dot < 0 ? '' : basename.slice(dot + 1).toLowerCase();
}

function hasMime(mime: string, ...values: string[]): boolean {
  const normalized = mime.trim().toLowerCase().split(';', 1)[0];
  return values.includes(normalized);
}

const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];

const TIFF_MIME_TYPES = ['image/tiff', 'image/x-tiff'];
const SVG_MIME_TYPES = ['image/svg+xml', 'image/svg'];
const PDF_MIME_TYPES = ['application/pdf'];

export function describeImportFormat(
  fileName: string,
  mimeType = '',
): ImportFormatInfo {
  const extension = extensionOf(fileName);
  if (
    PSD_EXTENSIONS.has(extension) ||
    hasMime(mimeType, 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop', 'application/x-photoshop')
  ) {
    return {
      format: 'psd',
      label: 'PSD/PSB',
      capability: 'conditional',
      tryDecode: true,
      disclosure:
        'PSD/PSB import reads a bounded 8-bit RGB/grayscale composite as a flattened editable raster; layers, masks, profiles and source metadata are not retained.',
    };
  }
  if (TIFF_EXTENSIONS.has(extension) || hasMime(mimeType, ...TIFF_MIME_TYPES)) {
    return {
      format: 'tiff',
      label: 'TIFF',
      capability: 'conditional',
      tryDecode: true,
      disclosure:
        'TIFF import depends on this browser decoder. When decoded, it is a flattened editable raster; source metadata, layers and the original container are not retained.',
    };
  }
  if (SVG_EXTENSIONS.has(extension) || hasMime(mimeType, ...SVG_MIME_TYPES)) {
    return {
      format: 'svg',
      label: 'SVG',
      capability: 'conditional',
      tryDecode: true,
      disclosure:
        'SVG import is conditional browser rasterization. It is flattened into editable pixels; vector paths, embedded fonts, external resources and source metadata are not retained.',
    };
  }
  if (PDF_EXTENSIONS.has(extension) || hasMime(mimeType, ...PDF_MIME_TYPES)) {
    return {
      format: 'pdf',
      label: 'PDF',
      capability: 'conditional',
      tryDecode: true,
      disclosure:
        'PDF import reads a bounded single-page JPEG composite as a flattened editable raster; page structure, vectors, text, profiles and PDF metadata are not retained.',
    };
  }
  if (
    RAW_EXTENSIONS.has(extension) ||
    hasMime(mimeType, 'image/x-raw', 'image/raw', 'application/x-raw')
  ) {
    return {
      format: 'raw',
      label: 'RAW',
      capability: 'unsupported',
      tryDecode: false,
      disclosure:
        'Camera RAW import is not supported yet. Develop the source to a PNG or JPEG first; camera metadata and the RAW mosaic are not retained.',
    };
  }
  if (
    HEIC_EXTENSIONS.has(extension) ||
    hasMime(mimeType, ...HEIC_MIME_TYPES)
  ) {
    return {
      format: 'heic',
      label: 'HEIC/HEIF',
      capability: 'conditional',
      tryDecode: true,
      disclosure:
        'HEIC/HEIF is imported as a flattened editable raster when this browser can decode it. Source metadata and the original container are not retained.',
    };
  }
  if (mimeType.trim().toLowerCase().startsWith('image/') || RASTER_EXTENSIONS.has(extension)) {
    return {
      format: 'raster',
      label: 'image',
      capability: 'supported',
      tryDecode: true,
      disclosure:
        'Imported as a flattened editable raster. Original metadata and the source container are not retained.',
    };
  }
  return {
    format: 'unknown',
    label: 'file',
    capability: 'unsupported',
    tryDecode: false,
    disclosure: 'Choose a browser-readable PNG, JPEG or WebP image.',
  };
}

export function importFailureMessage(info: ImportFormatInfo): string {
  if (info.format === 'psd') {
    return 'This PSD/PSB is not a supported 8-bit RGB/grayscale composite. Export a flattened PNG or JPEG; the current draft is unchanged.';
  }
  if (info.format === 'heic') {
    return 'HEIC/HEIF decoding is unavailable in this browser. Convert it to PNG or JPEG; the current draft is unchanged.';
  }
  if (info.format === 'pdf') {
    return 'This PDF is not a supported single-page JPEG composite. Render the required page to PNG or JPEG; page structure, vectors, text and PDF metadata are not retained.';
  }
  if (info.format === 'tiff') {
    return 'This TIFF is not a supported 8-bit chunky RGB/grayscale composite. Export a flattened PNG or JPEG; the current draft is unchanged.';
  }
  if (info.format === 'svg') {
    return 'SVG rasterization is unavailable in this browser. Export a PNG or JPEG; the current draft is unchanged.';
  }
  return `${info.label} could not be decoded. Convert it to PNG or JPEG; the current draft is unchanged.`;
}
