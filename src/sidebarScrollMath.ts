/**
 * Pure scroll-target arithmetic for the properties-sidebar auto-scroll.
 *
 * Every value is in the scroll container's *content* coordinate space
 * (0 = top of the scrollable content), so results do not depend on where the
 * container sits on the page. No DOM, no React, no clocks: the coordinator
 * and the DOM adapter feed measurements in and apply the results.
 */

/** Geometry of one reveal, measured in container content coordinates. */
export type RevealGeometry = {
  /** Current container scroll offset. */
  scrollTop: number;
  /** Visible height of the container (clientHeight). */
  clientHeight: number;
  /** Total scrollable content height (scrollHeight). */
  scrollHeight: number;
  /** Space at the top covered by sticky headers / scroll-padding. */
  insetTop: number;
  /** Space at the bottom covered by sticky footers / scroll-padding. */
  insetBottom: number;
  /** Section header (= section root) top edge. */
  sectionTop: number;
  /** Section bottom edge. */
  sectionBottom: number;
  /** Optional element that must end up fully visible (a focused control). */
  keepTop?: number;
  keepBottom?: number;
};

/**
 * `start`  – external triggers (toolbar, shortcuts, menus): put the section
 *            header at the top of the visible area.
 * `nearest` – contextual triggers from inside the sidebar: the smallest move
 *            that makes the section visible, keeping its header visible.
 */
export type RevealAlign = 'start' | 'nearest';

export type ScrollPlan =
  | { readonly action: 'none'; readonly reason: 'fully-visible' | 'aligned' | 'unscrollable' }
  | { readonly action: 'scroll'; readonly to: number; readonly distance: number };

/** Sub-pixel slack: browsers round scroll offsets to device pixels. */
export const SCROLL_TOLERANCE_PX = 1;

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function maxScrollTop(geometry: Pick<RevealGeometry, 'scrollHeight' | 'clientHeight'>): number {
  return Math.max(0, finite(geometry.scrollHeight) - Math.max(0, finite(geometry.clientHeight)));
}

export function clampScrollTop(value: number, geometry: Pick<RevealGeometry, 'scrollHeight' | 'clientHeight'>): number {
  return Math.min(maxScrollTop(geometry), Math.max(0, finite(value)));
}

/** Visible band [top, bottom] in content coordinates after sticky insets. */
export function visibleBand(geometry: RevealGeometry): { top: number; bottom: number } {
  const insetTop = Math.max(0, finite(geometry.insetTop));
  const insetBottom = Math.max(0, finite(geometry.insetBottom));
  const top = finite(geometry.scrollTop) + insetTop;
  const bottom = Math.max(top, finite(geometry.scrollTop) + Math.max(0, finite(geometry.clientHeight)) - insetBottom);
  return { top, bottom };
}

/** True when the whole section is inside the visible band (with tolerance). */
export function isFullyVisible(geometry: RevealGeometry, tolerance = SCROLL_TOLERANCE_PX): boolean {
  const band = visibleBand(geometry);
  return (
    geometry.sectionTop >= band.top - tolerance &&
    geometry.sectionBottom <= band.bottom + tolerance
  );
}

/**
 * Decide whether and where to scroll. The result is deterministic, clamped to
 * the scrollable range, and `none` whenever the move would be ≤ tolerance.
 */
export function computeScrollPlan(
  geometry: RevealGeometry,
  align: RevealAlign,
  tolerance = SCROLL_TOLERANCE_PX,
): ScrollPlan {
  const values = [geometry.scrollTop, geometry.clientHeight, geometry.scrollHeight, geometry.sectionTop, geometry.sectionBottom];
  if (values.some((value) => !Number.isFinite(value)) || geometry.clientHeight <= 0)
    return { action: 'none', reason: 'unscrollable' };
  const keep = keepRange(geometry);
  const band = visibleBand(geometry);
  const keepVisible = !keep || (keep.top >= band.top - tolerance && keep.bottom <= band.bottom + tolerance);
  if (isFullyVisible(geometry, tolerance) && keepVisible) return { action: 'none', reason: 'fully-visible' };
  if (maxScrollTop(geometry) <= 0) return { action: 'none', reason: 'unscrollable' };
  const to = alignmentTarget(geometry, align);
  const distance = to - geometry.scrollTop;
  if (Math.abs(distance) <= tolerance) return { action: 'none', reason: 'aligned' };
  return { action: 'scroll', to, distance };
}

function keepRange(geometry: RevealGeometry): { top: number; bottom: number } | null {
  return Number.isFinite(geometry.keepTop) && Number.isFinite(geometry.keepBottom)
    ? { top: geometry.keepTop as number, bottom: geometry.keepBottom as number }
    : null;
}

/**
 * The clamped scroll offset that realises `align` for the current geometry,
 * regardless of whether the section is already visible. The animation
 * re-evaluates this every frame so it tracks layout shifts.
 */
export function alignmentTarget(geometry: RevealGeometry, align: RevealAlign): number {
  const insetTop = Math.max(0, finite(geometry.insetTop));
  const insetBottom = Math.max(0, finite(geometry.insetBottom));
  const clientHeight = Math.max(0, finite(geometry.clientHeight));
  const viewHeight = Math.max(0, clientHeight - insetTop - insetBottom);
  const startTarget = finite(geometry.sectionTop) - insetTop;
  let target: number;
  if (align === 'start') target = startTarget;
  else if (finite(geometry.sectionTop) < visibleBand(geometry).top) target = startTarget;
  else {
    // Bring the bottom into view, but never push the header out of view.
    const bottomTarget = finite(geometry.sectionBottom) + insetBottom - clientHeight;
    target = Math.max(finite(geometry.scrollTop), Math.min(bottomTarget, startTarget));
  }
  const keep = keepRange(geometry);
  if (keep) {
    // A focused control must end fully visible even if that costs the header.
    if (keep.bottom > target + insetTop + viewHeight) target = keep.bottom + insetBottom - clientHeight;
    if (keep.top < target + insetTop) target = keep.top - insetTop;
  }
  return clampScrollTop(target, geometry);
}

/** Animation duration bounds (ms). Reduced motion always uses 0. */
export const MIN_SCROLL_DURATION_MS = 140;
export const MAX_SCROLL_DURATION_MS = 320;

export function scrollDuration(distance: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const magnitude = Math.abs(finite(distance));
  if (magnitude <= SCROLL_TOLERANCE_PX) return 0;
  // ~0.35 ms per pixel, bounded so long jumps never feel sluggish.
  return Math.round(Math.min(MAX_SCROLL_DURATION_MS, Math.max(MIN_SCROLL_DURATION_MS, MIN_SCROLL_DURATION_MS + magnitude * 0.12)));
}

/** easeOutCubic on [0, 1]; values outside are clamped. */
export function easeOutCubic(progress: number): number {
  const t = Math.min(1, Math.max(0, finite(progress)));
  return 1 - (1 - t) ** 3;
}

/**
 * Scroll offset for one animation frame. `target` is re-measured every frame
 * so a layout shift during the animation still lands on the section.
 */
export function animationFrameOffset(from: number, target: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return target;
  return from + (target - from) * easeOutCubic(Math.max(0, elapsed) / duration);
}

/**
 * A scroll offset that differs from the last value the animation wrote means
 * something else (the user, a focus scroll, an automation tool) moved the
 * container; the animation must yield.
 */
export function wasScrolledExternally(lastWritten: number, actual: number, tolerance = SCROLL_TOLERANCE_PX + 0.5): boolean {
  return Math.abs(finite(actual) - finite(lastWritten)) > tolerance;
}
