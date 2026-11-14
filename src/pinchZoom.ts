/**
 * Two-finger pinch zoom and pan for the canvas on touch screens, plus the
 * touch long-press rules used by the Move tool's "select layer at point".
 *
 * A pinch keeps the image point that was under the midpoint of the two
 * fingers when the pinch began under the fingers' current midpoint: spreading
 * zooms in about that point, pinching zooms out, and moving both fingers pans.
 * The zoom is the start zoom scaled by the change in finger distance, clamped
 * to the editor's zoom range. Pan is expressed as the scroll change of the
 * stage, so it composes with the scroll-based pan the editor already uses.
 *
 * Every helper is DOM-free so the gesture rules are checked in Node tests
 * (tests/pinch-zoom.test.mjs). The editor wiring lives in app/page.tsx.
 */
import { MAX_VIEW_ZOOM, MIN_VIEW_ZOOM } from './viewZoom.ts';

export type PinchPoint = { x: number; y: number };
/** A displayed image box in client coordinates (a DOMRect fits). */
export type PinchBox = { left: number; top: number; width: number; height: number };

/**
 * Smallest finger distance (CSS px) a pinch is measured from. Two contacts
 * reported at (almost) the same spot would otherwise make the ratio explode.
 */
export const MIN_PINCH_DISTANCE = 12;

export function pinchDistance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchMidpoint(a: PinchPoint, b: PinchPoint): PinchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function finitePoint(point: PinchPoint | undefined): point is PinchPoint {
  return Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y);
}

function clampZoom(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(max, Math.max(min, 100));
  return Math.min(max, Math.max(min, value));
}

export type PinchStart = {
  /** The two contacts when the pinch began. */
  pointers: readonly [PinchPoint, PinchPoint];
  /** View zoom (percent) when the pinch began. */
  zoom: number;
  /**
   * Displayed image box when the pinch began. The image point under the start
   * midpoint is stored as a fraction of this box, which stays valid however
   * the box is later scrolled or scaled (rotation included: a rotated box's
   * bounding rectangle scales uniformly too).
   */
  box: PinchBox;
};

export type PinchAnchor = {
  /** Fraction (0..1 inside the image) of the image box under the start midpoint. */
  fx: number;
  fy: number;
  /** Start midpoint and finger distance (distance never below MIN_PINCH_DISTANCE). */
  midpoint: PinchPoint;
  distance: number;
  zoom: number;
};

/** Capture what a pinch keeps fixed: the image point under the start midpoint. */
export function beginPinch(start: PinchStart): PinchAnchor {
  const [a, b] = start.pointers;
  const midpoint = pinchMidpoint(a, b);
  const width = Math.max(1e-9, start.box.width),
    height = Math.max(1e-9, start.box.height);
  return {
    fx: (midpoint.x - start.box.left) / width,
    fy: (midpoint.y - start.box.top) / height,
    midpoint,
    distance: Math.max(MIN_PINCH_DISTANCE, pinchDistance(a, b)),
    zoom: start.zoom,
  };
}

export type PinchView = {
  /** New view zoom, clamped to [min, max]. */
  zoom: number;
  /** Current midpoint of the fingers: where the anchored image point belongs. */
  midpoint: PinchPoint;
  /**
   * Where the image box should be once the zoom is applied, in client
   * coordinates: same anchored point, now under `midpoint`. Useful to
   * predict the result; the editor measures the real box and scrolls with
   * `pinchScrollDelta` because layout (centring, padding) may differ.
   */
  box: PinchBox;
};

/**
 * Zoom and image placement for the fingers' current positions. `startBox` is
 * the image box when the pinch began (see `PinchStart.box`).
 */
export function updatePinch(
  anchor: PinchAnchor,
  current: readonly [PinchPoint, PinchPoint],
  startBox: PinchBox,
  limits: { min?: number; max?: number } = {},
): PinchView {
  const min = limits.min ?? MIN_VIEW_ZOOM,
    max = limits.max ?? MAX_VIEW_ZOOM;
  const [a, b] = current;
  const valid = finitePoint(a) && finitePoint(b);
  const midpoint = valid ? pinchMidpoint(a, b) : anchor.midpoint;
  const distance = valid ? Math.max(MIN_PINCH_DISTANCE, pinchDistance(a, b)) : anchor.distance;
  const zoom = clampZoom(anchor.zoom * (distance / anchor.distance), min, max);
  const scale = zoom / Math.max(1e-9, clampZoom(anchor.zoom, min, max));
  const width = startBox.width * scale,
    height = startBox.height * scale;
  return {
    zoom,
    midpoint,
    box: {
      left: midpoint.x - anchor.fx * width,
      top: midpoint.y - anchor.fy * height,
      width,
      height,
    },
  };
}

/**
 * Scroll change (add to the stage's scrollLeft/scrollTop) that brings the
 * anchored image point, now displayed in `box`, under `midpoint`.
 */
export function pinchScrollDelta(
  anchor: Pick<PinchAnchor, 'fx' | 'fy'>,
  box: PinchBox,
  midpoint: PinchPoint,
): { dx: number; dy: number } {
  return {
    dx: box.left + anchor.fx * box.width - midpoint.x,
    dy: box.top + anchor.fy * box.height - midpoint.y,
  };
}

/**
 * Touch pointer bookkeeping for the canvas. A pinch starts when a second
 * touch lands while one is down; it ends when either pinching finger lifts.
 * After a pinch nothing reaches the tools until every finger has lifted, so
 * the finger left on the glass cannot paint or move a layer.
 */
export type TouchSession = {
  /** Contacts currently down, by pointerId, in press order. */
  pointers: Map<number, PinchPoint>;
  /** The two pointers driving the pinch, while one is in progress. */
  pinch: readonly [number, number] | null;
  /** Every contact of this touch session goes to the pinch, not to tools. */
  captured: boolean;
};

export function createTouchSession(): TouchSession {
  return { pointers: new Map(), pinch: null, captured: false };
}

export type TouchDownResult =
  /** A single contact: the tools handle it as usual. */
  | { kind: 'tool' }
  /**
   * This contact starts a pinch with an earlier one. `cancel` is the contact
   * whose tool gesture must be aborted (null when the tools never had it:
   * a re-pinch with the finger left down after an earlier pinch).
   */
  | { kind: 'pinch-start'; pinch: readonly [number, number]; cancel: number | null }
  /** A third contact during a pinch: ignore it. */
  | { kind: 'ignore' };

/**
 * Record a contact landing. `primary` is PointerEvent.isPrimary: the first
 * finger of a new touch sequence, so any contact still recorded lost its
 * release (an app switch, a gesture taken by the browser) and is dropped
 * instead of turning this press into a pinch.
 */
export function touchDown(session: TouchSession, id: number, at: PinchPoint, primary = false): TouchDownResult {
  if (primary) {
    session.pointers.clear();
    session.pinch = null;
    session.captured = false;
  }
  session.pointers.delete(id);
  session.pointers.set(id, { x: at.x, y: at.y });
  if (session.pinch) return { kind: 'ignore' };
  if (session.pointers.size < 2) return session.captured ? { kind: 'ignore' } : { kind: 'tool' };
  // Pair this contact with the most recent other one still down.
  const others = [...session.pointers.keys()].filter((key) => key !== id);
  const partner = others[others.length - 1];
  const cancel = session.captured ? null : partner;
  session.pinch = [partner, id];
  session.captured = true;
  return { kind: 'pinch-start', pinch: session.pinch, cancel };
}

export type TouchMoveResult =
  | { kind: 'tool' }
  | { kind: 'pinch'; pointers: readonly [PinchPoint, PinchPoint] }
  | { kind: 'ignore' };

export function touchMove(session: TouchSession, id: number, at: PinchPoint): TouchMoveResult {
  if (!session.pointers.has(id)) return session.captured ? { kind: 'ignore' } : { kind: 'tool' };
  session.pointers.set(id, { x: at.x, y: at.y });
  if (!session.captured) return { kind: 'tool' };
  if (!session.pinch || !session.pinch.includes(id)) return { kind: 'ignore' };
  const a = session.pointers.get(session.pinch[0]),
    b = session.pointers.get(session.pinch[1]);
  return a && b ? { kind: 'pinch', pointers: [a, b] } : { kind: 'ignore' };
}

export type TouchUpResult =
  | { kind: 'tool' }
  /** A pinching finger lifted: the pinch is over (others may still be down). */
  | { kind: 'pinch-end'; idle: boolean }
  /** A captured contact lifted; `idle` once no finger is left. */
  | { kind: 'ignore'; idle: boolean };

export function touchUp(session: TouchSession, id: number): TouchUpResult {
  const known = session.pointers.delete(id);
  const idle = session.pointers.size === 0;
  if (!session.captured) return { kind: 'tool' };
  let result: TouchUpResult = { kind: 'ignore', idle };
  if (known && session.pinch?.includes(id)) {
    session.pinch = null;
    result = { kind: 'pinch-end', idle };
  }
  if (idle) session.captured = false;
  return result;
}

/** Hold time (ms) before a still touch on the canvas counts as a long-press. */
export const LONG_PRESS_MS = 500;
/**
 * Travel (CSS px) a touch may make and still be a long-press, and that a Move
 * tool touch must exceed before the layer starts to move, so finger jitter
 * during a long-press neither cancels it nor nudges the layer.
 */
export const TOUCH_SLOP = 10;

/** Whether a contact has travelled beyond the touch slop from where it landed. */
export function beyondTouchSlop(start: PinchPoint, at: PinchPoint, slop = TOUCH_SLOP): boolean {
  return Math.hypot(at.x - start.x, at.y - start.y) > slop;
}
