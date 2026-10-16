import { EXPORT_FORMATS, encodeImage, validExportQuality, type ExportFormat } from './export.ts';
import { planTiles, scheduleTiles } from './tilePlan.ts';

export type WorkerEncodeOptions = {
  signal?: AbortSignal;
  tileSize?: number;
  onProgress?: (completed: number, total: number) => void;
};

let requestId = 0;
const ENCODE_TIMEOUT_MS = 30_000;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

/** Whether this browser can run the bounded OffscreenCanvas encode path. */
export function canEncodeInWorker(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof ImageData === 'function';
}

function abortError(): DOMException {
  return new DOMException('Worker encoding cancelled', 'AbortError');
}

/** Native toBlob cannot be interrupted, but cancellation must discard its result. */
function encodeFallback(image: HTMLCanvasElement, format: ExportFormat, quality: number, options: WorkerEncodeOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancel);
      callback();
    };
    const cancel = () => {
      finish(() => reject(abortError()));
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) return cancel();
    void encodeImage(image, format, quality).then((blob) => {
      if (settled) return;
      try {
        options.onProgress?.(1, 1);
        finish(() => resolve(blob));
      } catch (error) {
        finish(() => reject(error));
      }
    }, (error: unknown) => finish(() => reject(error)));
  });
}

/**
 * Encode batch pixels in an OffscreenCanvas worker, transferring one source
 * buffer and assembling it in bounded tiles. The main-thread readback and the
 * worker destination still cover the whole image; this is not a tiled editor
 * renderer or a reduced full-image memory guarantee.
 */
export async function encodeImageWithWorker(image: HTMLCanvasElement, format: ExportFormat, quality: number, options: WorkerEncodeOptions = {}): Promise<Blob> {
  if (!EXPORT_FORMATS.includes(format) || !validExportQuality(quality))
    throw new Error('Choose a supported format and quality from 1 to 100.');
  // PSD has a small binary encoder rather than a browser image MIME type, so
  // keep that path on the main thread. The worker remains an image/* encoder.
  if (format === 'psd') return encodeImage(image, format, quality);
  const plan = planTiles(image.width, image.height, { tileSize: options.tileSize });
  const schedule = scheduleTiles(plan);
  // Validate the bounded schedule before any worker or fallback allocation.
  // The worker repeats the schedule from the transferred dimensions.
  if (schedule.tileCount !== plan.tiles.length)
    throw new Error('Tile schedule does not match the planned tile count.');
  if (options.signal?.aborted) throw abortError();
  if (!canEncodeInWorker()) return encodeFallback(image, format, quality, options);

  let worker: Worker;
  try {
    worker = new Worker(new URL('./image-encode.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return encodeFallback(image, format, quality, options);
  }
  const id = ++requestId;
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let completed = 0;
    const timeout = setTimeout(() => finish(() => reject(new Error('Worker encoding timed out. Try fewer or smaller images.'))), ENCODE_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      // Cleanup must not replace an encode/cancellation result if a browser
      // has already stopped the worker.
      try { worker.terminate(); } catch { /* Already unavailable. */ }
      callback();
    };
    const cancel = () => {
      // Give a still-running worker a cancellation hint before terminating it.
      // Termination remains the hard safety boundary for a non-cooperative worker.
      try { worker.postMessage({ kind: 'cancel', id }); } catch { /* Worker already stopped. */ }
      finish(() => reject(abortError()));
    };
    const invalid = () => finish(() => reject(new Error('Worker returned an invalid encoding response.')));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!record(message)) return invalid();
      if (message.id !== id) return;
      if (message.kind === 'progress') {
        if (!Number.isInteger(message.completed) || !Number.isInteger(message.total) || message.total !== plan.tiles.length || Number(message.completed) < completed || Number(message.completed) < 1 || Number(message.completed) > Number(message.total)) return invalid();
        completed = Number(message.completed);
        try { options.onProgress?.(completed, Number(message.total)); } catch (error) { finish(() => reject(error)); }
      } else if (message.kind === 'result') {
        const blob = message.blob;
        // Blob identity can cross realms in embedded browsers, so validate its
        // observable contract instead of relying only on instanceof.
        if (!record(blob) || typeof blob.size !== 'number' || blob.size < 1 || blob.type !== `image/${format}`) return invalid();
        finish(() => resolve(blob as unknown as Blob));
      } else if (message.kind === 'error' && typeof message.message === 'string' && message.message.length <= 2000 && typeof message.name === 'string' && message.name.length <= 100) {
        const error = new Error(message.message);
        error.name = message.name;
        finish(() => reject(error));
      } else invalid();
    };
    worker.onerror = () => finish(() => reject(new Error('Worker encoding failed')));
    worker.onmessageerror = () => finish(() => reject(new Error('Worker encoding response could not be read')));
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) return cancel();
    try {
      const context = image.getContext('2d');
      if (!context) throw new Error('Image export is unavailable in this browser.');
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      if (!(pixels instanceof Uint8ClampedArray) || pixels.byteLength !== image.width * image.height * 4)
        throw new Error('Export pixels do not match image dimensions.');
      if (options.signal?.aborted) return cancel();
      worker.postMessage({ kind: 'encode', id, width: image.width, height: image.height, pixels: pixels.buffer, format, quality, tileSize: plan.tileSize }, [pixels.buffer]);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
