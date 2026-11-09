import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HERO_LOOKS,
  HERO_LOOP_MS,
  HERO_PHASES,
  HERO_POSTER_FRAME,
  HERO_STROKE_POINTS,
  applyHeroLook,
  catmullRom,
  countUpValue,
  filterRibbon,
  heroFrame,
  humanizeId,
  landingStats,
  partialStroke,
  railSlotCount,
  toolFamilyCards,
} from '../src/landingContent.ts';
import { TOOL_CATEGORIES, TOOL_FLYOUTS } from '../src/toolPalette.ts';
import { LAYER_BLEND_MODES } from '../src/blendModes.ts';
import { FILTER_EFFECT_TYPES } from '../src/filterEffects.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('landing stats are derived from the editor registries', () => {
  const stats = landingStats();
  const tools = new Set(TOOL_CATEGORIES.flatMap((category) => category.tools));
  assert.equal(stats.tools, tools.size);
  assert.equal(stats.blendModes, LAYER_BLEND_MODES.length);
  assert.equal(stats.filters, FILTER_EFFECT_TYPES.length - 1, '"none" is not a filter');
  assert.ok(!FILTER_EFFECT_TYPES.slice(1).includes('none'));
  assert.equal(stats.undoStates, 240);
  assert.equal(stats.tileSize, 256);
  // Every flyout tool must be a palette tool, so slots = flyouts + standalone tools.
  for (const flyoutTools of Object.values(TOOL_FLYOUTS)) for (const tool of flyoutTools) assert.ok(tools.has(tool), tool);
  const inFlyout = new Set(Object.values(TOOL_FLYOUTS).flat());
  assert.equal(railSlotCount(), Object.keys(TOOL_FLYOUTS).length + [...tools].filter((tool) => !inFlyout.has(tool)).length);
  assert.ok(stats.railSlots < stats.tools && stats.railSlots > 10);
});

test('undo and tile figures match the documented limits', () => {
  const readme = read('../README.md');
  assert.match(readme, /bounded to 240 states/);
  const handoff = read('../docs/claude-code-handoff.md');
  assert.match(handoff, /256² layer tiles/);
});

test('tool family cards cover every palette category with a description', () => {
  const cards = toolFamilyCards();
  assert.deepEqual(cards.map((card) => card.id), TOOL_CATEGORIES.map((category) => category.id));
  assert.equal(cards.reduce((sum, card) => sum + card.count, 0), TOOL_CATEGORIES.reduce((sum, c) => sum + c.tools.length, 0));
  for (const card of cards) {
    assert.ok(card.blurb.length > 20, `${card.id} needs a blurb`);
    assert.ok(card.count > 0);
  }
});

test('humanizeId title-cases ids and keeps acronyms', () => {
  assert.equal(humanizeId('gaussian-blur'), 'Gaussian Blur');
  assert.equal(humanizeId('ntsc-colors'), 'NTSC Colors');
  assert.equal(humanizeId('mosaic'), 'Mosaic');
  assert.equal(humanizeId('--a--b'), 'A B');
});

test('filter ribbon lists local filters only, once each', () => {
  const ribbon = filterRibbon();
  assert.equal(new Set(ribbon).size, ribbon.length);
  assert.ok(ribbon.includes('Gaussian Blur'));
  assert.ok(!ribbon.includes('None'));
  for (const name of ribbon) assert.doesNotMatch(name, /^AI |Neural|Reflection Removal/);
  assert.ok(ribbon.length >= 50);
});

test('countUpValue eases from 0 to the target and clamps', () => {
  assert.equal(countUpValue(69, 0), 0);
  assert.equal(countUpValue(69, 1), 69);
  assert.equal(countUpValue(69, 4), 69);
  assert.equal(countUpValue(69, -1), 0);
  assert.equal(countUpValue(69, Number.NaN), 69);
  assert.ok(countUpValue(100, 0.5) > 50, 'ease-out runs ahead of linear');
  let previous = -1;
  for (let p = 0; p <= 1; p += 0.05) {
    const value = countUpValue(240, p);
    assert.ok(value >= previous);
    previous = value;
  }
});

test('hero phases tile the loop without gaps', () => {
  assert.equal(HERO_PHASES[0].start, 0);
  assert.equal(HERO_PHASES.at(-1).end, HERO_LOOP_MS);
  for (let i = 1; i < HERO_PHASES.length; i++) assert.equal(HERO_PHASES[i].start, HERO_PHASES[i - 1].end);
  for (const phase of HERO_PHASES) {
    assert.equal(heroFrame(phase.start).phase, phase.id);
    assert.equal(heroFrame(phase.end - 1).phase, phase.id);
  }
});

test('hero timeline paints, compares, grades and types in order', () => {
  const [paint, adjust, filter, type] = HERO_PHASES;
  assert.equal(heroFrame(0).stroke, 0);
  assert.equal(heroFrame(0).split, 1, 'starts on the original image');
  assert.ok(heroFrame((paint.start + paint.end) / 2).stroke > 0.2);
  assert.equal(heroFrame(paint.end - 1).stroke, 1);
  const midAdjust = heroFrame(adjust.start + (adjust.end - adjust.start) * 0.5);
  assert.ok(midAdjust.split < 0.5 && midAdjust.split > 0.1, 'comparison sweeps across');
  assert.ok(Math.abs(heroFrame(adjust.end - 1).split - 0.5) < 0.01);
  const looks = new Set();
  for (let t = filter.start; t < filter.end; t += 50) looks.add(heroFrame(t).look);
  assert.equal(looks.size, HERO_LOOKS.length, 'every look is shown');
  assert.equal(heroFrame(filter.start).text, 0);
  assert.ok(heroFrame(type.start + 2000).text > 0.9);
  assert.ok(heroFrame(type.start + 2000).split < 0.05, 'graded image fills the frame');
  assert.ok(heroFrame(HERO_LOOP_MS - 1).fade < 0.05, 'stroke and type fade before the loop resets');
});

test('hero frames stay within bounds and wrap around the loop', () => {
  for (let t = -HERO_LOOP_MS; t < HERO_LOOP_MS * 2; t += 97) {
    const frame = heroFrame(t);
    for (const key of ['phaseProgress', 'stroke', 'split', 'lookBlend', 'text', 'fade']) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1, `${key}=${frame[key]} at ${t}`);
    }
    assert.ok(Number.isInteger(frame.look) && frame.look >= 0 && frame.look < HERO_LOOKS.length);
    assert.ok(frame.look + (frame.lookBlend > 0 ? 1 : 0) < HERO_LOOKS.length);
  }
  assert.deepEqual(heroFrame(1234), heroFrame(1234 + HERO_LOOP_MS));
  assert.deepEqual(heroFrame(Number.NaN), heroFrame(0));
});

test('reduced-motion poster frame shows every layer at rest', () => {
  assert.ok(Object.isFrozen(HERO_POSTER_FRAME));
  assert.equal(HERO_POSTER_FRAME.stroke, 1);
  assert.equal(HERO_POSTER_FRAME.text, 1);
  assert.equal(HERO_POSTER_FRAME.fade, 1);
  assert.equal(HERO_POSTER_FRAME.split, 0.5, 'before and after both visible');
});

test('applyHeroLook grades colour, keeps alpha and is deterministic', () => {
  const source = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 128,
    200, 120, 80, 255,
    40, 60, 120, 0,
  ]);
  for (const look of [0, 1, 2]) {
    const a = applyHeroLook(new Uint8ClampedArray(source), look);
    const b = applyHeroLook(new Uint8ClampedArray(source), look);
    assert.deepEqual(a, b);
    for (let i = 3; i < source.length; i += 4) assert.equal(a[i], source[i], 'alpha untouched');
    assert.notDeepEqual(a, source, `look ${look} changes pixels`);
  }
  const warm = applyHeroLook(new Uint8ClampedArray([128, 128, 128, 255]), 0);
  assert.ok(warm[0] > warm[2], 'look 0 is warm');
  const mono = applyHeroLook(new Uint8ClampedArray([220, 60, 40, 255]), 2);
  const spread = Math.max(mono[0], mono[1], mono[2]) - Math.min(mono[0], mono[1], mono[2]);
  assert.ok(spread < 60, 'look 2 is nearly monochrome');
});

test('stroke helpers interpolate through the control points', () => {
  const points = catmullRom(HERO_STROKE_POINTS, 10);
  assert.equal(points.length, (HERO_STROKE_POINTS.length - 1) * 10 + 1);
  assert.deepEqual(points[0], [...HERO_STROKE_POINTS[0]]);
  assert.deepEqual(points.at(-1), [...HERO_STROKE_POINTS.at(-1)]);
  for (const [x, y] of points) assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
  assert.deepEqual(partialStroke(points, 0), []);
  assert.equal(partialStroke(points, 1).length, points.length);
  assert.equal(partialStroke(points, 0.5).length, Math.ceil(points.length / 2));
  assert.deepEqual(partialStroke(points, Number.NaN), []);
  assert.deepEqual(catmullRom([[0.5, 0.5]]), [[0.5, 0.5]]);
});

test('landing source keeps one anonymous CTA, accurate claims and reduced-motion styles', () => {
  const page = read('../src/HomePage.tsx');
  const css = read('../src/landing.css');
  assert.equal(page.match(/>Start editing </g)?.length, 1, 'tests and users rely on one Start editing link');
  assert.match(page, /href="\/editor\?new=1">Start editing/);
  assert.doesNotMatch(page, /Photoshop|Adobe|number 1|#1|best editor/i);
  assert.doesNotMatch(page, /Red Eye|Mixer Brush|marching/i, 'do not showcase features with known bugs');
  assert.match(page, /100% free/);
  assert.match(page, /FREE MEANS FREE/);
  assert.match(page, /No watermark/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.lp \*, \.lp \*::before, \.lp \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(css, /\.lp\[data-reveal="on"\] \.lp-reveal/, 'content is only hidden once JS opts in');
  const demo = read('../src/LandingHeroDemo.tsx');
  assert.match(demo, /prefers-reduced-motion: reduce/);
  assert.match(demo, /IntersectionObserver/, 'animation pauses off screen');
  assert.match(demo, /visibilitychange/, 'animation pauses in hidden tabs');
});
