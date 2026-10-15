import {
  MAX_BATCH_EXPORT_BYTES,
  createZip,
  safeBatchStem,
  type ExportFormat,
  type ZipEntry,
} from './export.ts';
import { encodeImageWithWorker } from './workerEncode.ts';
import { describeImportFormat } from './importFormats.ts';
import { decodePsdComposite } from './psd.ts';
import { decodeTiffComposite } from './tiff.ts';
import { applyBatchActionToCanvas, publicBatchActionDescriptor, runBatchActionQueue } from './batchActions.ts';
import { bindActionParameters, type ActionParameterValues, type ActionSet } from './actions.ts';

/** Keep anonymous multi-file work bounded on memory-constrained devices. */
export const MAX_BATCH_INPUTS = 64;
export const MAX_BATCH_INPUT_BYTES = 64 * 1024 * 1024;
export const MAX_BATCH_PIXELS = 16 * 1024 * 1024;

export type BatchImageSource = {
  /** The browser File name. It is used only for a sanitized output label. */
  name: string;
  file: Blob;
};

export type BatchImageEntry = {
  file: string;
  source: string;
  width: number;
  height: number;
  bytes: number;
};

export type BatchImageFailure = {
  source: string;
  reason: string;
};

export type BatchImageManifest = {
  application: 'pixelforge-photo-editor';
  kind: 'multi-input-image-export';
  format: ExportFormat;
  quality: number;
  sourceCount: number;
  exportedCount: number;
  failedCount: number;
  generatedAt: string;
  /** Rendered pixels only; source metadata and source bytes never enter the ZIP. */
  metadata: 'rendered pixels only; source EXIF, GPS and color profiles omitted';
  entries: BatchImageEntry[];
  failures: BatchImageFailure[];
  /** Present only for a reusable local Action batch; contains no file bytes. */
  action?: {
    id: string;
    name: string;
    stepCount: number;
    commands: string[];
  };
};

export type BatchImageExportResult = {
  blob: Blob;
  manifest: BatchImageManifest;
};

export type BatchImageProgress = {
  completed: number;
  total: number;
  source: string;
  status: 'exported' | 'failed';
};

export type BatchImageExportOptions = {
  sources: BatchImageSource[];
  format: ExportFormat;
  quality: number;
  onProgress?: (progress: BatchImageProgress) => void;
  signal?: AbortSignal;
  /** Dependency injection makes the contract deterministic in pure tests. */
  decode?: (source: BatchImageSource) => Promise<HTMLCanvasElement>;
  encode?: (
    image: HTMLCanvasElement,
    format: ExportFormat,
    quality: number,
  ) => Promise<Blob>;
};

export type BatchActionImageExportOptions = Omit<BatchImageExportOptions, 'onProgress'> & {
  action: ActionSet;
  parameters?: ActionParameterValues;
  onProgress?: (progress: BatchImageProgress) => void;
};

const PRIVACY_METADATA =
  'rendered pixels only; source EXIF, GPS and color profiles omitted' as const;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new DOMException('Batch export cancelled', 'AbortError');
    throw error;
  }
}

function sourceStem(name: string): string {
  const basename = name.replaceAll('\\', '/').split('/').pop() || 'image';
  return safeBatchStem(basename.replace(/\.[^.]+$/, ''));
}

/** Normalize an individual failure without leaking browser/file implementation text. */
function failureReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'The image could not be decoded or encoded.';
}

/**
 * Decode a local image into an untainted canvas. No network fetch is used.
 * The object URL path is retained for browsers without createImageBitmap.
 */
export async function decodeBatchImage(source: BatchImageSource): Promise<HTMLCanvasElement> {
  if (!(source.file instanceof Blob)) throw new Error('The selected item is not a file.');
  if (source.file.size > MAX_BATCH_INPUT_BYTES)
    throw new Error('The selected file exceeds the 64 MB safety limit.');
  const format = describeImportFormat(source.name, source.file.type);
  // Unknown containers must stop before a permissive browser decoder can turn
  // a renamed/opaque file into an unsafe raster import.
  if (!format.tryDecode)
    throw new Error(format.disclosure);
  if (format.format === 'psd' || format.format === 'tiff') {
    const bytes = new Uint8Array(await source.file.arrayBuffer());
    const decoded = format.format === 'psd'
      ? decodePsdComposite(bytes)
      : decodeTiffComposite(bytes);
    if (typeof document === 'undefined')
      throw new Error('PSD composite decoding requires a browser canvas.');
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image decoding is unavailable in this browser.');
    const imageData = context.createImageData(decoded.width, decoded.height);
    imageData.data.set(decoded.pixels);
    context.putImageData(imageData, 0, 0);
    return canvas;
  }
  const imageBitmapFactory = globalThis.createImageBitmap;
  if (typeof imageBitmapFactory === 'function') {
    const bitmap = await imageBitmapFactory(source.file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_BATCH_PIXELS)
        throw new Error('The selected image exceeds the 16 megapixel safety limit.');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image decoding is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0);
      return canvas;
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(source.file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_BATCH_PIXELS)
      throw new Error('The selected image exceeds the 16 megapixel safety limit.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image decoding is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export several independent local images to a privacy-safe ZIP.
 * Failed files are reported in the manifest while successful files remain
 * downloadable. The source File objects and metadata are never archived.
 */
export async function buildImageBatchExport(
  options: BatchImageExportOptions,
): Promise<BatchImageExportResult> {
  const { sources, format, quality, onProgress, signal } = options;
  if (!sources.length) throw new Error('Select at least one image for batch export.');
  if (sources.length > MAX_BATCH_INPUTS)
    throw new Error(`Batch export supports at most ${MAX_BATCH_INPUTS} images.`);
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new Error('Choose a valid export quality from 1 to 100.');
  throwIfAborted(signal);

  const decode = options.decode || decodeBatchImage;
  const encode =
    options.encode ||
    ((image: HTMLCanvasElement, imageFormat: ExportFormat, imageQuality: number) =>
      encodeImageWithWorker(image, imageFormat, imageQuality, { signal }));
  const extension = format === 'jpeg' ? 'jpg' : format;
  const entries: ZipEntry[] = [];
  const manifestEntries: BatchImageEntry[] = [];
  const failures: BatchImageFailure[] = [];
  const usedNames = new Set<string>();
  let totalBytes = 0;

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    throwIfAborted(signal);
    const displayName = source.name || `image-${index + 1}`;
    try {
      const image = await decode(source);
      throwIfAborted(signal);
      if (!image.width || !image.height || image.width * image.height > MAX_BATCH_PIXELS)
        throw new Error('The selected image exceeds the 16 megapixel safety limit.');
      const encoded = await encode(image, format, quality);
      throwIfAborted(signal);
      if (!(encoded instanceof Blob) || !encoded.size)
        throw new Error('The image encoder returned an empty file.');
      totalBytes += encoded.size;
      if (totalBytes > MAX_BATCH_EXPORT_BYTES)
        throw new Error('Batch export exceeds the 256 MB safety limit. Export fewer images.');
      const stem = sourceStem(displayName);
      let file = `${stem}-${String(index + 1).padStart(3, '0')}.${extension}`;
      let suffix = 2;
      while (usedNames.has(file)) {
        file = `${stem}-${String(index + 1).padStart(3, '0')}-${suffix}.${extension}`;
        suffix += 1;
      }
      usedNames.add(file);
      entries.push({ name: file, data: encoded });
      manifestEntries.push({
        file,
        source: displayName,
        width: image.width,
        height: image.height,
        bytes: encoded.size,
      });
      onProgress?.({
        completed: index + 1,
        total: sources.length,
        source: displayName,
        status: 'exported',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      failures.push({ source: displayName, reason: failureReason(error) });
      onProgress?.({
        completed: index + 1,
        total: sources.length,
        source: displayName,
        status: 'failed',
      });
    }
  }

  throwIfAborted(signal);
  if (!manifestEntries.length) {
    const detail = failures[0]?.reason || 'No image was exported.';
    throw new Error(`Batch export produced no usable images. ${detail}`);
  }
  const manifest: BatchImageManifest = {
    application: 'pixelforge-photo-editor',
    kind: 'multi-input-image-export',
    format,
    quality,
    sourceCount: sources.length,
    exportedCount: manifestEntries.length,
    failedCount: failures.length,
    generatedAt: new Date().toISOString(),
    metadata: PRIVACY_METADATA,
    entries: manifestEntries,
    failures,
  };
  entries.push({
    name: 'pixelforge-batch-manifest.json',
    data: JSON.stringify(manifest, null, 2),
  });
  const blob = await createZip(entries);
  throwIfAborted(signal);
  return { blob, manifest };
}

/**
 * Apply one recorded local Action to each selected image, then package the
 * flattened outputs. The queue is sequential and bounded; an unsupported
 * editor-only command is reported for that file while other files continue.
 */
export async function buildImageBatchActionExport(
  options: BatchActionImageExportOptions,
): Promise<BatchImageExportResult> {
  const { sources, format, quality, onProgress, signal, action, parameters } = options;
  if (!sources.length) throw new Error('Select at least one image for batch export.');
  if (sources.length > MAX_BATCH_INPUTS)
    throw new Error(`Batch export supports at most ${MAX_BATCH_INPUTS} images.`);
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new Error('Choose a valid export quality from 1 to 100.');
  throwIfAborted(signal);
  const decode = options.decode || decodeBatchImage;
  const encode =
    options.encode ||
    ((image: HTMLCanvasElement, imageFormat: ExportFormat, imageQuality: number) =>
      encodeImageWithWorker(image, imageFormat, imageQuality, { signal }));
  const boundAction = bindActionParameters(action, parameters || {});
  const extension = format === 'jpeg' ? 'jpg' : format;
  const usedNames = new Set<string>();
  const outputs = await runBatchActionQueue(
    boundAction,
    sources.map((source) => ({ source: source.name, value: source })),
    async (item, recipe) => {
      const image = await decode(item.value);
      throwIfAborted(signal);
      if (!image.width || !image.height || image.width * image.height > MAX_BATCH_PIXELS)
        throw new Error('The selected image exceeds the 16 megapixel safety limit.');
      const transformed = applyBatchActionToCanvas(image, recipe, signal);
      const encoded = await encode(transformed, format, quality);
      throwIfAborted(signal);
      if (!(encoded instanceof Blob) || !encoded.size)
        throw new Error('The image encoder returned an empty file.');
      return { source: item.source, image, encoded };
    },
    {
      signal,
      parameters,
      onProgress,
    },
  );
  throwIfAborted(signal);
  if (!outputs.results.length) {
    const detail = outputs.failures[0]?.reason || 'No image was exported.';
    throw new Error(`Batch Action produced no usable images. ${detail}`);
  }
  const entries: ZipEntry[] = [];
  const manifestEntries: BatchImageEntry[] = [];
  let totalBytes = 0;
  for (let index = 0; index < outputs.results.length; index += 1) {
    const result = outputs.results[index];
    totalBytes += result.encoded.size;
    if (totalBytes > MAX_BATCH_EXPORT_BYTES)
      throw new Error('Batch export exceeds the 256 MB safety limit. Export fewer images.');
    const stem = sourceStem(result.source);
    let file = `${stem}-${String(index + 1).padStart(3, '0')}.${extension}`;
    let suffix = 2;
    while (usedNames.has(file)) {
      file = `${stem}-${String(index + 1).padStart(3, '0')}-${suffix}.${extension}`;
      suffix += 1;
    }
    usedNames.add(file);
    entries.push({ name: file, data: result.encoded });
    manifestEntries.push({
      file,
      source: result.source,
      width: result.image.width,
      height: result.image.height,
      bytes: result.encoded.size,
    });
  }
  const manifest: BatchImageManifest = {
    application: 'pixelforge-photo-editor',
    kind: 'multi-input-image-export',
    format,
    quality,
    sourceCount: sources.length,
    exportedCount: manifestEntries.length,
    failedCount: outputs.failures.length,
    generatedAt: new Date().toISOString(),
    metadata: PRIVACY_METADATA,
    entries: manifestEntries,
    failures: outputs.failures,
    action: publicBatchActionDescriptor(boundAction),
  };
  entries.push({ name: 'pixelforge-batch-manifest.json', data: JSON.stringify(manifest, null, 2) });
  const blob = await createZip(entries);
  throwIfAborted(signal);
  return { blob, manifest };
}
