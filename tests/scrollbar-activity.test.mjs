import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOVER_ATTRIBUTE,
  SCROLLBAR_HIDE_DELAY_MS,
  SCROLLING_ATTRIBUTE,
  installScrollbarActivity,
  installScrollbarHover,
  scrollersAt,
  syncHovered,
  scrollTargetFor,
} from '../src/scrollbarActivity.ts';

class FakeElement {
  constructor(name) { this.name = name; this.attributes = new Map(); this.writes = 0; }
  setAttribute(name, value) { this.writes += 1; this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  get scrolling() { return this.attributes.has(SCROLLING_ATTRIBUTE); }
}

/** A fake document with a manual clock. */
function setup({ delayMs } = {}) {
  const listeners = [];
  const timers = new Map();
  let now = 0;
  let nextId = 1;
  const source = {
    scrollingElement: new FakeElement('html'),
    addEventListener(type, listener, options) { listeners.push({ type, listener, options }); },
    removeEventListener(type, listener) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.listener === listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  const uninstall = installScrollbarActivity(source, {
    delayMs,
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { callback, at: now + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  return {
    source,
    listeners,
    timers,
    uninstall,
    scroll(target) { for (const { listener } of listeners) listener({ target }); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('listens for scroll in the capture phase without blocking scrolling', () => {
  const { listeners } = setup();
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'scroll');
  assert.deepEqual(listeners[0].options, { capture: true, passive: true });
});

test('a scroll shows the scrollbar until the scroller has been still for the delay', () => {
  const h = setup();
  const panel = new FakeElement('inspector');
  h.scroll(panel);
  assert.equal(panel.scrolling, true);
  h.advance(SCROLLBAR_HIDE_DELAY_MS - 1);
  assert.equal(panel.scrolling, true);
  h.advance(1);
  assert.equal(panel.scrolling, false);
  assert.equal(h.timers.size, 0);
});

test('continued scrolling keeps the scrollbar visible and restarts the delay', () => {
  const h = setup();
  const panel = new FakeElement('layers');
  for (let i = 0; i < 10; i += 1) {
    h.scroll(panel);
    h.advance(SCROLLBAR_HIDE_DELAY_MS - 100);
    assert.equal(panel.scrolling, true, `still visible after scroll ${i}`);
  }
  // The attribute is written once per burst, not on every scroll event.
  assert.equal(panel.writes, 1);
  assert.equal(h.timers.size, 1);
  h.advance(100);
  assert.equal(panel.scrolling, false);
});

test('scrollers are tracked independently', () => {
  const h = setup({ delayMs: 500 });
  const rail = new FakeElement('toolbar');
  const inspector = new FakeElement('inspector');
  h.scroll(rail);
  h.advance(300);
  h.scroll(inspector);
  h.advance(200);
  assert.equal(rail.scrolling, false);
  assert.equal(inspector.scrolling, true);
  h.advance(300);
  assert.equal(inspector.scrolling, false);
});

test('page scrolls mark the document scroller; other targets are ignored', () => {
  const h = setup();
  h.scroll(h.source);
  assert.equal(h.source.scrollingElement.scrolling, true);
  for (const target of [null, undefined, {}, 'text', 42, { setAttribute() {} }]) h.scroll(target);
  assert.equal(h.timers.size, 1);
  assert.equal(scrollTargetFor({}, { scrollingElement: null }), null);
  const element = new FakeElement('x');
  assert.equal(scrollTargetFor(element, { scrollingElement: null }), element);
});

test('a negative delay is clamped to zero', () => {
  const h = setup({ delayMs: -50 });
  const panel = new FakeElement('panel');
  h.scroll(panel);
  assert.equal(panel.scrolling, true);
  h.advance(0);
  assert.equal(panel.scrolling, false);
});

test('uninstalling removes the listener, timers and marks', () => {
  const h = setup();
  const panel = new FakeElement('panel');
  h.scroll(panel);
  h.uninstall();
  assert.equal(h.listeners.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(panel.scrolling, false);
  h.scroll(panel);
  assert.equal(panel.scrolling, false);
});

test('the default delay is short enough to feel like an overlay scrollbar', () => {
  assert.ok(SCROLLBAR_HIDE_DELAY_MS >= 500 && SCROLLBAR_HIDE_DELAY_MS <= 1500);
});

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const base = (() => {
  const start = css.indexOf('/* Thin, auto-hiding scrollbars');
  assert.ok(start >= 0, 'scrollbar block exists');
  return css.slice(start, css.indexOf('/* Tool labels are controls', start));
})();

test('scrollbar rules live in the base layer so hide utilities still win', () => {
  assert.match(base, /@layer base\{/);
  assert.match(base, /::-webkit-scrollbar\{width:8px;height:8px;/);
  assert.match(base, /::-webkit-scrollbar-button\{display:none/);
  assert.match(base, /::-webkit-scrollbar-track,::-webkit-scrollbar-corner\{background:transparent\}/);
});

test('the thumb is transparent at rest and shown on hover, focus and scrolling', () => {
  assert.match(base, /::-webkit-scrollbar-thumb\{[^}]*background-color:transparent/);
  const shown = /([^}{]+)\{background-color:var\(--scrollbar-thumb\)\}/.exec(base)?.[1] ?? '';
  for (const trigger of [':hover::-webkit-scrollbar-thumb', '[data-scroll-hover]::-webkit-scrollbar-thumb', '[data-scrolling]::-webkit-scrollbar-thumb', ':focus-visible::-webkit-scrollbar-thumb']) {
    assert.ok(shown.includes(trigger), trigger);
  }
  assert.match(base, /::-webkit-scrollbar-thumb:hover\{background-color:var\(--scrollbar-thumb-hover\)\}/);
});

test('Firefox and forced-colors fallbacks are present', () => {
  assert.match(base, /@supports not selector\(::-webkit-scrollbar\)\{\*\{scrollbar-width:thin;scrollbar-color:transparent transparent\}/);
  assert.match(base, /@media \(forced-colors:active\)/);
});

test('tool labels cannot be text-selected', () => {
  assert.match(css, /\.toolbar,\.tool-flyout\{-webkit-user-select:none;user-select:none\}/);
});

test('the entry point installs scroll activity once', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.equal(main.match(/installScrollbarActivity\(document\)/g)?.length, 1);
});

/** A tiny element tree: html > shell > inspector(scrolls) > section > button. */
function tree() {
  const make = (name, parent, scrolls = false) => Object.assign(new FakeElement(name), { parentElement: parent, scrolls });
  const html = make('html', null, true);
  const shell = make('shell', html);
  const inspector = make('inspector', shell, true);
  const section = make('section', inspector);
  const button = make('button', section);
  const rail = make('toolbar', shell, true);
  const tool = make('tool', rail);
  return { html, shell, inspector, section, button, rail, tool };
}
const scrolls = (node) => node.scrolls;
const hovered = (node) => node.attributes.has(HOVER_ATTRIBUTE);

function hoverSetup() {
  const listeners = new Map();
  const source = {
    addEventListener(type, listener, options) { listeners.set(type, { listener, options }); },
    removeEventListener(type, listener) { if (listeners.get(type)?.listener === listener) listeners.delete(type); },
  };
  const uninstall = installScrollbarHover(source, scrolls);
  return {
    listeners,
    uninstall,
    over(target, pointerType = 'mouse') { listeners.get('pointerover')?.listener({ target, pointerType }); },
    out(relatedTarget) { listeners.get('pointerout')?.listener({ target: {}, relatedTarget, pointerType: 'mouse' }); },
  };
}

test('scrollersAt lists every scroller from the target outwards', () => {
  const t = tree();
  assert.deepEqual(scrollersAt(t.button, scrolls).map((node) => node.name), ['inspector', 'html']);
  assert.deepEqual(scrollersAt(t.shell, scrolls).map((node) => node.name), ['html']);
  assert.deepEqual(scrollersAt(null, scrolls), []);
});

test('syncHovered only writes elements whose hover state changes', () => {
  const t = tree();
  syncHovered(new Set(), new Set([t.inspector, t.html]));
  syncHovered(new Set([t.inspector, t.html]), new Set([t.rail, t.html]));
  assert.equal(hovered(t.inspector), false);
  assert.equal(hovered(t.rail), true);
  assert.equal(hovered(t.html), true);
  assert.equal(t.html.writes, 1);
});

test('hovering marks the panel under the pointer and moves with it', () => {
  const t = tree();
  const h = hoverSetup();
  assert.deepEqual(h.listeners.get('pointerover').options, { capture: true, passive: true });
  h.over(t.button);
  assert.equal(hovered(t.inspector), true);
  assert.equal(hovered(t.rail), false);
  h.over(t.tool);
  assert.equal(hovered(t.inspector), false);
  assert.equal(hovered(t.rail), true);
  // Moving inside the same panel keeps it marked without rewriting it.
  h.over(t.rail);
  assert.equal(t.rail.writes, 1);
});

test('touch never shows scrollbars by hovering', () => {
  const t = tree();
  const h = hoverSetup();
  h.over(t.button, 'touch');
  assert.equal(hovered(t.inspector), false);
  h.over(t.button, 'pen');
  assert.equal(hovered(t.inspector), true);
});

test('leaving the window clears hover; moving between elements does not', () => {
  const t = tree();
  const h = hoverSetup();
  h.over(t.button);
  h.out(t.section);
  assert.equal(hovered(t.inspector), true);
  h.out(null);
  assert.equal(hovered(t.inspector), false);
  assert.equal(hovered(t.html), false);
});

test('non-element targets clear hover, and uninstalling cleans up', () => {
  const t = tree();
  const h = hoverSetup();
  h.over(t.button);
  h.over({});
  assert.equal(hovered(t.inspector), false);
  h.over(t.tool);
  h.uninstall();
  assert.equal(hovered(t.rail), false);
  assert.equal(h.listeners.size, 0);
});

test('the entry point installs hover tracking once', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.equal(main.match(/installScrollbarHover\(document\)/g)?.length, 1);
});
