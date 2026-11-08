/**
 * Properties-sidebar auto-scroll coordinator.
 *
 * A small, framework-free state machine that turns "the user just activated
 * X" into at most one bounded scroll of the sidebar. Every side effect (DOM
 * measurement, scrolling, timers, focus, announcements) goes through the
 * injected `RevealPorts`, so the whole lifecycle — last-trigger-wins
 * cancellation, bounded waiting for a section to render, collapse/expand,
 * deferral during strokes, manual-scroll interruption and the reduced-motion
 * branch — is unit-tested in Node with fake ports.
 *
 * Lifecycle of one request (see docs/sidebar-autoscroll-contract.md):
 *
 *   request ──► pending ──(pointer/drag active)──► deferred ──(released)──┐
 *                  │  ▲                                                    │
 *                  │  └────────────────────────────────────────────────────┘
 *                  ├─(section missing / collapsed) retry next commit/frame, bounded
 *                  ├─(fully visible)───────────────► landed: visible
 *                  ├─(reduced motion)── write once ► settling ► landed: scrolled
 *                  └─(motion allowed)──────────────► animating ► settling ► landed
 *
 * Any newer request supersedes the active one (generation token), and a user
 * scroll, wheel, touch or pointer press inside the sidebar interrupts it.
 */
import {
  alignmentTarget,
  animationFrameOffset,
  computeScrollPlan,
  scrollDuration,
  SCROLL_TOLERANCE_PX,
  wasScrolledExternally,
  type RevealAlign,
  type RevealGeometry,
} from './sidebarScrollMath.ts';
import { SIDEBAR_SECTIONS, type SidebarSectionId } from './sidebarSections.ts';

/** Where the activation came from. */
export type TriggerSource =
  | 'toolbar'
  | 'flyout'
  | 'shortcut'
  | 'menu'
  | 'command-search'
  | 'dialog'
  | 'sidebar';

/** How the activation was performed, when known. */
export type TriggerOrigin = 'pointer' | 'keyboard' | 'unknown';

export type RevealRequest<Keep = unknown> = {
  readonly section: SidebarSectionId;
  readonly source: TriggerSource;
  readonly origin: TriggerOrigin;
  /** Defaults to `nearest` for sidebar-internal triggers, `start` otherwise. */
  readonly align?: RevealAlign;
  /** Opaque handle (a DOM element) that must end fully visible. */
  readonly keep?: Keep;
};

export type RevealPhase = 'idle' | 'pending' | 'deferred' | 'animating' | 'settling';

export type RevealOutcome =
  | 'scrolled'
  | 'visible'
  | 'aligned'
  | 'unscrollable'
  | 'missing'
  | 'hidden'
  | 'interrupted'
  | 'superseded'
  | 'cancelled'
  | 'expired'
  | 'no-section';

export type RevealMeasurement =
  | { readonly kind: 'ok'; readonly geometry: RevealGeometry }
  | { readonly kind: 'missing' }
  | { readonly kind: 'hidden' };

export type RevealSnapshot = {
  readonly phase: RevealPhase;
  readonly section: SidebarSectionId | null;
  readonly outcome: RevealOutcome | null;
  /** Monotonic request counter; increments on every request/clear. */
  readonly sequence: number;
};

export interface RevealPorts<Keep = unknown> {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): number;
  clearTimer(handle: number): void;
  queueMicrotask(callback: () => void): void;
  measure(request: RevealRequest<Keep>): RevealMeasurement;
  isCollapsed(section: SidebarSectionId): boolean;
  expand(section: SidebarSectionId): void;
  readScrollTop(): number;
  writeScrollTop(value: number): void;
  prefersReducedMotion(): boolean;
  isInteractionActive(): boolean;
  highlight(section: SidebarSectionId): void;
  clearHighlight(): void;
  announce(message: string): void;
  /** True only when focus is currently lost (body/none), never mid-edit. */
  canMoveFocus(): boolean;
  focusSection(section: SidebarSectionId): void;
  report(snapshot: RevealSnapshot): void;
}

/** Hard bounds: no loop in this module can run unbounded. */
export const REVEAL_LIMITS = Object.freeze({
  /** Attempts (commits + frames) to find/expand/measure a section. */
  maxResolveAttempts: 40,
  /** Wall-clock budget for the section to appear. */
  resolveDeadlineMs: 1200,
  /** Hard frame cap for one animation, whatever its duration. */
  maxAnimationFrames: 90,
  /** Frames spent verifying the landing against late layout shifts. */
  settleFrames: 2,
  /** Re-alignments allowed while settling. */
  maxCorrections: 2,
  /** How long a reveal may wait for a stroke/drag to end before it is dropped. */
  maxDeferMs: 8000,
});

export type RevealLimits = typeof REVEAL_LIMITS;

/** Sources whose activation leaves focus on <body> once their popup closes. */
const FOCUS_RESCUE_SOURCES: ReadonlySet<TriggerSource> = new Set(['menu', 'command-search', 'dialog']);

/**
 * Focus policy. The sidebar never takes focus from the canvas, a field, a
 * toolbar button or an active pointer interaction. It only *rescues* focus
 * that a keyboard-driven menu/dialog left on <body>, so a keyboard user lands
 * on the section they asked for.
 */
export function shouldMoveFocus(
  request: Pick<RevealRequest, 'origin' | 'source'>,
  context: { interactionActive: boolean; focusIsLost: boolean },
): boolean {
  return (
    request.origin === 'keyboard' &&
    FOCUS_RESCUE_SOURCES.has(request.source) &&
    !context.interactionActive &&
    context.focusIsLost
  );
}

export function defaultAlign(source: TriggerSource): RevealAlign {
  return source === 'sidebar' ? 'nearest' : 'start';
}

export function announcementFor(section: SidebarSectionId): string {
  return `${SIDEBAR_SECTIONS[section].label} section shown in the properties sidebar`;
}

type ActiveReveal<Keep> = {
  readonly generation: number;
  readonly request: RevealRequest<Keep>;
  readonly align: RevealAlign;
  readonly createdAt: number;
  phase: Exclude<RevealPhase, 'idle'>;
  attempts: number;
  expandRequested: boolean;
  highlighted: boolean;
  // animation / settle state
  from: number;
  animationStart: number;
  duration: number;
  frames: number;
  lastWritten: number;
  settleCount: number;
  corrections: number;
};

export class SidebarRevealCoordinator<Keep = unknown> {
  private readonly ports: RevealPorts<Keep>;
  private readonly limits: RevealLimits;
  private generation = 0;
  private sequence = 0;
  private active: ActiveReveal<Keep> | null = null;
  private frameHandle: number | null = null;
  private deferTimer: number | null = null;
  private lastOutcome: RevealOutcome | null = null;
  private lastSection: SidebarSectionId | null = null;
  private disposed = false;

  constructor(ports: RevealPorts<Keep>, limits: RevealLimits = REVEAL_LIMITS) {
    this.ports = ports;
    this.limits = limits;
  }

  /** Current state, for tests and diagnostics. */
  snapshot(): RevealSnapshot {
    return {
      phase: this.active?.phase ?? 'idle',
      section: this.active?.request.section ?? this.lastSection,
      outcome: this.active ? null : this.lastOutcome,
      sequence: this.sequence,
    };
  }

  /** Start a reveal; any reveal still in flight is superseded (last wins). */
  request(request: RevealRequest<Keep>): void {
    if (this.disposed) return;
    if (this.active) this.finish('superseded');
    this.sequence += 1;
    const generation = ++this.generation;
    const now = this.ports.now();
    this.active = {
      generation,
      request,
      align: request.align ?? defaultAlign(request.source),
      createdAt: now,
      phase: 'pending',
      attempts: 0,
      expandRequested: false,
      highlighted: false,
      from: 0,
      animationStart: 0,
      duration: 0,
      frames: 0,
      lastWritten: 0,
      settleCount: 0,
      corrections: 0,
    };
    this.lastSection = request.section;
    this.lastOutcome = null;
    this.report();
    // The triggering handler has queued React's commit; a microtask runs
    // after it, and the frame is the fallback when nothing re-renders.
    this.ports.queueMicrotask(() => this.attemptIfCurrent(generation));
    this.scheduleFrame();
  }

  /**
   * A trigger whose target has no inline section (e.g. the Hand tool) still
   * wins over older triggers: cancel whatever is in flight.
   */
  clear(): void {
    if (this.disposed) return;
    if (this.active) this.finish('superseded');
    this.sequence += 1;
    this.lastSection = null;
    this.lastOutcome = 'no-section';
    this.report();
  }

  /** Call after every host commit (React layout effect). */
  notifyCommit(): void {
    if (this.active?.phase === 'pending') this.attempt();
  }

  /** The last pointer/drag interaction ended. */
  notifyInteractionEnded(): void {
    const active = this.active;
    if (!active || active.phase !== 'deferred') return;
    this.clearDeferTimer();
    active.phase = 'pending';
    this.report();
    this.attempt();
  }

  /** The user scrolled (wheel, touch, keys) or pressed inside the sidebar. */
  notifyUserScroll(): void {
    const active = this.active;
    if (!active) return;
    if (active.phase === 'settling') this.land('scrolled', true);
    else this.finish('interrupted');
  }

  cancel(): void {
    if (this.active) this.finish('cancelled');
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private attemptIfCurrent(generation: number): void {
    if (this.active?.generation === generation && this.active.phase === 'pending') this.attempt();
  }

  private resolveExhausted(active: ActiveReveal<Keep>): boolean {
    return (
      active.attempts >= this.limits.maxResolveAttempts ||
      this.ports.now() - active.createdAt > this.limits.resolveDeadlineMs
    );
  }

  private attempt(): void {
    const active = this.active;
    if (!active || active.phase !== 'pending') return;
    const ports = this.ports;
    if (ports.isInteractionActive()) {
      active.phase = 'deferred';
      this.cancelFrame();
      const generation = active.generation;
      this.deferTimer = ports.setTimer(() => {
        this.deferTimer = null;
        if (this.active?.generation === generation && this.active.phase === 'deferred') this.finish('expired');
      }, this.limits.maxDeferMs);
      this.report();
      return;
    }
    active.attempts += 1;
    const measurement = ports.measure(active.request);
    if (measurement.kind === 'hidden') return this.finish('hidden');
    if (measurement.kind === 'missing') {
      if (this.resolveExhausted(active)) return this.finish('missing');
      this.scheduleFrame();
      return;
    }
    if (ports.isCollapsed(active.request.section)) {
      if (!active.expandRequested) {
        active.expandRequested = true;
        ports.expand(active.request.section);
      }
      if (this.resolveExhausted(active)) return this.finish('missing');
      this.scheduleFrame();
      return;
    }
    if (!active.highlighted) {
      active.highlighted = true;
      ports.highlight(active.request.section);
    }
    const plan = computeScrollPlan(measurement.geometry, active.align);
    if (plan.action === 'none') {
      return this.land(plan.reason === 'fully-visible' ? 'visible' : plan.reason, false);
    }
    const duration = scrollDuration(plan.distance, ports.prefersReducedMotion());
    if (duration <= 0) {
      ports.writeScrollTop(plan.to);
      active.lastWritten = ports.readScrollTop();
      this.enterSettling(active);
      return;
    }
    active.phase = 'animating';
    active.from = measurement.geometry.scrollTop;
    active.lastWritten = measurement.geometry.scrollTop;
    active.animationStart = ports.now();
    active.duration = duration;
    active.frames = 0;
    this.report();
    this.scheduleFrame();
  }

  private animate(active: ActiveReveal<Keep>): void {
    const ports = this.ports;
    const actual = ports.readScrollTop();
    if (wasScrolledExternally(active.lastWritten, actual)) return this.finish('interrupted');
    if (ports.isInteractionActive()) return this.finish('interrupted');
    active.frames += 1;
    const measurement = ports.measure(active.request);
    if (measurement.kind !== 'ok') return this.finish(measurement.kind);
    const target = alignmentTarget(measurement.geometry, active.align);
    const elapsed = ports.now() - active.animationStart;
    const done = elapsed >= active.duration || active.frames >= this.limits.maxAnimationFrames;
    ports.writeScrollTop(done ? target : animationFrameOffset(active.from, target, elapsed, active.duration));
    active.lastWritten = ports.readScrollTop();
    if (done) this.enterSettling(active);
    else this.scheduleFrame();
  }

  private enterSettling(active: ActiveReveal<Keep>): void {
    active.phase = 'settling';
    active.settleCount = 0;
    this.report();
    this.scheduleFrame();
  }

  /**
   * Verify the landing for a couple of frames: late layout shifts (a panel
   * above finishing its render) are corrected a bounded number of times,
   * unless the user has taken over the scroll position.
   */
  private settle(active: ActiveReveal<Keep>): void {
    const ports = this.ports;
    const actual = ports.readScrollTop();
    if (wasScrolledExternally(active.lastWritten, actual)) return this.land('scrolled', true);
    const measurement = ports.measure(active.request);
    if (measurement.kind === 'ok' && active.corrections < this.limits.maxCorrections && !ports.isInteractionActive()) {
      const plan = computeScrollPlan(measurement.geometry, active.align);
      if (plan.action === 'scroll' && Math.abs(plan.distance) > SCROLL_TOLERANCE_PX) {
        active.corrections += 1;
        ports.writeScrollTop(plan.to);
        active.lastWritten = ports.readScrollTop();
      }
    }
    active.settleCount += 1;
    if (active.settleCount >= this.limits.settleFrames) this.land('scrolled', true);
    else this.scheduleFrame();
  }

  private land(outcome: RevealOutcome, moved: boolean): void {
    const active = this.active;
    if (!active) return;
    const ports = this.ports;
    if (moved || active.expandRequested) ports.announce(announcementFor(active.request.section));
    const interactionActive = ports.isInteractionActive();
    if (shouldMoveFocus(active.request, { interactionActive, focusIsLost: !interactionActive && ports.canMoveFocus() }))
      ports.focusSection(active.request.section);
    this.finish(outcome);
  }

  private finish(outcome: RevealOutcome): void {
    const active = this.active;
    this.cancelFrame();
    this.clearDeferTimer();
    if (active && active.highlighted && (outcome === 'superseded' || outcome === 'cancelled'))
      this.ports.clearHighlight();
    this.active = null;
    this.lastOutcome = outcome;
    this.report();
  }

  private onFrame(generation: number): void {
    this.frameHandle = null;
    const active = this.active;
    if (!active || active.generation !== generation) return;
    if (active.phase === 'pending') this.attempt();
    else if (active.phase === 'animating') this.animate(active);
    else if (active.phase === 'settling') this.settle(active);
  }

  private scheduleFrame(): void {
    const active = this.active;
    if (!active || this.frameHandle !== null) return;
    const generation = active.generation;
    this.frameHandle = this.ports.requestFrame(() => this.onFrame(generation));
  }

  private cancelFrame(): void {
    if (this.frameHandle !== null) {
      this.ports.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private clearDeferTimer(): void {
    if (this.deferTimer !== null) {
      this.ports.clearTimer(this.deferTimer);
      this.deferTimer = null;
    }
  }

  private report(): void {
    this.ports.report(this.snapshot());
  }
}
