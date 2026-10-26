import {
  MAX_BATCH_EXPORT_BYTES,
  createZip,
  encodeImage,
  validExportQuality,
  safeBatchStem,
  type ExportFormat,
  type ZipEntry,
} from './export';
import { renderFrame, type Assets, type Frame } from './document';
import { convertCanvasProfile } from './export';
import type { ColorProfile } from './colorProfile';
import type { DocumentMetadata } from './metadata';

export type BatchManifestEntry = {
  file: string;
  historyIndex: number;
  width: number;
  height: number;
  bytes: number;
};

export type BatchManifest = {
  application: 'pixelforge-photo-editor';
  format: ExportFormat;
  quality: number;
  colorProfile: ColorProfile;
  documentMetadata: DocumentMetadata;
  snapshotCount: number;
  documentName: string;
  generatedAt: string;
  metadata: string;
  entries: BatchManifestEntry[];
};

export type BatchExportResult = {
  blob: Blob;
  manifest: BatchManifest;
};

/**
 * Render each editable history state and package the flattened images locally.
 * The source assets are never placed in the archive, preserving the same
 * metadata privacy contract as the single-image export dialog.
 */
export async function buildBatchExport(
  frames: Frame[],
  assets: Assets,
  name: string,
  format: ExportFormat,
  quality: number,
  colorProfile: ColorProfile = 'srgb',
  documentMetadata: DocumentMetadata = { title: '', description: '', author: '' },
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BatchExportResult> {
  signal?.throwIfAborted();
  if (!frames.length) throw new Error('There are no history snapshots to export.');
  if (!validExportQuality(quality))
    throw new Error('Choose a valid export quality.');
  const stem = safeBatchStem(name);
  const extension = format === 'jpeg' ? 'jpg' : format;
  const entries: ZipEntry[] = [];
  const manifestEntries: BatchManifestEntry[] = [];
  let totalBytes = 0;
  for (let index = 0; index < frames.length; index += 1) {
    signal?.throwIfAborted();
    const frame = frames[index];
    const image = convertCanvasProfile(
      await renderFrame(frame, assets),
      frame.colorProfile ?? 'srgb',
      colorProfile,
    );
    signal?.throwIfAborted();
    const encoded = await encodeImage(image, format, quality);
    signal?.throwIfAborted();
    totalBytes += encoded.size;
    if (totalBytes > MAX_BATCH_EXPORT_BYTES)
      throw new Error('Batch export exceeds the 256 MB safety limit. Export fewer history states.');
    const file = `${stem}-history-${String(index + 1).padStart(3, '0')}.${extension}`;
    entries.push({ name: file, data: encoded });
    manifestEntries.push({
      file,
      historyIndex: index,
      width: frame.w,
      height: frame.h,
      bytes: encoded.size,
    });
    onProgress?.(index + 1, frames.length);
  }
  const manifest: BatchManifest = {
    application: 'pixelforge-photo-editor',
    format,
    quality,
    colorProfile,
    documentMetadata: { ...documentMetadata },
    snapshotCount: frames.length,
    documentName: name,
    generatedAt: new Date().toISOString(),
    metadata: 'rendered pixels only; source EXIF and GPS omitted; target color profile recorded',
    entries: manifestEntries,
  };
  entries.push({
    name: `${stem}-manifest.json`,
    data: JSON.stringify(manifest, null, 2),
  });
  signal?.throwIfAborted();
  const blob = await createZip(entries);
  signal?.throwIfAborted();
  return { blob, manifest };
}
