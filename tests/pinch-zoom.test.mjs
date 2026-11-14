import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONG_PRESS_MS,
  MIN_PINCH_DISTANCE,
  TOUCH_SLOP,
  beginPinch,
  beyondTouchSlop,
  createTouchSession,
  pinchDistance,
  pinchMidpoint,
  pinchScrollDelta,
  touchDown,
  touchMove,
  touchUp,
  updatePinch,
} from '../src/pinchZoom.ts';
import { MAX_VIEW_ZOOM, MIN_VIEW_ZOOM } from '../src/viewZoom.ts';

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);

/** Client point of an image fraction inside a box. */
const at = (box, fx, fy) => ({ x: box.left + fx * box.width, y: box.top + fy * box.height });

test('distance and midpoint of two contacts', () => {
  assert.equal(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(pinchMidpoint({ x: 10, y: 20 }, { x: 30, y: 60 }), { x: 20, y: 40 });
});

test('beginPinch anchors the image point under the start midpoint as box fractions', () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };
  const anchor = beginPinch({ pointers: [{ x: 200, y: 100 }, { x: 300, y: 200 }], zoom: 100, box });
  close(anchor.fx, 0.375);
  close(anchor.fy, 0.5);
  assert.deepEqual(anchor.midpoint, { x: 250, y: 150 });
  close(anchor.distance, Math.hypot(100, 100));
  assert.equal(anchor.zoom, 100);
});

test('spreading zooms in by the distance ratio and pinching zooms out', () => {
  const box = { left: 0, top: 0, width: 1000, height: 800 };
  const anchor = beginPinch({ pointers: [{ x: 400, y: 400 }, { x: 600, y: 400 }], zoom: 100, box });
  // Distance 200 -> 400: twice the zoom.
  assert.equal(updatePinch(anchor, [{ x: 300, y: 400 }, { x: 700, y: 400 }], box).zoom, 200);
  // Distance 200 -> 100: half the zoom.
  assert.equal(updatePinch(anchor, [{ x: 450, y: 400 }, { x: 550, y: 400 }], box).zoom, 50);
  // Unchanged distance (a two-finger pan or rotation) keeps the zoom.
  assert.equal(updatePinch(anchor, [{ x: 500, y: 300 }, { x: 500, y: 500 }], box).zoom, 100);
});

test('the zoom is relative to the start zoom, not the previous sample', () => {
  const box = { left: 0, top: 0, width: 500, height: 500 };
  const anchor = beginPinch({ pointers: [{ x: 0, y: 0 }, { x: 100, y: 0 }], zoom: 300, box });
  for (const distance of [150, 220, 90, 300]) {
    const view = updatePinch(anchor, [{ x: 0, y: 0 }, { x: distance, y: 0 }], box);
    close(view.zoom, (300 * distance) / 100);
  }
});

test('zoom clamps to the editor range and to custom limits', () => {
  const box = { left: 0, top: 0, width: 500, height: 500 };
  const anchor = beginPinch({ pointers: [{ x: 0, y: 0 }, { x: 100, y: 0 }], zoom: 1600, box });
  assert.equal(updatePinch(anchor, [{ x: 0, y: 0 }, { x: 1000, y: 0 }], box).zoom, MAX_VIEW_ZOOM);
  const low = beginPinch({ pointers: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], zoom: 4, box });
  assert.equal(updatePinch(low, [{ x: 0, y: 0 }, { x: 20, y: 0 }], box).zoom, MIN_VIEW_ZOOM);
  assert.equal(updatePinch(anchor, [{ x: 0, y: 0 }, { x: 1000, y: 0 }], box, { min: 10, max: 2000 }).zoom, 2000);
  assert.equal(updatePinch(low, [{ x: 0, y: 0 }, { x: 20, y: 0 }], box, { min: 3, max: 2000 }).zoom, 3);
});

test('contacts that (almost) touch never explode the ratio', () => {
  const box = { left: 0, top: 0, width: 500, height: 500 };
  const anchor = beginPinch({ pointers: [{ x: 50, y: 50 }, { x: 50, y: 50 }], zoom: 100, box });
  assert.equal(anchor.distance, MIN_PINCH_DISTANCE);
  const view = updatePinch(anchor, [{ x: 50, y: 50 }, { x: 50 + MIN_PINCH_DISTANCE * 2, y: 50 }], box);
  assert.equal(view.zoom, 200);
  // Fingers closing to one spot stay at the floor distance, no zero/NaN zoom.
  const pinched = updatePinch(anchor, [{ x: 50, y: 50 }, { x: 50, y: 50 }], box);
  assert.equal(pinched.zoom, 100);
});

test('non-finite samples keep the start midpoint and zoom', () => {
  const box = { left: 0, top: 0, width: 500, height: 500 };
  const anchor = beginPinch({ pointers: [{ x: 100, y: 100 }, { x: 200, y: 100 }], zoom: 150, box });
  const view = updatePinch(anchor, [{ x: Number.NaN, y: 1 }, { x: 200, y: 100 }], box);
  assert.equal(view.zoom, 150);
  assert.deepEqual(view.midpoint, anchor.midpoint);
});

test('the anchored image point stays under the moving midpoint (zoom and pan together)', () => {
  const box = { left: -120, top: 40, width: 800, height: 600 };
  const anchor = beginPinch({ pointers: [{ x: 100, y: 200 }, { x: 300, y: 260 }], zoom: 100, box });
  const before = { fx: anchor.fx, fy: anchor.fy };
  const current = [{ x: 60, y: 120 }, { x: 420, y: 300 }];
  const view = updatePinch(anchor, current, box);
  const mid = pinchMidpoint(current[0], current[1]);
  const point = at(view.box, before.fx, before.fy);
  close(point.x, mid.x, 1e-9);
  close(point.y, mid.y, 1e-9);
  // The box scales by the zoom ratio.
  close(view.box.width / box.width, view.zoom / 100);
  close(view.box.height / box.height, view.zoom / 100);
});

test('a two-finger pan with no spread translates the image by the midpoint movement', () => {
  const box = { left: 10, top: 20, width: 400, height: 300 };
  const anchor = beginPinch({ pointers: [{ x: 100, y: 100 }, { x: 200, y: 100 }], zoom: 100, box });
  const view = updatePinch(anchor, [{ x: 130, y: 60 }, { x: 230, y: 60 }], box);
  assert.equal(view.zoom, 100);
  close(view.box.left, box.left + 30);
  close(view.box.top, box.top - 40);
  close(view.box.width, box.width);
});

test('pinchScrollDelta scrolls a laid-out box so the anchor is under the midpoint', () => {
  const box = { left: 0, top: 0, width: 400, height: 400 };
  const anchor = beginPinch({ pointers: [{ x: 150, y: 200 }, { x: 250, y: 200 }], zoom: 100, box });
  // After the zoom doubled, layout put the image at a different place.
  const laidOut = { left: -20, top: 30, width: 800, height: 800 };
  const midpoint = { x: 220, y: 240 };
  const { dx, dy } = pinchScrollDelta(anchor, laidOut, midpoint);
  // Scrolling by (dx, dy) moves the box by (-dx, -dy).
  const scrolled = { ...laidOut, left: laidOut.left - dx, top: laidOut.top - dy };
  const point = at(scrolled, anchor.fx, anchor.fy);
  close(point.x, midpoint.x);
  close(point.y, midpoint.y);
  // Already in place: no scroll.
  assert.deepEqual(pinchScrollDelta(anchor, scrolled, midpoint), { dx: 0, dy: 0 });
});

test('pinchScrollDelta agrees with the predicted box from updatePinch', () => {
  const box = { left: 30, top: 60, width: 640, height: 480 };
  const anchor = beginPinch({ pointers: [{ x: 200, y: 200 }, { x: 260, y: 280 }], zoom: 50, box });
  const view = updatePinch(anchor, [{ x: 150, y: 150 }, { x: 330, y: 390 }], box);
  const delta = pinchScrollDelta(anchor, view.box, view.midpoint);
  close(delta.dx, 0, 1e-9);
  close(delta.dy, 0, 1e-9);
});

test('a single touch belongs to the tools; a second starts a pinch that aborts the first', () => {
  const session = createTouchSession();
  assert.deepEqual(touchDown(session, 1, { x: 10, y: 10 }, true), { kind: 'tool' });
  assert.deepEqual(touchMove(session, 1, { x: 12, y: 10 }), { kind: 'tool' });
  const second = touchDown(session, 2, { x: 100, y: 10 });
  assert.equal(second.kind, 'pinch-start');
  assert.deepEqual(second.pinch, [1, 2]);
  assert.equal(second.cancel, 1);
  const moved = touchMove(session, 2, { x: 120, y: 10 });
  assert.equal(moved.kind, 'pinch');
  assert.deepEqual(moved.pointers, [{ x: 12, y: 10 }, { x: 120, y: 10 }]);
});

test('a third finger during a pinch is ignored and does not drive it', () => {
  const session = createTouchSession();
  touchDown(session, 1, { x: 0, y: 0 }, true);
  touchDown(session, 2, { x: 50, y: 0 });
  assert.deepEqual(touchDown(session, 3, { x: 90, y: 90 }), { kind: 'ignore' });
  assert.deepEqual(touchMove(session, 3, { x: 95, y: 95 }), { kind: 'ignore' });
  assert.deepEqual(touchUp(session, 3), { kind: 'ignore', idle: false });
  assert.equal(touchMove(session, 1, { x: 1, y: 0 }).kind, 'pinch');
});

test('after a pinch the leftover finger reaches no tool until every finger lifts', () => {
  const session = createTouchSession();
  touchDown(session, 1, { x: 0, y: 0 }, true);
  touchDown(session, 2, { x: 50, y: 0 });
  assert.deepEqual(touchUp(session, 2), { kind: 'pinch-end', idle: false });
  assert.deepEqual(touchMove(session, 1, { x: 30, y: 30 }), { kind: 'ignore' });
  assert.deepEqual(touchUp(session, 1), { kind: 'ignore', idle: true });
  // A fresh press is the tools' again.
  assert.deepEqual(touchDown(session, 3, { x: 5, y: 5 }, true), { kind: 'tool' });
  assert.deepEqual(touchUp(session, 3), { kind: 'tool' });
});

test('putting a second finger back after a pinch re-pinches without a tool abort', () => {
  const session = createTouchSession();
  touchDown(session, 1, { x: 0, y: 0 }, true);
  touchDown(session, 2, { x: 50, y: 0 });
  touchUp(session, 1);
  const again = touchDown(session, 4, { x: 80, y: 80 });
  assert.equal(again.kind, 'pinch-start');
  assert.deepEqual(again.pinch, [2, 4]);
  assert.equal(again.cancel, null);
  assert.deepEqual(touchUp(session, 2), { kind: 'pinch-end', idle: false });
  assert.deepEqual(touchUp(session, 4), { kind: 'ignore', idle: true });
});

test('both pinching fingers lifting together end the pinch once', () => {
  const session = createTouchSession();
  touchDown(session, 1, { x: 0, y: 0 }, true);
  touchDown(session, 2, { x: 50, y: 0 });
  assert.deepEqual(touchUp(session, 1), { kind: 'pinch-end', idle: false });
  assert.deepEqual(touchUp(session, 2), { kind: 'ignore', idle: true });
  assert.equal(session.captured, false);
  assert.equal(session.pinch, null);
});

test('a primary press drops contacts whose release was lost', () => {
  const session = createTouchSession();
  touchDown(session, 1, { x: 0, y: 0 }, true);
  // Pointer 1 never released (e.g. the browser took the gesture). A new
  // touch sequence starts with a primary contact: it must not pinch.
  assert.deepEqual(touchDown(session, 7, { x: 10, y: 10 }, true), { kind: 'tool' });
  assert.equal(session.pointers.size, 1);
  // Unknown pointers are not the session's.
  assert.deepEqual(touchUp(session, 1), { kind: 'tool' });
});

test('long-press slop and timing', () => {
  assert.equal(LONG_PRESS_MS, 500);
  assert.equal(TOUCH_SLOP, 10);
  assert.equal(beyondTouchSlop({ x: 0, y: 0 }, { x: 6, y: 8 }), false); // exactly 10
  assert.equal(beyondTouchSlop({ x: 0, y: 0 }, { x: 7, y: 8 }), true);
  assert.equal(beyondTouchSlop({ x: 0, y: 0 }, { x: 3, y: 0 }, 2), true);
});
