/**
 * Filter band worker: renders one row band (or one tile) of a heavy
 * neighbourhood filter. It holds no state between requests and never sees
 * document data beyond the pixels it is sent; results are transferred back.
 * This pool is separate from the document render worker.
 */
import { renderFilterBand, type FilterBandRequest } from './filterBands.ts';
import { applyFilterEffectsPixels, type FilterEffects } from './filterEffects.ts';

export type FilterWorkerRequest =
  | ({ kind: 'band'; id: number } & Omit<FilterBandRequest, 'pixels'> & { pixels: ArrayBuffer })
  | {
      kind: 'pixels';
      id: number;
      effect: FilterEffects;
      width: number;
      height: number;
      renderCenter?: { x: number; y: number };
      pixels: ArrayBuffer;
    };

export type FilterWorkerResponse =
  | { kind: 'done'; id: number; pixels: ArrayBuffer }
  | { kind: 'error'; id: number; message: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<FilterWorkerRequest>) => void) | null;
  postMessage: (message: FilterWorkerResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const id = request && Number.isSafeInteger(request.id) ? request.id : -1;
  try {
    if (!request || !(request.pixels instanceof ArrayBuffer)) throw new TypeError('Invalid filter worker request');
    const pixels = new Uint8ClampedArray(request.pixels);
    const output = request.kind === 'band'
      ? renderFilterBand({ ...request, pixels })
      : request.kind === 'pixels'
        ? applyFilterEffectsPixels(pixels, request.width, request.height, request.effect, request.renderCenter)
        : undefined;
    if (!output) throw new TypeError('Unknown filter worker request');
    const buffer = output.buffer as ArrayBuffer;
    scope.postMessage({ kind: 'done', id, pixels: buffer }, [buffer]);
  } catch (error) {
    scope.postMessage({ kind: 'error', id, message: error instanceof Error ? error.message.slice(0, 500) : 'Filter worker failed' });
  }
};
