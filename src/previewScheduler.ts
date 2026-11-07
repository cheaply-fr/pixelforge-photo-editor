/**
 * Coalesces live stroke previews.
 *
 * Painting tools stamp into a gesture buffer synchronously on every pointer
 * event, so no input is lost and the committed result is independent of how
 * often the canvas is previewed. Compositing that buffer into the full
 * document, however, costs far more than one pointer event on large images.
 * This scheduler keeps at most one preview render in flight and starts at most
 * one per animation frame. Each run asks the latest request for its arguments,
 * so the preview always shows the newest buffer state; a request may return
 * `null` when its gesture has ended so a stale gesture is never painted.
 */
export type PreviewRequest<T> = () => T | null;

export type PreviewSchedulerOptions<T> = {
  /** Start one render. Its settlement re-arms the scheduler if needed. */
  render: (value: T) => unknown;
  requestFrame?: (callback: () => void) => unknown;
  cancelFrame?: (handle: unknown) => void;
};

export type PreviewSchedulerStats = {
  /** Requests received since creation. */
  requested: number;
  /** Renders actually started since creation. */
  rendered: number;
  /** Requests dropped because a newer request or cancel superseded them. */
  coalesced: number;
};

export type PreviewScheduler<T> = {
  /** Replace any pending request and schedule a frame if none is armed. */
  request: (request: PreviewRequest<T>) => void;
  /** Drop the pending request and any armed frame. An in-flight render is
   * left to its owner (a newer render supersedes it by sequence). */
  cancel: () => void;
  /** Run the pending request now, skipping the animation frame. */
  flush: () => void;
  readonly pending: boolean;
  readonly inFlight: boolean;
  readonly stats: PreviewSchedulerStats;
};

const defaultRequestFrame = (callback: () => void): unknown =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(() => callback())
    : setTimeout(callback, 16);

const defaultCancelFrame = (handle: unknown): void => {
  if (typeof cancelAnimationFrame === 'function' && typeof handle === 'number')
    cancelAnimationFrame(handle);
  else clearTimeout(handle as ReturnType<typeof setTimeout>);
};

export function createPreviewScheduler<T>(
  options: PreviewSchedulerOptions<T>,
): PreviewScheduler<T> {
  const requestFrame = options.requestFrame ?? defaultRequestFrame;
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame;
  let pending: PreviewRequest<T> | null = null;
  let frame: { handle: unknown } | null = null;
  // Identity of the render this scheduler is waiting on. A settlement only
  // re-arms when it belongs to that render, so a render that settles after a
  // cancel cannot clear the gate of a newer gesture's render.
  let inFlight: object | null = null;
  const stats: PreviewSchedulerStats = { requested: 0, rendered: 0, coalesced: 0 };

  const arm = () => {
    if (frame || inFlight || !pending) return;
    const token = { handle: undefined as unknown };
    frame = token;
    token.handle = requestFrame(() => {
      if (frame !== token) return;
      frame = null;
      run();
    });
  };

  const run = () => {
    const next = pending;
    pending = null;
    if (!next) return;
    const value = next();
    if (value === null) return;
    stats.rendered += 1;
    const token = {};
    inFlight = token;
    const settle = () => {
      if (inFlight !== token) return;
      inFlight = null;
      arm();
    };
    let result: unknown;
    try {
      result = options.render(value);
    } catch {
      settle();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function')
      (result as Promise<unknown>).then(settle, settle);
    else settle();
  };

  return {
    request(request) {
      stats.requested += 1;
      if (pending) stats.coalesced += 1;
      pending = request;
      arm();
    },
    cancel() {
      if (pending) stats.coalesced += 1;
      pending = null;
      if (frame) {
        const { handle } = frame;
        frame = null;
        cancelFrame(handle);
      }
      // A cancelled generation's in-flight render no longer gates new work:
      // its owner supersedes it, and a fresh gesture must not wait on it.
      inFlight = null;
    },
    flush() {
      if (frame) {
        const { handle } = frame;
        frame = null;
        cancelFrame(handle);
      }
      if (!inFlight) run();
      else arm();
    },
    get pending() {
      return pending !== null;
    },
    get inFlight() {
      return inFlight !== null;
    },
    get stats() {
      return { ...stats };
    },
  };
}
