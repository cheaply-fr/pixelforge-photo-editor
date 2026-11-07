/**
 * Local file download helpers.
 *
 * Every PixelForge output is produced in the browser and handed to the user's
 * own browser as a Blob; nothing is uploaded. Two delivery paths exist:
 *
 * 1. An `<a download>` click. The anchor is attached to the document for the
 *    click (some embedded/strict browsers ignore detached anchors), uses a
 *    dedicated object URL for each download and revokes it only after a long
 *    delay, because some hosts fetch the blob URL asynchronously after the
 *    click returns.
 * 2. "Save with file picker" through the File System Access API
 *    (`showSaveFilePicker`) where the browser exposes it. The handle is
 *    requested first, while the click's user activation is still valid, and
 *    the bytes are written afterwards.
 *
 * Whether a host browser actually writes the anchor download to disk cannot
 * be observed by the page; callers should word notices accordingly.
 */

/** Object URLs stay alive long enough for slow or asynchronous download handlers. */
export const DOWNLOAD_URL_REVOKE_DELAY_MS = 60_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  psd: 'image/vnd.adobe.photoshop',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  zip: 'application/zip',
  pixelforge: 'application/zip',
  pixelselection: 'application/json',
  json: 'application/json',
  css: 'text/css',
};

const DESCRIPTION_BY_EXTENSION: Record<string, string> = {
  png: 'PNG image',
  jpg: 'JPEG image',
  jpeg: 'JPEG image',
  webp: 'WebP image',
  psd: 'Photoshop composite',
  pdf: 'PDF document',
  svg: 'SVG image',
  zip: 'ZIP archive',
  pixelforge: 'PixelForge project',
  pixelselection: 'PixelForge selection',
  json: 'JSON file',
  css: 'CSS file',
};

/** Lower-case extension of a filename without the dot, or '' when absent. */
export function fileExtension(filename: string): string {
  const match = /\.([a-z0-9]{1,16})$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

/** MIME type that matches a download filename; generic bytes when unknown. */
export function downloadMimeType(filename: string): string {
  return MIME_BY_EXTENSION[fileExtension(filename)] ?? 'application/octet-stream';
}

/**
 * Return a Blob labelled with the filename's MIME type when the encoder left
 * it untyped. A typed blob is never relabelled, so a browser that fell back to
 * PNG can never be presented as `.jpg`.
 */
export function typedDownloadBlob(blob: Blob, filename: string): Blob {
  if (blob.type && blob.type !== 'application/octet-stream') return blob;
  const type = downloadMimeType(filename);
  if (type === 'application/octet-stream') return blob;
  return new Blob([blob], { type });
}

/** Strip path separators and control characters from a suggested filename. */
export function safeDownloadName(filename: string, fallback = 'pixelforge-export'): string {
  // oxlint-disable-next-line no-control-regex
  const cleaned = filename.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-').trim();
  return (cleaned.replace(/^\.+/, '') || fallback).slice(0, 200);
}

type UrlApi = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
};

export type DownloadEnvironment = {
  document: Pick<Document, 'createElement' | 'body' | 'documentElement'>;
  URL: UrlApi;
  setTimeout: (callback: () => void, ms: number) => unknown;
};

const browserEnvironment = (): DownloadEnvironment => ({
  document,
  URL,
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
});

/**
 * Start a browser download through an attached `<a download>` element. The
 * blob gets its own object URL, revoked after {@link DOWNLOAD_URL_REVOKE_DELAY_MS}.
 */
export function downloadBlob(
  blob: Blob,
  filename: string,
  environment: DownloadEnvironment = browserEnvironment(),
): void {
  const name = safeDownloadName(filename);
  const typed = typedDownloadBlob(blob, name);
  const url = environment.URL.createObjectURL(typed);
  const anchor = environment.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.type = typed.type;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  const parent = environment.document.body ?? environment.document.documentElement;
  parent.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    environment.setTimeout(
      () => environment.URL.revokeObjectURL(url),
      DOWNLOAD_URL_REVOKE_DELAY_MS,
    );
  }
}

export type SaveFilePickerOptions = {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
};

export type WritableFileHandle = {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
};

type PickerWindow = {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<WritableFileHandle>;
  isSecureContext?: boolean;
};

/** Whether this browser exposes the File System Access save picker. */
export function supportsSaveFilePicker(target: unknown = globalThis): boolean {
  const win = target as PickerWindow | null | undefined;
  return Boolean(win && typeof win.showSaveFilePicker === 'function' && win.isSecureContext !== false);
}

/** Options for `showSaveFilePicker` restricted to the export's own type. */
export function saveFilePickerOptions(filename: string): SaveFilePickerOptions {
  const name = safeDownloadName(filename);
  const extension = fileExtension(name);
  const mime = downloadMimeType(name);
  return {
    suggestedName: name,
    types: extension
      ? [
          {
            description: DESCRIPTION_BY_EXTENSION[extension] ?? 'File',
            accept: { [mime]: [`.${extension}`] },
          },
        ]
      : [],
  };
}

export type PickedFile =
  | { status: 'picked'; handle: WritableFileHandle }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

/**
 * Ask the user where to save. Call this synchronously from the click handler,
 * before any slow work, so the browser's user-activation window is still open.
 */
export async function pickSaveFile(
  filename: string,
  target: unknown = globalThis,
): Promise<PickedFile> {
  const win = target as PickerWindow;
  if (!supportsSaveFilePicker(win) || !win.showSaveFilePicker)
    return { status: 'unavailable', reason: 'The file picker is not available in this browser.' };
  try {
    return { status: 'picked', handle: await win.showSaveFilePicker(saveFilePickerOptions(filename)) };
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'AbortError') return { status: 'cancelled' };
    return {
      status: 'unavailable',
      reason:
        name === 'SecurityError' || name === 'NotAllowedError'
          ? 'The browser blocked the file picker here.'
          : 'The file picker could not be opened.',
    };
  }
}

/** Write a blob to a handle returned by {@link pickSaveFile}. */
export async function writeToFileHandle(handle: WritableFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}
