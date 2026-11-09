/**
 * Pointer samples a single pointermove stands for.
 *
 * Chromium aligns continuous pointer input to animation frames: it delivers at
 * most one pointermove per frame and lists every hardware sample since the
 * previous event in `getCoalescedEvents()`, the last of which is the event
 * itself. A hidden tab or app pane gets no (or very rare) frames, so a whole
 * stroke can arrive as a handful of moves whose coalesced lists hold nearly
 * all of its samples. Stroke tools must apply every listed sample, in order,
 * or they paint straight chords between the few delivered positions.
 */
export type CoalescedSource = {
  clientX: number;
  clientY: number;
  pressure?: number;
  getCoalescedEvents?: () => ArrayLike<CoalescedSource>;
};

export type PointerSample<T> = {
  clientX: number;
  clientY: number;
  pressure: number | undefined;
  /** The browser's coalesced sample this was read from. */
  source: T;
};

/** Upper bound on samples taken from one event, against a runaway list. */
export const MAX_COALESCED_SAMPLES = 4096;

/**
 * The samples that precede `event`'s own position, oldest first. `event` is
 * the delivered (possibly replayed) move and `native` the browser event it
 * came from; a replayed move carries a client offset (see the trimmed-layer
 * expansion in the editor), which is applied to every sample. Returns an
 * empty list when the browser does not coalesce or listed only the event.
 */
export function precedingCoalescedSamples<T extends CoalescedSource>(
  event: { clientX: number; clientY: number },
  native: T | undefined,
): PointerSample<T>[] {
  if (!native || typeof native.getCoalescedEvents !== 'function') return [];
  let list: ArrayLike<CoalescedSource>;
  try {
    list = native.getCoalescedEvents();
  } catch {
    return [];
  }
  if (!list || list.length <= 1) return [];
  const dx = event.clientX - native.clientX,
    dy = event.clientY - native.clientY,
    // The last entry is the event itself; keep the newest samples if capped.
    end = list.length - 1,
    start = Math.max(0, end - MAX_COALESCED_SAMPLES),
    samples: PointerSample<T>[] = [];
  for (let index = start; index < end; index += 1) {
    const sample = list[index];
    if (!sample || !Number.isFinite(sample.clientX) || !Number.isFinite(sample.clientY)) continue;
    samples.push({
      clientX: sample.clientX + dx,
      clientY: sample.clientY + dy,
      pressure: sample.pressure,
      source: sample as T,
    });
  }
  return samples;
}
