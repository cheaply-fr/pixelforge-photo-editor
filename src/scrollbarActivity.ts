/**
 * Auto-hiding scrollbars (contract: docs/scrollbar-contract.md).
 *
 * The CSS keeps every scrollbar thin and transparent until its scroller is
 * hovered or carries `data-scrolling`. This module sets that attribute while
 * an element scrolls (wheel, touch, keyboard or programmatic) and clears it
 * once scrolling has been quiet for `SCROLLBAR_HIDE_DELAY_MS`.
 */

export const SCROLLING_ATTRIBUTE = 'data-scrolling';
export const SCROLLBAR_HIDE_DELAY_MS = 900;

/** The parts of an element this module touches. */
export interface ScrollTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** The parts of `document` this module touches. */
export interface ScrollEventSource {
  addEventListener(type: 'scroll', listener: (event: { target: unknown }) => void, options: AddEventListenerOptions): void;
  removeEventListener(type: 'scroll', listener: (event: { target: unknown }) => void, options: AddEventListenerOptions): void;
  /** The document's own scroller, used when the scroll event targets the document. */
  scrollingElement?: unknown;
}

export interface ScrollbarActivityOptions {
  delayMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

function isScrollTarget(value: unknown): value is ScrollTarget {
  return typeof value === 'object' && value !== null
    && typeof (value as ScrollTarget).setAttribute === 'function'
    && typeof (value as ScrollTarget).removeAttribute === 'function';
}

/**
 * Resolves the element that should show its scrollbar for a scroll event.
 * Scrolling the page fires on `document`, whose scrollbar belongs to
 * `document.scrollingElement`.
 */
export function scrollTargetFor(eventTarget: unknown, source: Pick<ScrollEventSource, 'scrollingElement'>): ScrollTarget | null {
  if (isScrollTarget(eventTarget)) return eventTarget;
  if (eventTarget === source && isScrollTarget(source.scrollingElement)) return source.scrollingElement;
  return null;
}

/**
 * Marks scrolling elements until they have been still for the delay.
 * Returns a function that removes the listener, pending timers and marks.
 */
export function installScrollbarActivity(source: ScrollEventSource, options: ScrollbarActivityOptions = {}): () => void {
  const delay = Math.max(0, options.delayMs ?? SCROLLBAR_HIDE_DELAY_MS);
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timers = new Map<ScrollTarget, unknown>();
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };

  const onScroll = (event: { target: unknown }) => {
    const target = scrollTargetFor(event.target, source);
    if (!target) return;
    const pending = timers.get(target);
    if (pending !== undefined) clearTimer(pending);
    else target.setAttribute(SCROLLING_ATTRIBUTE, '');
    timers.set(target, setTimer(() => {
      timers.delete(target);
      target.removeAttribute(SCROLLING_ATTRIBUTE);
    }, delay));
  };

  source.addEventListener('scroll', onScroll, listenerOptions);
  return () => {
    source.removeEventListener('scroll', onScroll, listenerOptions);
    for (const [target, handle] of timers) {
      clearTimer(handle);
      target.removeAttribute(SCROLLING_ATTRIBUTE);
    }
    timers.clear();
  };
}

export const HOVER_ATTRIBUTE = 'data-scroll-hover';

/** A node in the tree walked to find hovered scrollers. */
export interface HoverNode extends ScrollTarget {
  parentElement: HoverNode | null;
}

/**
 * Every scroller from `target` up to the root, innermost first. Chromium
 * does not repaint scrollbar styles when only `:hover` changes, so hover is
 * mirrored into an attribute instead.
 */
export function scrollersAt(target: HoverNode | null, isScroller: (node: HoverNode) => boolean): HoverNode[] {
  const found: HoverNode[] = [];
  for (let node = target; node; node = node.parentElement) if (isScroller(node)) found.push(node);
  return found;
}

/** Applies a new hovered set, touching only elements whose state changes. */
export function syncHovered(previous: ReadonlySet<ScrollTarget>, next: ReadonlySet<ScrollTarget>): void {
  for (const node of previous) if (!next.has(node)) node.removeAttribute(HOVER_ATTRIBUTE);
  for (const node of next) if (!previous.has(node)) node.setAttribute(HOVER_ATTRIBUTE, '');
}

/** Whether an element scrolls in either direction right now. */
export function isScrollableElement(node: HoverNode): boolean {
  const element = node as unknown as HTMLElement;
  if (typeof element.scrollHeight !== 'number') return false;
  const style = getComputedStyle(element);
  const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
  return (scrolls(style.overflowY) && element.scrollHeight > element.clientHeight)
    || (scrolls(style.overflowX) && element.scrollWidth > element.clientWidth);
}

/** The parts of a pointer event the hover tracker reads. */
export interface PointerLike { target: unknown; relatedTarget?: unknown; pointerType?: string }

/** The parts of `document` the hover tracker touches. */
export interface PointerEventSource {
  addEventListener(type: 'pointerover' | 'pointerout', listener: (event: PointerLike) => void, options: AddEventListenerOptions): void;
  removeEventListener(type: 'pointerover' | 'pointerout', listener: (event: PointerLike) => void, options: AddEventListenerOptions): void;
}

/**
 * Marks the scrollers under a mouse or pen pointer with `data-scroll-hover`.
 * Touch never shows scrollbars by hovering. Returns an uninstall function.
 */
export function installScrollbarHover(
  source: PointerEventSource,
  isScroller: (node: HoverNode) => boolean = isScrollableElement,
): () => void {
  let hovered = new Set<ScrollTarget>();
  const options: AddEventListenerOptions = { capture: true, passive: true };
  const onOver = (event: PointerLike) => {
    if (event.pointerType === 'touch') return;
    const target = isScrollTarget(event.target) && 'parentElement' in (event.target as object) ? event.target as HoverNode : null;
    const next = new Set<ScrollTarget>(scrollersAt(target, isScroller));
    syncHovered(hovered, next);
    hovered = next;
  };
  // Leaving the window fires pointerout with no element to go to.
  const onOut = (event: PointerLike) => {
    if (event.relatedTarget) return;
    syncHovered(hovered, new Set());
    hovered = new Set();
  };
  source.addEventListener('pointerover', onOver, options);
  source.addEventListener('pointerout', onOut, options);
  return () => {
    source.removeEventListener('pointerover', onOver, options);
    source.removeEventListener('pointerout', onOut, options);
    syncHovered(hovered, new Set());
    hovered = new Set();
  };
}
