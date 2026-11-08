import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCROLL_DURATION_MS,
  MIN_SCROLL_DURATION_MS,
  SCROLL_TOLERANCE_PX,
  alignmentTarget,
  animationFrameOffset,
  clampScrollTop,
  computeScrollPlan,
  easeOutCubic,
  isFullyVisible,
  maxScrollTop,
  scrollDuration,
  visibleBand,
  wasScrolledExternally,
} from '../src/sidebarScrollMath.ts';

/** A 600 px tall sidebar over 3 000 px of content, scrolled to the top. */
const base = Object.freeze({
  scrollTop: 0,
  clientHeight: 600,
  scrollHeight: 3000,
  insetTop: 0,
  insetBottom: 0,
  sectionTop: 0,
  sectionBottom: 0,
});
const geometry = (patch) => ({ ...base, ...patch });

test('a fully visible section never moves the sidebar', () => {
  assert.deepEqual(computeScrollPlan(geometry({ sectionTop: 100, sectionBottom: 400 }), 'start'), { action: 'none', reason: 'fully-visible' });
  assert.deepEqual(computeScrollPlan(geometry({ sectionTop: 0, sectionBottom: 600 }), 'start'), { action: 'none', reason: 'fully-visible' });
  assert.deepEqual(computeScrollPlan(geometry({ scrollTop: 900, sectionTop: 1000, sectionBottom: 1400 }), 'nearest'), { action: 'none', reason: 'fully-visible' });
  // Sub-pixel overhang is within tolerance.
  assert.equal(computeScrollPlan(geometry({ sectionTop: 10, sectionBottom: 600.9 }), 'start').action, 'none');
});

test('start alignment puts the header at the top of the visible band', () => {
  const below = computeScrollPlan(geometry({ sectionTop: 1200, sectionBottom: 1500 }), 'start');
  assert.deepEqual(below, { action: 'scroll', to: 1200, distance: 1200 });
  const above = computeScrollPlan(geometry({ scrollTop: 2000, sectionTop: 300, sectionBottom: 600 }), 'start');
  assert.deepEqual(above, { action: 'scroll', to: 300, distance: -1700 });
  // Partially visible (header visible, bottom cut) still aligns the header.
  const partial = computeScrollPlan(geometry({ sectionTop: 500, sectionBottom: 900 }), 'start');
  assert.deepEqual(partial, { action: 'scroll', to: 500, distance: 500 });
});

test('sticky headers and scroll-padding offset the landing position', () => {
  const plan = computeScrollPlan(geometry({ insetTop: 48, sectionTop: 1200, sectionBottom: 1500 }), 'start');
  assert.deepEqual(plan, { action: 'scroll', to: 1152, distance: 1152 });
  // A section hidden under the sticky header is not "fully visible".
  const tucked = geometry({ scrollTop: 1000, insetTop: 48, sectionTop: 1010, sectionBottom: 1200 });
  assert.equal(isFullyVisible(tucked), false);
  assert.deepEqual(computeScrollPlan(tucked, 'start'), { action: 'scroll', to: 962, distance: -38 });
  // A bottom inset shrinks the band from below.
  assert.deepEqual(visibleBand(geometry({ scrollTop: 100, insetTop: 10, insetBottom: 30 })), { top: 110, bottom: 670 });
  assert.equal(isFullyVisible(geometry({ insetBottom: 30, sectionTop: 300, sectionBottom: 590 })), false);
});

test('targets are clamped to the scrollable range', () => {
  const nearEnd = computeScrollPlan(geometry({ sectionTop: 2900, sectionBottom: 2990 }), 'start');
  assert.deepEqual(nearEnd, { action: 'scroll', to: 2400, distance: 2400 });
  const atEnd = computeScrollPlan(geometry({ scrollTop: 2400, sectionTop: 2900, sectionBottom: 3000 }), 'start');
  assert.deepEqual(atEnd, { action: 'none', reason: 'fully-visible' });
  // Already at the clamp although the header is not at the top: nothing to do.
  const clamped = computeScrollPlan(geometry({ scrollTop: 2400, sectionTop: 2500, sectionBottom: 3200, scrollHeight: 3000 }), 'start');
  assert.deepEqual(clamped, { action: 'none', reason: 'aligned' });
  assert.equal(clampScrollTop(-50, base), 0);
  assert.equal(clampScrollTop(99999, base), 2400);
  assert.equal(maxScrollTop({ scrollHeight: 100, clientHeight: 600 }), 0);
});

test('a section taller than the sidebar is satisfied once its header is aligned', () => {
  const aligned = geometry({ scrollTop: 1000, sectionTop: 1000.5, sectionBottom: 2600 });
  assert.deepEqual(computeScrollPlan(aligned, 'start'), { action: 'none', reason: 'aligned' });
  const misaligned = geometry({ scrollTop: 1100, sectionTop: 1000, sectionBottom: 2600 });
  assert.deepEqual(computeScrollPlan(misaligned, 'start'), { action: 'scroll', to: 1000, distance: -100 });
});

test('nearest alignment makes the smallest move and keeps the header visible', () => {
  const below = computeScrollPlan(geometry({ sectionTop: 500, sectionBottom: 800 }), 'nearest');
  assert.deepEqual(below, { action: 'scroll', to: 200, distance: 200 });
  const tall = computeScrollPlan(geometry({ sectionTop: 500, sectionBottom: 1500 }), 'nearest');
  assert.deepEqual(tall, { action: 'scroll', to: 500, distance: 500 }, 'header must stay visible');
  const above = computeScrollPlan(geometry({ scrollTop: 1000, sectionTop: 900, sectionBottom: 1100 }), 'nearest');
  assert.deepEqual(above, { action: 'scroll', to: 900, distance: -100 });
  const withInsets = computeScrollPlan(geometry({ insetBottom: 20, sectionTop: 500, sectionBottom: 800 }), 'nearest');
  assert.deepEqual(withInsets, { action: 'scroll', to: 220, distance: 220 });
});

test('a control that must keep focus ends fully visible', () => {
  // Header-to-top would leave the focused control 900 px below the fold.
  const plan = computeScrollPlan(geometry({ sectionTop: 1000, sectionBottom: 2400, keepTop: 2000, keepBottom: 2030 }), 'start');
  assert.deepEqual(plan, { action: 'scroll', to: 1430, distance: 1430 });
  // Section visible but the control is not: still scroll.
  const hidden = computeScrollPlan(geometry({ sectionTop: 0, sectionBottom: 590, keepTop: 700, keepBottom: 720 }), 'start');
  assert.equal(hidden.action, 'scroll');
  // Control and section both visible: stay.
  assert.equal(computeScrollPlan(geometry({ sectionTop: 0, sectionBottom: 590, keepTop: 300, keepBottom: 320 }), 'start').action, 'none');
});

test('degenerate geometry never produces a scroll', () => {
  for (const patch of [
    { clientHeight: 0, sectionTop: 1000, sectionBottom: 1200 },
    { scrollTop: Number.NaN, sectionTop: 1000, sectionBottom: 1200 },
    { sectionTop: Number.POSITIVE_INFINITY, sectionBottom: 1200 },
    { scrollHeight: 400, sectionTop: 1000, sectionBottom: 1200 },
  ])
    assert.deepEqual(computeScrollPlan(geometry(patch), 'start'), { action: 'none', reason: 'unscrollable' }, JSON.stringify(patch));
});

test('moves within tolerance are reported as aligned', () => {
  const plan = computeScrollPlan(geometry({ scrollTop: 1000, sectionTop: 1000 + SCROLL_TOLERANCE_PX, sectionBottom: 3000 }), 'start');
  assert.deepEqual(plan, { action: 'none', reason: 'aligned' });
});

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: plans are clamped, idempotent and land the header where promised', () => {
  const random = mulberry32(0x5eed);
  for (let i = 0; i < 5000; i += 1) {
    const clientHeight = 100 + Math.floor(random() * 900);
    const scrollHeight = clientHeight + Math.floor(random() * 6000);
    const max = scrollHeight - clientHeight;
    const insetTop = random() < 0.3 ? Math.floor(random() * 60) : 0;
    const insetBottom = random() < 0.2 ? Math.floor(random() * 30) : 0;
    const sectionTop = Math.floor(random() * scrollHeight);
    const sectionBottom = Math.min(scrollHeight, sectionTop + 10 + Math.floor(random() * 1500));
    const g = { scrollTop: Math.floor(random() * (max + 1)), clientHeight, scrollHeight, insetTop, insetBottom, sectionTop, sectionBottom };
    for (const align of ['start', 'nearest']) {
      const plan = computeScrollPlan(g, align);
      if (plan.action === 'none') {
        if (plan.reason === 'fully-visible') assert.ok(isFullyVisible(g));
        continue;
      }
      assert.ok(plan.to >= 0 && plan.to <= max, `out of range ${plan.to}`);
      assert.ok(Math.abs(plan.distance) > SCROLL_TOLERANCE_PX);
      assert.ok(!isFullyVisible(g), 'scrolled although fully visible');
      const after = { ...g, scrollTop: plan.to };
      assert.equal(computeScrollPlan(after, align).action, 'none', `not idempotent: ${JSON.stringify({ g, align, plan })}`);
      const band = visibleBand(after);
      if (align === 'start' && plan.to > 0 && plan.to < max)
        assert.ok(Math.abs(sectionTop - band.top) <= SCROLL_TOLERANCE_PX, 'header not at the top');
      if (align === 'nearest')
        assert.ok(sectionTop >= band.top - SCROLL_TOLERANCE_PX || plan.to === max || plan.to === 0, 'header scrolled out of view');
      assert.equal(alignmentTarget(g, align), plan.to);
    }
  }
});

test('reduced motion always means an instant jump', () => {
  assert.equal(scrollDuration(5000, true), 0);
  assert.equal(scrollDuration(10, true), 0);
  assert.equal(scrollDuration(0.5, false), 0);
  assert.equal(scrollDuration(10, false), MIN_SCROLL_DURATION_MS + 1);
  assert.equal(scrollDuration(-100000, false), MAX_SCROLL_DURATION_MS);
  assert.equal(scrollDuration(Number.NaN, false), 0);
  let previous = 0;
  for (let distance = 2; distance < 5000; distance += 37) {
    const duration = scrollDuration(distance, false);
    assert.ok(duration >= MIN_SCROLL_DURATION_MS && duration <= MAX_SCROLL_DURATION_MS);
    assert.ok(duration >= previous, 'duration must not shrink with distance');
    previous = duration;
  }
});

test('easing and per-frame offsets are monotonic and exact at the ends', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-3), 0);
  assert.equal(easeOutCubic(7), 1);
  assert.equal(easeOutCubic(Number.NaN), 0);
  let last = -1;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const value = easeOutCubic(t);
    assert.ok(value >= last);
    last = value;
  }
  assert.equal(animationFrameOffset(100, 900, 0, 200), 100);
  assert.equal(animationFrameOffset(100, 900, 200, 200), 900);
  assert.equal(animationFrameOffset(100, 900, 999, 200), 900);
  assert.equal(animationFrameOffset(100, 900, 50, 0), 900);
  const mid = animationFrameOffset(900, 100, 100, 200);
  assert.ok(mid < 900 && mid > 100);
});

test('external scroll detection tolerates sub-pixel rounding only', () => {
  assert.equal(wasScrolledExternally(100, 100), false);
  assert.equal(wasScrolledExternally(100.4, 100), false);
  assert.equal(wasScrolledExternally(100, 101.4), false);
  assert.equal(wasScrolledExternally(100, 102), true);
  assert.equal(wasScrolledExternally(100, 40), true);
});
