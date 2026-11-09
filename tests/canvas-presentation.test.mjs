import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RENDER_STATUS_HIDE_DELAY_MS,
  RENDER_STATUS_SHOW_DELAY_MS,
  canvasNeedsResize,
  createDelayedFlag,
  presentCanvasImage,
} from '../src/canvasPresentation.ts';

/**
 * A canvas double that records the order of backing-store and context
 * operations. Assigning width/height (even to the same value) is what clears
 * a real canvas, so it is logged as "clear-by-resize".
 */
function fakeCanvas(width, height, { withReset = true } = {}) {
  const log = [];
  let w = width,
    h = height;
  const context = {
    globalAlpha: 0.3,
    globalCompositeOperation: 'multiply',
    filter: 'blur(2px)',
    imageSmoothingEnabled: false,
    setTransform: (...args) => log.push(['setTransform', ...args]),
    clearRect: (...args) => log.push(['clearRect', ...args]),
    drawImage: (image, x, y) => log.push(['drawImage', image, x, y]),
  };
  if (withReset) context.reset = () => log.push(['reset']);
  return {
    log,
    context,
    get width() {
      return w;
    },
    set width(value) {
      w = value;
      log.push(['clear-by-resize', 'width', value]);
    },
    get height() {
      return h;
    },
    set height(value) {
      h = value;
      log.push(['clear-by-resize', 'height', value]);
    },
    getContext: () => context,
  };
}

test('canvasNeedsResize is true only when a dimension differs', () => {
  assert.equal(canvasNeedsResize({ width: 2646, height: 4096 }, 2646, 4096), false);
  assert.equal(canvasNeedsResize({ width: 2646, height: 4096 }, 2647, 4096), true);
  assert.equal(canvasNeedsResize({ width: 2646, height: 4096 }, 2646, 4095), true);
  assert.equal(canvasNeedsResize({ width: 300, height: 150 }, 1500, 1500), true);
});

test('presenting a same-size render never reallocates the canvas and draws right after resetting', () => {
  const target = fakeCanvas(1500, 1500);
  const image = { id: 'render' };
  assert.equal(presentCanvasImage(target, image, 1500, 1500), false);
  assert.deepEqual(target.log, [['reset'], ['drawImage', image, 0, 0]]);
});

test('presenting a resized render resizes once and then draws', () => {
  const target = fakeCanvas(300, 150);
  const image = { id: 'render' };
  assert.equal(presentCanvasImage(target, image, 2646, 4096), true);
  assert.deepEqual(target.log, [
    ['clear-by-resize', 'width', 2646],
    ['clear-by-resize', 'height', 4096],
    ['drawImage', image, 0, 0],
  ]);
  assert.equal(target.width, 2646);
  assert.equal(target.height, 4096);
  // A second render at the new size does not resize again.
  target.log.length = 0;
  presentCanvasImage(target, image, 2646, 4096);
  assert.equal(target.log.some(([op]) => op === 'clear-by-resize'), false);
});

test('without context.reset the defaults a resize restores are restored before a full clear and draw', () => {
  const target = fakeCanvas(800, 600, { withReset: false });
  const image = { id: 'render' };
  presentCanvasImage(target, image, 800, 600);
  assert.deepEqual(target.log, [
    ['setTransform', 1, 0, 0, 1, 0, 0],
    ['clearRect', 0, 0, 800, 600],
    ['drawImage', image, 0, 0],
  ]);
  assert.equal(target.context.globalAlpha, 1);
  assert.equal(target.context.globalCompositeOperation, 'source-over');
  assert.equal(target.context.filter, 'none');
  assert.equal(target.context.imageSmoothingEnabled, true);
});

/** Deterministic timers driven by an explicit clock. */
function clock() {
  let now = 0,
    next = 0;
  const timers = new Map();
  return {
    setTimer: (callback, ms) => {
      const handle = ++next;
      timers.set(handle, { at: now + ms, callback });
      return handle;
    },
    clearTimer: (handle) => timers.delete(handle),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = until;
    },
    get pending() {
      return timers.size;
    },
  };
}

function flag(showDelayMs = 250, hideDelayMs = 150) {
  const time = clock();
  const changes = [];
  const value = createDelayedFlag({
    showDelayMs,
    hideDelayMs,
    onChange: (shown) => changes.push(shown),
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
  });
  return { time, changes, value };
}

test('a render shorter than the show delay never changes the status', () => {
  const { time, changes, value } = flag();
  value.set(true);
  time.advance(249);
  value.set(false);
  time.advance(1000);
  assert.deepEqual(changes, []);
  assert.equal(value.shown, false);
  assert.equal(time.pending, 0);
});

test('many quick renders (stroke previews) never flicker the status', () => {
  const { time, changes, value } = flag();
  for (let index = 0; index < 50; index += 1) {
    value.set(true);
    time.advance(30);
    value.set(false);
    time.advance(16);
  }
  assert.deepEqual(changes, []);
});

test('a long render shows once and hides only after the hide delay', () => {
  const { time, changes, value } = flag();
  value.set(true);
  time.advance(250);
  assert.deepEqual(changes, [true]);
  value.set(false);
  time.advance(149);
  assert.equal(value.shown, true);
  time.advance(1);
  assert.deepEqual(changes, [true, false]);
});

test('back-to-back slow renders read as one busy period', () => {
  const { time, changes, value } = flag();
  // ~350 ms previews separated by one-frame gaps, as on a 62-layer document.
  for (let index = 0; index < 10; index += 1) {
    value.set(true);
    time.advance(350);
    value.set(false);
    time.advance(16);
  }
  time.advance(200);
  assert.deepEqual(changes, [true, false]);
});

test('repeated values are ignored and dispose cancels a pending change', () => {
  const { time, changes, value } = flag();
  value.set(false);
  value.set(true);
  value.set(true);
  value.dispose();
  time.advance(1000);
  assert.deepEqual(changes, []);
});

test('zero delays apply immediately', () => {
  const { changes, value } = flag(0, 0);
  value.set(true);
  value.set(false);
  assert.deepEqual(changes, [true, false]);
});

test('status delays stay short enough to report a real wait', () => {
  assert.ok(RENDER_STATUS_SHOW_DELAY_MS > 16 && RENDER_STATUS_SHOW_DELAY_MS <= 500);
  assert.ok(RENDER_STATUS_HIDE_DELAY_MS > 16 && RENDER_STATUS_HIDE_DELAY_MS <= 500);
});

test('the editor dims only while loading, never on aria-busy renders', () => {
  const css = readFileSync(new URL('../src/home.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /aria-busy[^{]*\{[^}]*opacity/);
  assert.match(css, /\.editor-shell\[data-loading=true\]\{opacity:\.5\}/);
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /data-loading=\{ready \? 'false' : 'true'\}/);
  const documentHook = readFileSync(new URL('../src/useDocument.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(documentHook, /target\.width\s*=/);
  assert.match(documentHook, /presentCanvasImage\(/);
});
