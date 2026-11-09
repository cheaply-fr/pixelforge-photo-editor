/**
 * Flash-free presentation of rendered documents on the visible editor canvas.
 *
 * Assigning `canvas.width`/`canvas.height` always reallocates and clears the
 * backing store and resets the 2D context, even when the value is unchanged.
 * A render presents a finished image in one synchronous step, so the canvas
 * never shows a cleared frame; resizing only when the document size really
 * changed also avoids reallocating a multi-megapixel backing store (and its
 * GPU texture) for every stroke preview.
 */

export type CanvasSize = { width: number; height: number };

/** Whether the canvas backing store must be resized to show a `width`×`height` document. */
export function canvasNeedsResize(target: CanvasSize, width: number, height: number): boolean {
  return target.width !== width || target.height !== height;
}

type PresentationContext = Pick<
  CanvasRenderingContext2D,
  'drawImage' | 'clearRect' | 'setTransform'
> &
  Partial<Pick<CanvasRenderingContext2D, 'reset'>> & {
    globalAlpha: number;
    globalCompositeOperation: GlobalCompositeOperation;
    filter?: string;
    imageSmoothingEnabled?: boolean;
  };

export type PresentationTarget = CanvasSize & {
  getContext(id: '2d'): PresentationContext | null;
};

/**
 * Replace the canvas contents with `image` (a finished `width`×`height`
 * render) in one synchronous step. The backing store is resized only when the
 * size changed; otherwise the context is reset to its default state (as a
 * resize would) and cleared just before the image is drawn, so a transparent
 * document never keeps stale pixels and no cleared frame can be presented.
 * Returns whether the canvas was resized.
 */
export function presentCanvasImage(
  target: PresentationTarget,
  image: CanvasImageSource,
  width: number,
  height: number,
): boolean {
  const resized = canvasNeedsResize(target, width, height);
  if (resized) {
    target.width = width;
    target.height = height;
  }
  const context = target.getContext('2d');
  if (!context) return resized;
  if (!resized) {
    if (typeof context.reset === 'function') context.reset();
    else {
      // Older engines: restore the defaults a resize would have restored.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      if ('filter' in context) context.filter = 'none';
      if ('imageSmoothingEnabled' in context) context.imageSmoothingEnabled = true;
      context.clearRect(0, 0, width, height);
    }
  }
  context.drawImage(image, 0, 0);
  return resized;
}

/** A render must run this long before the status bar says "Rendering…". */
export const RENDER_STATUS_SHOW_DELAY_MS = 250;
/** Gaps between back-to-back renders shorter than this keep "Rendering…" up. */
export const RENDER_STATUS_HIDE_DELAY_MS = 150;

export type DelayedFlagOptions = {
  /** How long the input must stay true before the flag turns on. */
  showDelayMs: number;
  /** How long the input must stay false before a shown flag turns off. */
  hideDelayMs: number;
  onChange: (shown: boolean) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type DelayedFlag = {
  /** Report the current raw value (e.g. "a render is in flight"). */
  set(value: boolean): void;
  /** Whether the flag is currently shown. */
  readonly shown: boolean;
  dispose(): void;
};

/**
 * A debounced boolean for status text: it turns on only after the input has
 * been true for `showDelayMs` (so sub-frame renders never flicker the status
 * bar) and, once on, stays on until the input has been false for
 * `hideDelayMs` (so back-to-back stroke previews read as one busy period).
 */
export function createDelayedFlag(options: DelayedFlagOptions): DelayedFlag {
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let shown = false,
    value = false,
    timer: unknown = null;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const apply = (next: boolean) => {
    timer = null;
    if (shown === next) return;
    shown = next;
    options.onChange(shown);
  };
  return {
    set(next) {
      if (next === value) return;
      value = next;
      cancel();
      // Returning to the shown state cancels a pending hide, and vice versa.
      if (value === shown) return;
      const delay = value ? options.showDelayMs : options.hideDelayMs;
      if (delay <= 0) apply(value);
      else timer = setTimer(() => apply(value), delay);
    },
    get shown() {
      return shown;
    },
    dispose() {
      cancel();
    },
  };
}
