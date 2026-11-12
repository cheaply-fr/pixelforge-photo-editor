/**
 * Main-thread copy of the composite the editor canvas last presented.
 *
 * Large documents render in a persistent worker whose composite caches are
 * released when it idles (and on low-memory devices hold a single snapshot),
 * so an edit that cannot change a pixel — adding or deleting an empty paint
 * layer, renaming, locking, reselecting, undoing such a step — could still
 * cost a full render of every layer after a pause. The editor keeps one copy
 * of the last finished composite on the main thread, keyed by the frame's
 * composite-equivalence key (compositeCache.ts `compositeEquivalenceKey`,
 * equal keys mean identical pixels), and presents that copy instead of
 * rendering when the key of the next frame matches. Gesture overlays are
 * drawn onto the canvas after a render, so the copy is taken right after a
 * render is presented and re-presenting it also clears any overlay.
 */
import { COMPOSITE_CACHE_MIN_LAYERS, type CompositeSnapshotBudget } from './compositeCache.ts';

/** Below this size a render is fast; no copy is kept. */
export const PRESENTED_COMPOSITE_MIN_PIXELS = 2_000_000;

/**
 * Whether to keep a copy: large documents with a stack tall enough for the
 * renderer's own composite caches (COMPOSITE_CACHE_MIN_LAYERS; shorter
 * stacks render fast), and only on devices whose composite budget can spare
 * one more frame-sized surface (low-memory devices keep none).
 */
export function retainPresentedComposite(
  w: number,
  h: number,
  layers: number,
  budget: CompositeSnapshotBudget,
): boolean {
  const pixels = Math.max(0, Math.trunc(w)) * Math.max(0, Math.trunc(h));
  return (
    layers >= COMPOSITE_CACHE_MIN_LAYERS &&
    pixels >= PRESENTED_COMPOSITE_MIN_PIXELS &&
    budget.bytes >= pixels * 4
  );
}

export class PresentedComposite<S> {
  private kept: { key: string; w: number; h: number; surface: S } | undefined;
  hits = 0;

  /** The kept surface when it shows a frame with this key and size. */
  match(key: string | undefined, w: number, h: number): S | undefined {
    const kept = this.kept;
    if (key === undefined || !kept || kept.key !== key || kept.w !== w || kept.h !== h) return undefined;
    this.hits += 1;
    return kept.surface;
  }

  /** The kept surface at this size, to draw the next copy into. */
  reusable(w: number, h: number): S | undefined {
    const kept = this.kept;
    return kept && kept.w === w && kept.h === h ? kept.surface : undefined;
  }

  store(key: string, w: number, h: number, surface: S): void {
    this.kept = { key, w, h, surface };
  }

  /** Forget the copy (a different document, or the copy may be partly drawn). */
  clear(): void {
    this.kept = undefined;
  }

  get key(): string | undefined {
    return this.kept?.key;
  }
}
