import { EXPORT_FORMATS, validExportQuality, type ExportFormat } from './export.ts';
import { planTiles, scheduleTiles, type TilePlan } from './tilePlan.ts';

type EncodeRequest = {
  kind: 'encode'; id: number; width: number; height: number;
  pixels: ArrayBuffer; format: ExportFormat; quality: number; tileSize?: number;
};
type Response =
  | { kind: 'progress'; id: number; completed: number; total: number }
  | { kind: 'result'; id: number; blob: Blob }
  | { kind: 'error'; id: number; name: string; message: string };

let activeId: number | undefined;
const cancelled = new Set<number>();
const scope = globalThis as typeof globalThis & { postMessage: (message: Response) => void };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
const validId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Validate before creating a canvas, typed view or tile ImageData. */
export function validateEncodeRequest(value: unknown): { request: EncodeRequest; plan: TilePlan } {
  if (!record(value) || value.kind !== 'encode' || !validId(value.id) || !EXPORT_FORMATS.includes(value.format as ExportFormat) || !validExportQuality(value.quality))
    throw new Error('Invalid worker encoding request');
  if (value.format === 'psd')
    throw new Error('PSD encoding runs on the main thread.');
  const plan = planTiles(value.width as number, value.height as number, { tileSize: value.tileSize as number | undefined });
  if (!(value.pixels instanceof ArrayBuffer) || value.pixels.byteLength !== plan.width * plan.height * 4)
    throw new Error('Worker pixel buffer does not match dimensions');
  return { request: value as unknown as EncodeRequest, plan };
}

function fail(id: number, error: unknown): void {
  scope.postMessage({ kind: 'error', id, name: error instanceof DOMException ? error.name : 'Error', message: error instanceof Error ? error.message : 'Worker encoding failed' });
}
function checkCancelled(id: number): void {
  if (cancelled.has(id)) throw new DOMException('Worker encoding cancelled', 'AbortError');
}

async function encode(value: unknown): Promise<void> {
  const id = record(value) && validId(value.id) ? value.id : 0;
  let canvas: OffscreenCanvas | undefined;
  try {
    const { request, plan } = validateEncodeRequest(value);
    const schedule = scheduleTiles(plan);
    if (schedule.tileCount !== plan.tiles.length)
      throw new Error('Tile schedule does not match the planned tile count.');
    if (activeId !== undefined) throw new Error('Worker is already encoding an image');
    activeId = id;
    const { width, height } = request;
    checkCancelled(id);
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas encoding is unavailable');
    const source = new Uint8ClampedArray(request.pixels);
    let completed = 0;
    for (const batch of schedule.batches) {
      for (const tile of batch.tiles) {
        checkCancelled(id);
      const image = new ImageData(tile.width, tile.height);
      for (let row = 0; row < tile.height; row += 1) {
        const sourceOffset = ((tile.y + row) * width + tile.x) * 4;
        image.data.set(source.subarray(sourceOffset, sourceOffset + tile.width * 4), row * tile.width * 4);
      }
      // putImageData replaces pixels rather than compositing over a white
      // canvas. Matte the tile itself so transparent JPEG pixels stay white.
      if (request.format === 'jpeg') {
        for (let offset = 0; offset < image.data.length; offset += 4) {
          const alpha = image.data[offset + 3] / 255;
          for (let channel = 0; channel < 3; channel += 1)
            image.data[offset + channel] = Math.round(image.data[offset + channel] * alpha + 255 * (1 - alpha));
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, tile.x, tile.y);
        completed += 1;
        scope.postMessage({ kind: 'progress', id, completed, total: plan.tiles.length });
        if (completed < plan.tiles.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    checkCancelled(id);
    const mime = `image/${request.format}`;
    const blob = await canvas.convertToBlob({ type: mime, quality: request.format === 'png' ? undefined : request.quality / 100 });
    checkCancelled(id);
    if (!blob.size || blob.type !== mime) throw new Error(`${request.format.toUpperCase()} export is unavailable in this browser`);
    scope.postMessage({ kind: 'result', id, blob });
  } catch (error) {
    fail(id, error);
  } finally {
    cancelled.delete(id);
    if (activeId === id) activeId = undefined;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (record(value) && value.kind === 'cancel') {
    if (validId(value.id) && value.id === activeId) cancelled.add(value.id);
    return;
  }
  void encode(value);
});
