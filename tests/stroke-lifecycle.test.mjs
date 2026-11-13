import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BUFFERED_STROKE_MOVES,
  isHoverSample,
  moveShowsLostRelease,
  pressShowsLostRelease,
  shouldBufferStrokeMove,
} from '../src/strokeLifecycle.ts';

const live = { released: false, multiPress: false };
const mouse = (buttons) => ({ pointerId: 1, pointerType: 'mouse', buttons });

test('a hover sample has no button pressed; unknown buttons are not a hover', () => {
  assert.equal(isHoverSample({ buttons: 0 }), true);
  assert.equal(isHoverSample({ buttons: 1 }), false);
  assert.equal(isHoverSample({ buttons: 2 }), false);
  assert.equal(isHoverSample({}), false);
});

test('a hover move ends a live single-press stroke whose release was lost', () => {
  assert.equal(moveShowsLostRelease(live, mouse(0)), true);
  assert.equal(moveShowsLostRelease(live, { pointerId: 7, pointerType: 'pen', buttons: 0 }), true);
  // Pressed moves continue the stroke.
  assert.equal(moveShowsLostRelease(live, mouse(1)), false);
  // A released stroke is already ending; click-to-place tools hover by design.
  assert.equal(moveShowsLostRelease({ released: true, multiPress: false }, mouse(0)), false);
  assert.equal(moveShowsLostRelease({ released: false, multiPress: true }, mouse(0)), false);
  assert.equal(moveShowsLostRelease(null, mouse(0)), false);
});

test('a second press of the owning mouse or pen means the first release was lost', () => {
  assert.equal(pressShowsLostRelease(live, 1, mouse(1)), true);
  assert.equal(pressShowsLostRelease(live, 5, { pointerId: 5, pointerType: 'pen', buttons: 1 }), true);
  // Another pointer (a second finger, another pen) never ends the stroke.
  assert.equal(pressShowsLostRelease(live, 1, { pointerId: 2, pointerType: 'mouse', buttons: 1 }), false);
  assert.equal(pressShowsLostRelease(live, 3, { pointerId: 3, pointerType: 'touch', buttons: 1 }), false);
  assert.equal(pressShowsLostRelease(live, null, mouse(1)), false);
  assert.equal(pressShowsLostRelease({ released: true, multiPress: false }, 1, mouse(1)), false);
  // Pens and lassos are pressed once per anchor.
  assert.equal(pressShowsLostRelease({ released: false, multiPress: true }, 1, mouse(1)), false);
  assert.equal(pressShowsLostRelease(undefined, 1, mouse(1)), false);
});

test('moves buffered while a stroke starts stop at its release and skip hovers', () => {
  const pending = { pointerId: 1, moves: [] };
  assert.equal(shouldBufferStrokeMove(pending, mouse(1)), true);
  assert.equal(shouldBufferStrokeMove(pending, mouse(0)), false, 'hover moves are not stroke samples');
  assert.equal(shouldBufferStrokeMove(pending, { pointerId: 2, buttons: 1 }), false, 'other pointers are ignored');
  // After the (possibly replayed) release, the next press's moves are not this stroke.
  const released = { pointerId: 1, moves: [], release: {} };
  assert.equal(shouldBufferStrokeMove(released, mouse(1)), false);
  assert.equal(shouldBufferStrokeMove(null, mouse(1)), false);
  const full = { pointerId: 1, moves: Array.from({ length: MAX_BUFFERED_STROKE_MOVES }) };
  assert.equal(shouldBufferStrokeMove(full, mouse(1)), false, 'the buffer is bounded');
});

test('a quick series of dabs never joins: each lost release ends its own dab', () => {
  // Simulate the editor rules over an event log: mouse dabs at different
  // spots whose pointerups were dropped, with hover moves between them.
  const log = [
    { type: 'down', x: 10, y: 10, buttons: 1 },
    { type: 'move', x: 60, y: 10, buttons: 0 },
    { type: 'down', x: 60, y: 10, buttons: 1 },
    { type: 'down', x: 110, y: 10, buttons: 1 },
    { type: 'up', x: 110, y: 10, buttons: 0 },
  ];
  const strokes = [];
  let gesture = null;
  const end = () => {
    if (gesture) strokes.push(gesture.points);
    gesture = null;
  };
  for (const event of log) {
    const pointer = { pointerId: 1, pointerType: 'mouse', buttons: event.buttons };
    if (event.type === 'down') {
      if (pressShowsLostRelease(gesture && { released: false, multiPress: false }, 1, pointer)) end();
      gesture = { points: [[event.x, event.y]] };
    } else if (event.type === 'move') {
      if (moveShowsLostRelease(gesture && { released: false, multiPress: false }, pointer)) end();
      else gesture?.points.push([event.x, event.y]);
    } else end();
  }
  assert.deepEqual(strokes, [[[10, 10]], [[60, 10]], [[110, 10]]]);
});
