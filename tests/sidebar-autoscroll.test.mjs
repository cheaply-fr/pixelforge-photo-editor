import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_LIMITS,
  SidebarRevealCoordinator,
  announcementFor,
  defaultAlign,
  shouldMoveFocus,
} from '../src/sidebarAutoScroll.ts';

const FRAME_MS = 16;

/**
 * Deterministic fake of the browser side: a virtual clock, a frame queue, a
 * microtask queue and a 600 px sidebar over a model of section boxes. Every
 * side effect is logged so tests assert exact behaviour.
 */
function createEnvironment(options = {}) {
  const env = {
    time: 0,
    frames: new Map(),
    nextFrame: 1,
    timers: new Map(),
    nextTimer: 1,
    microtasks: [],
    scrollTop: 0,
    clientHeight: 600,
    scrollHeight: 4000,
    insetTop: 0,
    hidden: false,
    sections: new Map(Object.entries(options.sections ?? { 'tool-options': { top: 2000, height: 500 } })),
    collapsed: new Set(options.collapsed ?? []),
    reducedMotion: options.reducedMotion ?? false,
    interaction: false,
    focusLost: options.focusLost ?? true,
    expandBehaviour: options.expandBehaviour ?? 'immediate',
    writes: [],
    log: [],
    reports: [],
    maxQueuedFrames: 0,
  };
  const ports = {
    now: () => env.time,
    requestFrame(callback) {
      const handle = env.nextFrame++;
      env.frames.set(handle, callback);
      env.maxQueuedFrames = Math.max(env.maxQueuedFrames, env.frames.size);
      return handle;
    },
    cancelFrame(handle) {
      env.frames.delete(handle);
    },
    setTimer(callback, ms) {
      const handle = env.nextTimer++;
      env.timers.set(handle, { callback, at: env.time + ms });
      return handle;
    },
    clearTimer(handle) {
      env.timers.delete(handle);
    },
    queueMicrotask(callback) {
      env.microtasks.push(callback);
    },
    measure(request) {
      if (env.hidden) return { kind: 'hidden' };
      const box = env.sections.get(request.section);
      if (!box) return { kind: 'missing' };
      const keep = request.keep ? env.sections.get(request.keep) : undefined;
      return {
        kind: 'ok',
        geometry: {
          scrollTop: env.scrollTop,
          clientHeight: env.clientHeight,
          scrollHeight: env.scrollHeight,
          insetTop: env.insetTop,
          insetBottom: 0,
          sectionTop: box.top,
          sectionBottom: box.top + (env.collapsed.has(request.section) ? 30 : box.height),
          ...(keep ? { keepTop: keep.top, keepBottom: keep.top + keep.height } : {}),
        },
      };
    },
    isCollapsed: (section) => env.collapsed.has(section),
    expand(section) {
      env.log.push(['expand', section]);
      if (env.expandBehaviour === 'immediate') env.collapsed.delete(section);
    },
    readScrollTop: () => env.scrollTop,
    writeScrollTop(value) {
      const clamped = Math.max(0, Math.min(env.scrollHeight - env.clientHeight, value));
      env.scrollTop = Math.round(clamped); // browsers round to device pixels
      env.writes.push(env.scrollTop);
    },
    prefersReducedMotion: () => env.reducedMotion,
    isInteractionActive: () => env.interaction,
    highlight: (section) => env.log.push(['highlight', section]),
    clearHighlight: () => env.log.push(['clear-highlight']),
    announce: (message) => env.log.push(['announce', message]),
    canMoveFocus: () => env.focusLost,
    focusSection: (section) => env.log.push(['focus', section]),
    report: (snapshot) => env.reports.push(snapshot),
  };
  env.ports = ports;
  env.flushMicrotasks = () => {
    while (env.microtasks.length) env.microtasks.shift()();
  };
  /** Advance one animation frame (plus timers due by then). */
  env.frame = () => {
    env.time += FRAME_MS;
    for (const [handle, timer] of env.timers)
      if (timer.at <= env.time) {
        env.timers.delete(handle);
        timer.callback();
      }
    const due = [...env.frames];
    env.frames.clear();
    for (const [, callback] of due) callback();
  };
  env.runFrames = (count) => {
    for (let i = 0; i < count; i += 1) env.frame();
  };
  /** Run until idle (bounded so a bug can never hang the suite). */
  env.settle = (coordinator, limit = 1000) => {
    env.flushMicrotasks();
    let n = 0;
    while (coordinator.snapshot().phase !== 'idle' && n < limit) {
      env.frame();
      n += 1;
    }
    assert.ok(n < limit, 'coordinator did not reach idle');
    return n;
  };
  env.advance = (ms) => {
    const target = env.time + ms;
    while (env.time < target) env.frame();
  };
  env.logOf = (kind) => env.log.filter(([entry]) => entry === kind);
  return env;
}

const request = (patch = {}) => ({ section: 'tool-options', source: 'toolbar', origin: 'pointer', ...patch });

test('reduced motion: one instant write lands the header at the top', () => {
  const env = createEnvironment({ reducedMotion: true });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  assert.equal(coordinator.snapshot().phase, 'pending');
  assert.deepEqual(env.writes, [], 'nothing happens before the commit/microtask');
  env.settle(coordinator);
  assert.deepEqual(env.writes, [2000]);
  assert.equal(coordinator.snapshot().outcome, 'scrolled');
  assert.deepEqual(env.logOf('highlight'), [['highlight', 'tool-options']]);
  assert.deepEqual(env.logOf('announce'), [['announce', announcementFor('tool-options')]]);
  assert.equal(env.logOf('focus').length, 0, 'pointer triggers never move focus');
});

test('a commit notification resolves synchronously, before any frame', () => {
  const env = createEnvironment({ reducedMotion: true });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  coordinator.notifyCommit();
  assert.deepEqual(env.writes, [2000]);
  assert.equal(coordinator.snapshot().phase, 'settling');
});

test('animated scroll: monotonic frames, bounded duration, exact landing', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  const frames = env.settle(coordinator);
  assert.equal(env.writes.at(-1), 2000);
  for (let i = 1; i < env.writes.length; i += 1) assert.ok(env.writes[i] >= env.writes[i - 1], 'not monotonic');
  assert.ok(env.writes.length > 3, 'should animate over several frames');
  assert.ok(frames * FRAME_MS <= 320 + 6 * FRAME_MS, `took ${frames} frames`);
  assert.equal(coordinator.snapshot().outcome, 'scrolled');
  assert.ok(env.maxQueuedFrames <= 1, 'never more than one frame in flight');
});

test('already fully visible: no scroll, still highlighted, not announced', () => {
  const env = createEnvironment({ sections: { 'tool-options': { top: 100, height: 300 } } });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  assert.deepEqual(env.writes, []);
  assert.equal(coordinator.snapshot().outcome, 'visible');
  assert.equal(env.logOf('highlight').length, 1);
  assert.equal(env.logOf('announce').length, 0);
});

test('a section that renders late is awaited, then revealed', () => {
  const env = createEnvironment({ reducedMotion: true, sections: {} });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(3);
  assert.equal(coordinator.snapshot().phase, 'pending');
  env.sections.set('tool-options', { top: 1500, height: 200 });
  env.settle(coordinator);
  assert.deepEqual(env.writes, [1500]);
});

test('a section that never renders gives up within the bounds and leaves no work queued', () => {
  const env = createEnvironment({ sections: {} });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  const frames = env.settle(coordinator);
  assert.equal(coordinator.snapshot().outcome, 'missing');
  assert.ok(frames <= REVEAL_LIMITS.maxResolveAttempts, `${frames} frames`);
  assert.ok(frames * FRAME_MS <= REVEAL_LIMITS.resolveDeadlineMs + FRAME_MS);
  assert.equal(env.frames.size, 0);
  assert.equal(env.timers.size, 0);
  assert.deepEqual(env.writes, []);
  assert.equal(env.logOf('highlight').length, 0);
});

test('a hidden sidebar (full-screen mode) ends immediately without scrolling', () => {
  const env = createEnvironment();
  env.hidden = true;
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  assert.equal(coordinator.snapshot().outcome, 'hidden');
  assert.deepEqual(env.writes, []);
});

test('a collapsed section is expanded once, then revealed and announced', () => {
  const env = createEnvironment({ reducedMotion: true, collapsed: ['tool-options'], expandBehaviour: 'deferred' });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(2);
  assert.deepEqual(env.logOf('expand'), [['expand', 'tool-options']], 'expand requested exactly once');
  assert.deepEqual(env.writes, []);
  env.collapsed.delete('tool-options'); // React commits the expansion
  coordinator.notifyCommit();
  env.settle(coordinator);
  assert.deepEqual(env.writes, [2000]);
  assert.equal(env.logOf('announce').length, 1);
});

test('expanding a visible collapsed section announces without scrolling', () => {
  const env = createEnvironment({ collapsed: ['tool-options'], sections: { 'tool-options': { top: 50, height: 200 } } });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  assert.equal(coordinator.snapshot().outcome, 'visible');
  assert.equal(env.logOf('expand').length, 1);
  assert.equal(env.logOf('announce').length, 1);
  assert.deepEqual(env.writes, []);
});

test('an expansion that never commits is bounded', () => {
  const env = createEnvironment({ collapsed: ['tool-options'], expandBehaviour: 'never' });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  assert.equal(coordinator.snapshot().outcome, 'missing');
  assert.equal(env.logOf('expand').length, 1);
});

test('last trigger wins before resolution', () => {
  const env = createEnvironment({
    reducedMotion: true,
    sections: { 'tool-options': { top: 2000, height: 300 }, 'filter-effects': { top: 3000, height: 400 } },
  });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  coordinator.request(request({ section: 'filter-effects', source: 'menu' }));
  env.settle(coordinator);
  assert.deepEqual(env.writes, [3000]);
  assert.deepEqual(env.logOf('highlight'), [['highlight', 'filter-effects']]);
  assert.ok(env.reports.some((report) => report.outcome === 'superseded'));
});

test('last trigger wins mid-animation; the old animation never writes again', () => {
  const env = createEnvironment({
    sections: { 'tool-options': { top: 2000, height: 300 }, 'layer-properties': { top: 400, height: 200 } },
  });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(3);
  const midway = env.scrollTop;
  assert.ok(midway > 0 && midway < 2000);
  coordinator.request(request({ section: 'layer-properties', source: 'sidebar' }));
  assert.ok(env.logOf('clear-highlight').length >= 1, 'stale highlight removed');
  env.settle(coordinator);
  assert.equal(env.scrollTop, 400, 'nearest alignment scrolls up to the header');
  const afterSwitch = env.writes.slice(env.writes.indexOf(midway) + 1);
  for (let i = 1; i < afterSwitch.length; i += 1) assert.ok(afterSwitch[i] <= afterSwitch[i - 1], 'old animation wrote');
});

test('rapid bursts of triggers resolve only the last one', () => {
  const env = createEnvironment({
    reducedMotion: true,
    sections: { 'tool-options': { top: 1200, height: 100 }, 'filter-effects': { top: 2600, height: 100 } },
  });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  for (let i = 0; i < 50; i += 1)
    coordinator.request(request({ section: i % 2 ? 'tool-options' : 'filter-effects' }));
  env.settle(coordinator);
  assert.deepEqual(env.writes, [1200]);
  assert.equal(coordinator.snapshot().sequence, 50);
});

test('clear() lets a section-less trigger cancel a pending reveal', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  coordinator.clear();
  env.settle(coordinator);
  env.runFrames(30);
  assert.deepEqual(env.writes, []);
  assert.equal(coordinator.snapshot().outcome, 'no-section');
  assert.equal(coordinator.snapshot().section, null);
});

test('a manual scroll during the animation stops it where the user left it', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(3);
  env.scrollTop = 120; // the user drags the scrollbar back up
  const writesBefore = env.writes.length;
  env.settle(coordinator);
  assert.equal(coordinator.snapshot().outcome, 'interrupted');
  assert.equal(env.writes.length, writesBefore, 'wrote after interruption');
  assert.equal(env.scrollTop, 120);
});

test('wheel / touch intent interrupts the animation immediately', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(2);
  const position = env.scrollTop;
  coordinator.notifyUserScroll();
  env.runFrames(30);
  assert.equal(coordinator.snapshot().outcome, 'interrupted');
  assert.equal(env.scrollTop, position);
});

test('user intent while the reveal is still pending cancels it', () => {
  const env = createEnvironment({ sections: {} });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  coordinator.notifyUserScroll();
  env.sections.set('tool-options', { top: 2000, height: 100 });
  env.runFrames(10);
  assert.deepEqual(env.writes, []);
  assert.equal(coordinator.snapshot().outcome, 'interrupted');
});

test('no auto-scroll during an active stroke: deferred until release', () => {
  const env = createEnvironment({ reducedMotion: true });
  env.interaction = true;
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(20);
  assert.equal(coordinator.snapshot().phase, 'deferred');
  assert.deepEqual(env.writes, []);
  assert.equal(env.frames.size, 0, 'no frame polling while deferred');
  env.interaction = false;
  coordinator.notifyInteractionEnded();
  env.settle(coordinator);
  assert.deepEqual(env.writes, [2000]);
});

test('a deferred reveal expires if the interaction never ends', () => {
  const env = createEnvironment();
  env.interaction = true;
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.advance(REVEAL_LIMITS.maxDeferMs + FRAME_MS);
  assert.equal(coordinator.snapshot().outcome, 'expired');
  env.interaction = false;
  coordinator.notifyInteractionEnded();
  env.runFrames(10);
  assert.deepEqual(env.writes, []);
});

test('a stroke starting mid-animation freezes the sidebar', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(2);
  const position = env.scrollTop;
  env.interaction = true;
  env.runFrames(30);
  assert.equal(coordinator.snapshot().outcome, 'interrupted');
  assert.equal(env.scrollTop, position);
});

test('the animation tracks a layout shift and still lands on the header', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.runFrames(2);
  env.sections.set('tool-options', { top: 2400, height: 500 }); // a panel above grew
  env.settle(coordinator);
  assert.equal(env.scrollTop, 2400);
});

test('a late layout shift after landing is corrected a bounded number of times', () => {
  const env = createEnvironment({ reducedMotion: true });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.sections.set('tool-options', { top: 2300, height: 500 });
  env.settle(coordinator);
  assert.deepEqual(env.writes, [2000, 2300]);
  assert.ok(env.writes.length <= 1 + REVEAL_LIMITS.maxCorrections);
});

test('a user scroll right after landing is never overridden by the settle check', () => {
  const env = createEnvironment({ reducedMotion: true });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.flushMicrotasks();
  env.scrollTop = 1700;
  env.sections.set('tool-options', { top: 2300, height: 500 });
  env.settle(coordinator);
  assert.deepEqual(env.writes, [2000]);
  assert.equal(env.scrollTop, 1700);
  assert.equal(coordinator.snapshot().outcome, 'scrolled');
});

test('focus: only keyboard menu/dialog triggers rescue lost focus', () => {
  const run = (patch, focusLost = true) => {
    const env = createEnvironment({ reducedMotion: true, focusLost });
    const coordinator = new SidebarRevealCoordinator(env.ports);
    coordinator.request(request(patch));
    env.settle(coordinator);
    return env.logOf('focus').length;
  };
  assert.equal(run({ source: 'menu', origin: 'keyboard' }), 1);
  assert.equal(run({ source: 'command-search', origin: 'keyboard' }), 1);
  assert.equal(run({ source: 'dialog', origin: 'keyboard' }), 1);
  assert.equal(run({ source: 'menu', origin: 'pointer' }), 0);
  assert.equal(run({ source: 'menu', origin: 'unknown' }), 0);
  assert.equal(run({ source: 'shortcut', origin: 'keyboard' }), 0, 'shortcuts keep focus on the canvas');
  assert.equal(run({ source: 'toolbar', origin: 'keyboard' }), 0, 'toolbar keeps roving focus');
  assert.equal(run({ source: 'flyout', origin: 'keyboard' }), 0);
  assert.equal(run({ source: 'sidebar', origin: 'keyboard' }), 0);
  assert.equal(run({ source: 'menu', origin: 'keyboard' }, false), 0, 'focus elsewhere is never stolen');
});

test('focus is not moved if a pointer is held when the reveal lands', () => {
  assert.equal(shouldMoveFocus({ source: 'menu', origin: 'keyboard' }, { interactionActive: true, focusIsLost: true }), false);
  assert.equal(shouldMoveFocus({ source: 'menu', origin: 'keyboard' }, { interactionActive: false, focusIsLost: true }), true);
});

test('sidebar-internal triggers default to minimal (nearest) movement', () => {
  assert.equal(defaultAlign('sidebar'), 'nearest');
  for (const source of ['toolbar', 'flyout', 'shortcut', 'menu', 'command-search', 'dialog']) assert.equal(defaultAlign(source), 'start');
  const env = createEnvironment({ reducedMotion: true, sections: { 'layer-style-outer-glow': { top: 500, height: 300 } } });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request({ section: 'layer-style-outer-glow', source: 'sidebar' }));
  env.settle(coordinator);
  assert.deepEqual(env.writes, [200]);
});

test('a kept control (focused field) stays visible', () => {
  const env = createEnvironment({
    reducedMotion: true,
    sections: { 'layer-styles': { top: 1000, height: 1600 }, outline: { top: 2300, height: 30 } },
  });
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request({ section: 'layer-styles', source: 'menu', keep: 'outline' }));
  env.settle(coordinator);
  assert.deepEqual(env.writes, [1730]);
});

test('sticky insets are honoured end to end', () => {
  const env = createEnvironment({ reducedMotion: true });
  env.insetTop = 40;
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  assert.deepEqual(env.writes, [1960]);
});

test('dispose cancels in-flight work and ignores later calls', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  coordinator.dispose();
  env.flushMicrotasks();
  env.runFrames(30);
  coordinator.request(request());
  coordinator.notifyCommit();
  env.flushMicrotasks();
  env.runFrames(30);
  assert.deepEqual(env.writes, []);
  assert.equal(env.frames.size, 0);
});

test('every phase change is reported for diagnostics', () => {
  const env = createEnvironment();
  const coordinator = new SidebarRevealCoordinator(env.ports);
  coordinator.request(request());
  env.settle(coordinator);
  const phases = env.reports.map((report) => report.phase);
  assert.deepEqual([...new Set(phases)], ['pending', 'animating', 'settling', 'idle']);
  assert.equal(env.reports.at(-1).outcome, 'scrolled');
  assert.equal(env.reports.at(-1).section, 'tool-options');
});
