/**
 * DOM adapter for the sidebar auto-scroll coordinator: measures registered
 * sections inside the sidebar scroll container, writes scroll offsets, tracks
 * pointer/drag interactions and user scroll intent, and renders the
 * highlight, announcement and diagnostic attributes.
 *
 * All behaviour decisions live in `sidebarAutoScroll.ts` and
 * `sidebarScrollMath.ts`; this file only translates them to the browser.
 */
import type { RevealMeasurement, RevealPorts, RevealRequest, RevealSnapshot } from './sidebarAutoScroll.ts';
import { sectionSelector, type SidebarSectionId } from './sidebarSections.ts';

/** How long the landing highlight stays (the CSS animation fades within it). */
export const HIGHLIGHT_MS = 1400;
export const HIGHLIGHT_ATTRIBUTE = 'data-sidebar-highlight';
export const STICKY_ATTRIBUTE = 'data-sidebar-sticky';

const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

export type InteractionTracker = {
  isActive(): boolean;
  dispose(): void;
};

/**
 * Tracks pressed pointers and HTML drag-and-drop anywhere in the window so
 * the sidebar never scrolls under an active stroke, slider drag or layer
 * drag. Missed `pointerup`s are recovered by button-less moves and window
 * blur, and the coordinator additionally bounds every deferral in time.
 */
export function createInteractionTracker(
  win: Window,
  options: {
    container: () => HTMLElement | null;
    onInteractionEnded: () => void;
    onUserScrollIntent: () => void;
  },
): InteractionTracker {
  const pointers = new Set<number>();
  let dragging = false;
  const active = () => pointers.size > 0 || dragging;
  const settle = (wasActive: boolean) => {
    if (wasActive && !active()) options.onInteractionEnded();
  };
  const insideContainer = (target: EventTarget | null) => {
    const container = options.container();
    return Boolean(container && target instanceof Node && container.contains(target));
  };
  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    if (insideContainer(event.target)) options.onUserScrollIntent();
  };
  const onPointerEnd = (event: PointerEvent) => {
    const wasActive = active();
    pointers.delete(event.pointerId);
    settle(wasActive);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons === 0 && pointers.has(event.pointerId)) onPointerEnd(event);
  };
  const onDragStart = () => {
    dragging = true;
  };
  const onDragEnd = () => {
    const wasActive = active();
    dragging = false;
    settle(wasActive);
  };
  const onBlur = () => {
    const wasActive = active();
    pointers.clear();
    dragging = false;
    settle(wasActive);
  };
  const onWheel = (event: WheelEvent) => {
    if (insideContainer(event.target)) options.onUserScrollIntent();
  };
  const onTouchStart = (event: TouchEvent) => {
    if (insideContainer(event.target)) options.onUserScrollIntent();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return;
    const focused = win.document.activeElement;
    // Only keys that scroll the sidebar itself (focus inside it, not in a
    // text field or slider that consumes the key) count as a manual scroll.
    if (!focused || !insideContainer(focused)) return;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement || focused instanceof HTMLTextAreaElement) return;
    options.onUserScrollIntent();
  };
  const listeners: Array<[string, EventListener]> = [
    ['pointerdown', onPointerDown as EventListener],
    ['pointerup', onPointerEnd as EventListener],
    ['pointercancel', onPointerEnd as EventListener],
    ['pointermove', onPointerMove as EventListener],
    ['dragstart', onDragStart],
    ['dragend', onDragEnd],
    ['drop', onDragEnd],
    ['wheel', onWheel as EventListener],
    ['touchstart', onTouchStart as EventListener],
    ['keydown', onKeyDown as EventListener],
  ];
  for (const [type, listener] of listeners)
    win.addEventListener(type, listener, { capture: true, passive: true });
  win.addEventListener('blur', onBlur);
  return {
    isActive: active,
    dispose() {
      for (const [type, listener] of listeners) win.removeEventListener(type, listener, { capture: true });
      win.removeEventListener('blur', onBlur);
      pointers.clear();
      dragging = false;
    },
  };
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Height covered at the top/bottom by sticky headers or scroll-padding. */
function containerInsets(win: Window, container: HTMLElement): { top: number; bottom: number } {
  const style = win.getComputedStyle(container);
  let stickyTop = 0;
  let stickyBottom = 0;
  for (const element of container.querySelectorAll<HTMLElement>(`[${STICKY_ATTRIBUTE}]`)) {
    const position = win.getComputedStyle(element).position;
    if (position !== 'sticky' && position !== 'fixed') continue;
    const height = element.getBoundingClientRect().height;
    if (element.getAttribute(STICKY_ATTRIBUTE) === 'bottom') stickyBottom += height;
    else stickyTop += height;
  }
  return {
    top: Math.max(cssPixels(style.scrollPaddingTop), stickyTop),
    bottom: Math.max(cssPixels(style.scrollPaddingBottom), stickyBottom),
  };
}

/**
 * Below this many on-screen pixels the sidebar counts as scrolled off the
 * page; its own box then defines the visible band (the reveal still lands so
 * the section is at the top once the user scrolls the page to it).
 */
export const MIN_ONSCREEN_PX = 64;

/**
 * Part of the sidebar's scrollport that the browser viewport hides. In the
 * stacked mobile layout the sidebar starts below the canvas, so "visible"
 * must mean visible on screen, not merely inside the sidebar box.
 */
function viewportClip(win: Window, box: DOMRect, container: HTMLElement): { top: number; bottom: number } {
  const scrollportTop = box.top + container.clientTop;
  const hiddenAbove = Math.max(0, -scrollportTop);
  const hiddenBelow = Math.max(0, scrollportTop + container.clientHeight - win.innerHeight);
  if (container.clientHeight - hiddenAbove - hiddenBelow < MIN_ONSCREEN_PX) return { top: 0, bottom: 0 };
  return { top: hiddenAbove, bottom: hiddenBelow };
}

export type DomRevealOptions = {
  window: Window;
  container: () => HTMLElement | null;
  announcer: () => HTMLElement | null;
  expand: (section: SidebarSectionId) => void;
  isInteractionActive: () => boolean;
};

export function createDomRevealPorts(options: DomRevealOptions): RevealPorts<Element> {
  const win = options.window;
  const doc = win.document;
  let highlighted: Element | null = null;
  let highlightTimer: number | null = null;
  let lastAnnouncement = '';
  let padAnnouncement = false;
  const findSection = (section: SidebarSectionId): HTMLElement | null =>
    options.container()?.querySelector<HTMLElement>(sectionSelector(section)) ?? null;
  const clearHighlight = () => {
    if (highlightTimer !== null) win.clearTimeout(highlightTimer);
    highlightTimer = null;
    highlighted?.removeAttribute(HIGHLIGHT_ATTRIBUTE);
    highlighted = null;
  };
  return {
    now: () => win.performance.now(),
    requestFrame: (callback) => win.requestAnimationFrame(callback),
    cancelFrame: (handle) => win.cancelAnimationFrame(handle),
    setTimer: (callback, ms) => win.setTimeout(callback, ms),
    clearTimer: (handle) => win.clearTimeout(handle),
    queueMicrotask: (callback) => win.queueMicrotask(callback),
    measure(request: RevealRequest<Element>): RevealMeasurement {
      const container = options.container();
      if (!container || !container.isConnected) return { kind: 'hidden' };
      if (container.clientHeight <= 0 || win.getComputedStyle(container).display === 'none') return { kind: 'hidden' };
      const element = findSection(request.section);
      if (!element) return { kind: 'missing' };
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return { kind: 'missing' };
      const box = container.getBoundingClientRect();
      // Content coordinate 0 in viewport space.
      const origin = box.top + container.clientTop - container.scrollTop;
      const sticky = containerInsets(win, container);
      const clip = viewportClip(win, box, container);
      const insets = { top: Math.max(sticky.top, clip.top), bottom: Math.max(sticky.bottom, clip.bottom) };
      const keep = request.keep;
      const keepRect =
        keep && keep.isConnected && container.contains(keep) ? keep.getBoundingClientRect() : null;
      return {
        kind: 'ok',
        geometry: {
          scrollTop: container.scrollTop,
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
          insetTop: insets.top,
          insetBottom: insets.bottom,
          sectionTop: rect.top - origin,
          sectionBottom: rect.bottom - origin,
          ...(keepRect ? { keepTop: keepRect.top - origin, keepBottom: keepRect.bottom - origin } : {}),
        },
      };
    },
    isCollapsed: (section) => findSection(section)?.getAttribute('data-collapsed') === 'true',
    expand: (section) => options.expand(section),
    readScrollTop: () => options.container()?.scrollTop ?? 0,
    writeScrollTop(value) {
      const container = options.container();
      // 'instant' overrides any CSS scroll-behavior so the coordinator alone
      // owns the motion (and can detect user interruption).
      container?.scrollTo({ top: value, behavior: 'instant' as ScrollBehavior });
    },
    prefersReducedMotion() {
      try {
        return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    },
    isInteractionActive: options.isInteractionActive,
    highlight(section) {
      clearHighlight();
      const element = findSection(section);
      if (!element) return;
      highlighted = element;
      element.setAttribute(HIGHLIGHT_ATTRIBUTE, 'true');
      highlightTimer = win.setTimeout(() => {
        highlightTimer = null;
        if (highlighted === element) {
          element.removeAttribute(HIGHLIGHT_ATTRIBUTE);
          highlighted = null;
        }
      }, HIGHLIGHT_MS);
    },
    clearHighlight,
    announce(message) {
      const region = options.announcer();
      if (!region) return;
      // A trailing no-break space toggles so an identical message is re-read.
      padAnnouncement = message === lastAnnouncement ? !padAnnouncement : false;
      lastAnnouncement = message;
      region.textContent = padAnnouncement ? `${message} ` : message;
    },
    canMoveFocus() {
      const focused = doc.activeElement;
      return !focused || focused === doc.body || focused === doc.documentElement || !focused.isConnected;
    },
    focusSection(section) {
      const element = findSection(section);
      if (!element) return;
      const target =
        element.querySelector<HTMLElement>('[data-sidebar-section-toggle]') ??
        element;
      if (target === element && !element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    },
    report(snapshot: RevealSnapshot) {
      const container = options.container();
      if (!container) return;
      container.setAttribute('data-autoscroll-phase', snapshot.phase);
      container.setAttribute('data-autoscroll-section', snapshot.section ?? '');
      container.setAttribute('data-autoscroll-outcome', snapshot.outcome ?? '');
      container.setAttribute('data-autoscroll-sequence', String(snapshot.sequence));
    },
  };
}
