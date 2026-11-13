import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewScheduler, requestFrameOrTimeout } from '../src/previewScheduler.ts';

/** Deterministic animation-frame queue for the scheduler under test. */
function frames() {
  let next = 0;
  const queue = new Map();
  return {
    requestFrame: (callback) => {
      const handle = ++next;
      queue.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      queue.delete(handle);
    },
    get size() {
      return queue.size;
    },
    tick() {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('many requests within one frame produce one render with the latest state', () => {
  const clock = frames();
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  let state = 0;
  for (let i = 0; i < 500; i++) {
    state += 1;
    scheduler.request(() => state);
  }
  assert.equal(clock.size, 1, 'only one animation frame is armed');
  assert.deepEqual(rendered, [], 'nothing renders before the frame');
  state = 999;
  clock.tick();
  assert.deepEqual(rendered, [999], 'the frame reads the newest state when it runs');
  assert.deepEqual(scheduler.stats, { requested: 500, rendered: 1, coalesced: 499 });
  clock.tick();
  assert.equal(rendered.length, 1, 'no extra frames run without new requests');
});

test('keeps one render in flight and re-arms with the latest request after it settles', async () => {
  const clock = frames();
  const renders = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      const pending = deferred();
      renders.push({ value, pending });
      return pending.promise;
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  scheduler.request(() => 'a');
  clock.tick();
  assert.equal(renders.length, 1);
  assert.equal(scheduler.inFlight, true);
  scheduler.request(() => 'b');
  scheduler.request(() => 'c');
  assert.equal(clock.size, 0, 'no frame arms while a render is in flight');
  clock.tick();
  assert.equal(renders.length, 1);
  renders[0].pending.resolve();
  await settle();
  assert.equal(scheduler.inFlight, false);
  assert.equal(clock.size, 1, 'settling re-arms one frame for the pending request');
  clock.tick();
  assert.deepEqual(
    renders.map((r) => r.value),
    ['a', 'c'],
  );
  // A rejected (for example superseded) render also releases the gate.
  scheduler.request(() => 'd');
  renders[1].pending.reject(new Error('aborted'));
  await settle();
  clock.tick();
  assert.deepEqual(
    renders.map((r) => r.value),
    ['a', 'c', 'd'],
  );
});

test('cancel drops the pending preview and the armed frame', async () => {
  const clock = frames();
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  scheduler.request(() => 'stale gesture');
  scheduler.cancel();
  assert.equal(scheduler.pending, false);
  assert.equal(clock.size, 0);
  clock.tick();
  assert.deepEqual(rendered, []);
  scheduler.request(() => 'next gesture');
  clock.tick();
  assert.deepEqual(rendered, ['next gesture']);
});

test('a render settling after cancel cannot re-arm or block a newer gesture', async () => {
  const clock = frames();
  const renders = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      const pending = deferred();
      renders.push({ value, pending });
      return pending.promise;
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  scheduler.request(() => 'old');
  clock.tick();
  scheduler.request(() => 'old pending');
  scheduler.cancel();
  // A new gesture starts while the cancelled render is still settling.
  scheduler.request(() => 'new');
  assert.equal(clock.size, 1, 'a cancelled render does not gate the new gesture');
  clock.tick();
  assert.deepEqual(
    renders.map((r) => r.value),
    ['old', 'new'],
  );
  renders[0].pending.resolve();
  await settle();
  assert.equal(scheduler.inFlight, true, 'the stale settlement keeps the new gate');
  assert.equal(clock.size, 0);
  renders[1].pending.resolve();
  await settle();
  assert.equal(scheduler.inFlight, false);
});

test('a request returning null (ended gesture) never renders', () => {
  const clock = frames();
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  let active = true;
  scheduler.request(() => (active ? 'gesture' : null));
  active = false; // committed before the frame ran
  clock.tick();
  assert.deepEqual(rendered, []);
  assert.equal(scheduler.stats.rendered, 0);
});

test('flush runs the pending preview immediately without waiting for a frame', () => {
  const clock = frames();
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  scheduler.request(() => 'latest');
  scheduler.flush();
  assert.deepEqual(rendered, ['latest']);
  assert.equal(clock.size, 0, 'the armed frame was released');
  scheduler.flush();
  assert.deepEqual(rendered, ['latest'], 'flushing with nothing pending is a no-op');
});

test('a throwing render releases the gate', () => {
  const clock = frames();
  let calls = 0;
  const scheduler = createPreviewScheduler({
    render: () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  scheduler.request(() => 1);
  clock.tick();
  scheduler.request(() => 2);
  clock.tick();
  assert.equal(calls, 2);
  assert.equal(scheduler.inFlight, false);
});

test('falls back to timers when requestAnimationFrame is unavailable', async () => {
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
  });
  scheduler.request(() => 'a');
  scheduler.request(() => 'b');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(rendered, ['b']);
});

/** Manual frame and timer queues for requestFrameOrTimeout. */
function frameClock({ hidden = false } = {}) {
  let next = 0;
  const frames = new Map(), timers = new Map();
  return {
    hidden: () => hidden,
    setHidden(value) {
      hidden = value;
    },
    requestFrame: (callback) => {
      const handle = ++next;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => frames.delete(handle),
    setTimer: (callback, ms) => {
      const handle = ++next;
      timers.set(handle, { callback, ms });
      return handle;
    },
    clearTimer: (handle) => timers.delete(handle),
    frames,
    timers,
    tickFrames() {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback();
    },
    tickTimers() {
      const due = [...timers.values()];
      timers.clear();
      for (const { callback } of due) callback();
    },
  };
}

test('frame-or-timeout runs once on the frame and cancels its fallback timer', () => {
  const clock = frameClock();
  let runs = 0;
  requestFrameOrTimeout(() => (runs += 1), 100, clock);
  assert.equal(clock.frames.size, 1);
  assert.equal(clock.timers.size, 1);
  assert.equal([...clock.timers.values()][0].ms, 100);
  clock.tickFrames();
  assert.equal(runs, 1);
  assert.equal(clock.timers.size, 0, 'the fallback timer is cleared');
  clock.tickTimers();
  assert.equal(runs, 1);
});

test('frame-or-timeout still runs when frames pause after the request (page hidden mid-stroke)', () => {
  const clock = frameClock();
  let runs = 0;
  requestFrameOrTimeout(() => (runs += 1), 100, clock);
  clock.setHidden(true);
  // No frame ever comes; the timer does.
  clock.tickTimers();
  assert.equal(runs, 1);
  assert.equal(clock.frames.size, 0, 'the paused frame is cancelled');
  clock.tickFrames();
  assert.equal(runs, 1);
});

test('frame-or-timeout uses a short timer and no frame on a hidden page; cancel stops both', () => {
  const clock = frameClock({ hidden: true });
  let runs = 0;
  const request = requestFrameOrTimeout(() => (runs += 1), 100, clock);
  assert.equal(clock.frames.size, 0);
  assert.equal([...clock.timers.values()][0].ms, 16);
  request.cancel();
  assert.equal(clock.timers.size, 0);
  clock.tickTimers();
  assert.equal(runs, 0);
});

test('a scheduler on frame-or-timeout keeps rendering previews while frames are paused', () => {
  const clock = frameClock({ hidden: true });
  const rendered = [];
  const scheduler = createPreviewScheduler({
    render: (value) => {
      rendered.push(value);
    },
    requestFrame: (callback) => requestFrameOrTimeout(callback, 100, clock),
    cancelFrame: (handle) => handle.cancel(),
  });
  for (let sample = 1; sample <= 3; sample += 1) {
    scheduler.request(() => sample);
    clock.tickTimers();
  }
  assert.deepEqual(rendered, [1, 2, 3], 'every preview ran without a single animation frame');
});
