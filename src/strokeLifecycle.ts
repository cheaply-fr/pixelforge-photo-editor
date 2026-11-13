/**
 * Where a single-press stroke begins and ends.
 *
 * A stroke owns the pointer from its press to its release. Browsers do not
 * always deliver that release: a tab or app pane hidden mid-stroke, a window
 * switch or a pointer capture lost to the OS can swallow the pointerup. A
 * mouse and a pen keep the same pointerId for every press, so without these
 * checks the next press (and the hover moves before it) were taken as more of
 * the old stroke, painting a straight line from the previous dab's end.
 *
 * Every helper is DOM-free so the rules are checked in Node tests.
 */

export type StrokePointerEvent = {
  pointerId: number;
  pointerType?: string;
  /** Pressed buttons; 0 means no button or contact is down. */
  buttons?: number;
};

export type StrokeGestureState = {
  /** The release was seen (or synthesized); later moves are ignored. */
  released?: boolean;
  /** Click-to-place tools (lassos, pens) span several presses by design. */
  multiPress: boolean;
};

/** Upper bound on moves buffered while a stroke's layer is prepared. */
export const MAX_BUFFERED_STROKE_MOVES = 4096;

/** No button or contact is down for this sample (a hover). */
export function isHoverSample(event: { buttons?: number }): boolean {
  return typeof event.buttons === 'number' && event.buttons === 0;
}

/**
 * A move that arrives for a live single-press stroke with nothing pressed:
 * the release was lost, so the stroke must end where it last was instead of
 * following the hovering pointer.
 */
export function moveShowsLostRelease(
  gesture: StrokeGestureState | null | undefined,
  event: StrokePointerEvent,
): boolean {
  return Boolean(gesture && !gesture.released && !gesture.multiPress && isHoverSample(event));
}

/**
 * A new press of the pointer that owns a live single-press stroke: a pointer
 * cannot be pressed twice, so the earlier release was lost. Touch contacts get
 * a new pointerId per press, so another touch is a second finger, not this.
 */
export function pressShowsLostRelease(
  gesture: StrokeGestureState | null | undefined,
  owner: number | null,
  event: StrokePointerEvent,
): boolean {
  return Boolean(
    gesture &&
      !gesture.released &&
      !gesture.multiPress &&
      owner !== null &&
      owner === event.pointerId &&
      event.pointerType !== 'touch',
  );
}

export type BufferedStroke<E> = {
  pointerId: number;
  moves: E[];
  release?: E;
};

/**
 * Whether a move made while a stroke's layer is still prepared belongs to
 * that stroke and should be replayed into it. Moves after its release, hover
 * moves and moves of other pointers are not part of it.
 */
export function shouldBufferStrokeMove<E>(
  pending: BufferedStroke<E> | null | undefined,
  event: StrokePointerEvent,
): boolean {
  return Boolean(
    pending &&
      pending.pointerId === event.pointerId &&
      !pending.release &&
      !isHoverSample(event) &&
      pending.moves.length < MAX_BUFFERED_STROKE_MOVES,
  );
}
