import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEXT_RUNS,
  caretGeometry,
  commonStyle,
  fitTextScale,
  fontCss,
  layerRuns,
  layoutRichText,
  lineBoundary,
  listMarker,
  normalizeParagraph,
  normalizeRuns,
  offsetAtPoint,
  paragraphRange,
  remapRuns,
  richRecord,
  selectionRects,
  styleRange,
  typeLayerName,
  typingStyleAt,
  validParagraphSettings,
  validRichText,
  validRunStyle,
  verticalCaretMove,
  wordRange,
} from '../src/richText.ts';

/** Deterministic monospace measure: each code point is 0.5em wide. */
const measure = (font, text) => {
  const size = Number(/([\d.]+)px/.exec(font)[1]);
  return Array.from(text).length * size * 0.5;
};
const layer = (patch = {}) => ({
  text: 'Hello world',
  color: '#112233',
  fontSize: 20,
  fontFamily: 'Arial',
  bold: false,
  boxWidth: 400,
  textAlign: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  orientation: 'horizontal',
  ...patch,
});
const lineTexts = (value, layout) => layout.lines.map((line) => value.text.slice(line.start, line.end));

test('legacy plain text migrates to one unstyled run and needs no rich record', () => {
  assert.deepEqual(layerRuns(layer()), [{ length: 11 }]);
  assert.equal(richRecord(layerRuns(layer()), 11), undefined);
  assert.deepEqual(layerRuns(layer({ text: '' })), []);
});

test('normalizeRuns repairs length mismatches, drops invalid styles and merges neighbours', () => {
  assert.deepEqual(normalizeRuns([{ length: 3 }, { length: 2 }], 8), [{ length: 8 }]);
  assert.deepEqual(normalizeRuns([{ length: 5, style: { italic: true } }, { length: 50 }], 7), [
    { length: 5, style: { italic: true } },
    { length: 2 },
  ]);
  assert.deepEqual(normalizeRuns([{ length: 0 }, { length: 2, style: { color: 'red' } }], 2), [{ length: 2 }]);
  assert.deepEqual(
    normalizeRuns([{ length: 2, style: { italic: true } }, { length: 2, style: { italic: true } }], 4),
    [{ length: 4, style: { italic: true } }],
  );
});

test('styleRange splits, applies, clears and re-merges runs', () => {
  const base = layerRuns(layer());
  const bold = styleRange(base, 11, 6, 11, { fontWeight: 700 });
  assert.deepEqual(bold, [{ length: 6 }, { length: 5, style: { fontWeight: 700 } }]);
  const colored = styleRange(bold, 11, 3, 8, { color: '#ff0000' });
  assert.deepEqual(colored, [
    { length: 3 },
    { length: 3, style: { color: '#ff0000' } },
    { length: 2, style: { fontWeight: 700, color: '#ff0000' } },
    { length: 3, style: { fontWeight: 700 } },
  ]);
  const cleared = styleRange(colored, 11, 0, 11, { color: undefined, fontWeight: undefined });
  assert.deepEqual(cleared, [{ length: 11 }]);
  // Reversed and out-of-range ranges clamp.
  assert.deepEqual(styleRange(base, 11, 50, 9, { italic: true }), [{ length: 9 }, { length: 2, style: { italic: true } }]);
  assert.deepEqual(styleRange(base, 11, 4, 4, { italic: true }), base);
});

test('remapRuns keeps styles around typing, deletion, paste and replacement', () => {
  const text = 'Hello world';
  const runs = styleRange(layerRuns(layer()), 11, 6, 11, { fontWeight: 700 });
  // Typing inside the bold word inherits bold.
  assert.deepEqual(remapRuns(text, 'Hello worXld', runs), [{ length: 6 }, { length: 6, style: { fontWeight: 700 } }]);
  // Typing at the start inherits the first character's style.
  assert.deepEqual(remapRuns(text, '>>Hello world', runs), [{ length: 8 }, { length: 5, style: { fontWeight: 700 } }]);
  // Deleting across the boundary shrinks both sides.
  assert.deepEqual(remapRuns(text, 'Helrld', runs), [{ length: 3 }, { length: 3, style: { fontWeight: 700 } }]);
  // Explicit insert style wins (typing style chosen before typing).
  assert.deepEqual(remapRuns(text, 'Hello! world', runs, { italic: true }), [
    { length: 5 }, { length: 1, style: { italic: true } }, { length: 1 }, { length: 5, style: { fontWeight: 700 } },
  ]);
  // Replace-all style text change keeps total length consistent.
  const replaced = remapRuns(text, text.replace('world', 'planet'), runs);
  assert.equal(replaced.reduce((sum, run) => sum + run.length, 0), 12);
  assert.deepEqual(remapRuns(text, '', runs), []);
  assert.deepEqual(remapRuns('', 'abc', []), [{ length: 3 }]);
});

test('typing style and common style report mixed attributes', () => {
  const value = layer({ rich: { version: 1, runs: [{ length: 6 }, { length: 5, style: { fontWeight: 700, fontSize: 40 } }] } });
  assert.equal(typingStyleAt(layerRuns(value), 8)?.fontWeight, 700);
  assert.equal(typingStyleAt(layerRuns(value), 0), undefined);
  const mixed = commonStyle(value, 0, 11);
  assert.equal(mixed.fontWeight, 'mixed');
  assert.equal(mixed.fontSize, 'mixed');
  assert.equal(mixed.color, '#112233');
  assert.equal(commonStyle(value, 7, 9).fontSize, 40);
  assert.equal(commonStyle(value, 9, 9).fontSize, 40);
});

test('rich text validation is strict and bounded', () => {
  assert.equal(validRichText({ version: 1, runs: [{ length: 11 }] }, 11), true);
  assert.equal(validRichText({ version: 1, runs: [{ length: 10 }] }, 11), false);
  assert.equal(validRichText({ version: 2, runs: [{ length: 11 }] }, 11), false);
  assert.equal(validRichText({ version: 1, runs: [{ length: 11, style: { fontSize: 0 } }] }, 11), false);
  assert.equal(validRichText({ version: 1, runs: [{ length: 11, style: { evil: 1 } }] }, 11), false);
  assert.equal(validRichText({ version: 1, runs: [{ length: 11 }], extra: true }, 11), false);
  assert.equal(validRichText({ version: 1, runs: Array.from({ length: MAX_TEXT_RUNS + 1 }, () => ({ length: 1 })) }, MAX_TEXT_RUNS + 1), false);
  assert.equal(validRunStyle({ fontFamily: 'Noto Sans', fontWeight: 600, italic: true, tracking: 50, caps: 'all-caps', script: 'superscript' }), true);
  assert.equal(validRunStyle({ fontFamily: 'Bad"Font' }), false);
  assert.equal(validRunStyle({ fontFamily: 'x'.repeat(65) }), false);
  assert.equal(validRunStyle({ fontWeight: 450.5 }), false);
  assert.equal(validRunStyle({ color: '#12345' }), false);
  assert.throws(() => richRecord(Array.from({ length: MAX_TEXT_RUNS + 1 }, (_, i) => ({ length: 1, style: { fontSize: 10 + (i % 2) } })), MAX_TEXT_RUNS + 1));
});

test('paragraph settings validate and normalize with clamping', () => {
  assert.deepEqual(normalizeParagraph(undefined), {
    justify: 'none', indentLeft: 0, indentRight: 0, indentFirst: 0, spaceBefore: 0, spaceAfter: 0, list: 'none',
  });
  assert.equal(normalizeParagraph({ indentLeft: 99999, list: 'weird' }).indentLeft, 2000);
  assert.equal(normalizeParagraph({ list: 'weird' }).list, 'none');
  assert.equal(validParagraphSettings(normalizeParagraph({ justify: 'all', list: 'number' })), true);
  assert.equal(validParagraphSettings({ ...normalizeParagraph(), spaceBefore: -1 }), false);
  assert.equal(validParagraphSettings({ ...normalizeParagraph(), extra: 1 }), false);
});

test('legacy layout keeps box alignment and one line per newline', () => {
  const value = layer({ text: 'ab\ncdef', textAlign: 'center', boxWidth: 100 });
  const layout = layoutRichText(value, { measure });
  assert.deepEqual(lineTexts(value, layout), ['ab', 'cdef']);
  assert.equal(layout.lines[0].x, (100 - 20) / 2);
  assert.equal(layout.lines[1].x, (100 - 40) / 2);
  assert.equal(layout.lines[1].y, 24);
  assert.equal(layout.mode, 'legacy');
});

test('paragraph text wraps at spaces inside the box and breaks long words', () => {
  const value = layer({ text: 'aaaa bbbb cccc dddddddddddddd', boxWidth: 100, textMode: 'paragraph' });
  const layout = layoutRichText(value, { measure });
  // 10px per glyph; "aaaa bbbb " fits in 100px.
  assert.deepEqual(lineTexts(value, layout), ['aaaa bbbb ', 'cccc ', 'dddddddddd', 'dddd']);
  for (const line of layout.lines) assert.ok(line.width <= 100.01, `line ${line.start} is ${line.width}px`);
  // Resizing the box rewraps without changing the font size.
  const wide = layoutRichText({ ...value, boxWidth: 300 }, { measure });
  assert.deepEqual(lineTexts(value, wide), ['aaaa bbbb cccc dddddddddddddd']);
  assert.equal(wide.lines[0].segments[0].style.fontSize, 20);
});

test('point text never wraps and aligns lines against the widest line', () => {
  const value = layer({ text: 'a very long point text line\nab', boxWidth: 30, textMode: 'point', textAlign: 'right' });
  const layout = layoutRichText(value, { measure });
  assert.equal(layout.lines.length, 2);
  assert.equal(layout.lines[0].x, 0);
  assert.equal(layout.lines[1].x + layout.lines[1].width, layout.lines[0].width);
});

test('right-to-left point type anchors at its right end; paragraphs right-align', () => {
  const point = layoutRichText(layer({ text: 'abc\na', textMode: 'point' }), { measure, direction: 'rtl' });
  assert.equal(point.lines[0].x + point.lines[0].width, 0);
  assert.equal(point.lines[1].x + point.lines[1].width, 0);
  const legacy = layoutRichText(layer({ text: 'abc' }), { measure, direction: 'rtl' });
  assert.equal(legacy.lines[0].x, -30);
  const paragraph = layoutRichText(layer({ text: 'abc', textMode: 'paragraph', boxWidth: 100 }), { measure, direction: 'rtl' });
  assert.equal(paragraph.lines[0].x, 70);
});

test('justification spreads spaces and the last-line option is honoured', () => {
  const value = layer({ text: 'aa bb cc dd ee ff', boxWidth: 100, textMode: 'paragraph', paragraph: { justify: 'left' } });
  const layout = layoutRichText(value, { measure });
  assert.ok(layout.lines.length >= 2);
  const first = layout.lines[0];
  assert.ok(Math.abs(first.x + first.width - 100) < 0.01, 'justified line fills the box');
  const last = layout.lines[layout.lines.length - 1];
  assert.ok(last.width < 100, 'last line stays ragged with justify-left');
  const all = layoutRichText({ ...value, paragraph: { justify: 'all' } }, { measure });
  const lastAll = all.lines[all.lines.length - 1];
  if (lastAll.end - lastAll.start > 2 && /\s/.test(value.text.slice(lastAll.start, lastAll.end)))
    assert.ok(Math.abs(lastAll.x + lastAll.width - 100) < 0.01);
});

test('indents, space before/after and lists shift lines deterministically', () => {
  const value = layer({
    text: 'one\ntwo\nthree',
    textMode: 'paragraph',
    boxWidth: 300,
    paragraph: { indentLeft: 10, indentFirst: 5, spaceBefore: 4, spaceAfter: 6, list: 'number' },
  });
  const layout = layoutRichText(value, { measure });
  const listIndent = 20 * 1.5;
  assert.equal(layout.lines[0].x, 10 + listIndent + 5);
  assert.equal(layout.lines[0].marker.text, '1.');
  assert.equal(layout.lines[2].marker.text, '3.');
  assert.equal(layout.lines[0].marker.x, 10);
  assert.equal(layout.lines[1].y, 24 + 6 + 4);
  assert.equal(listMarker('bullet', 4), '•');
});

test('mixed font sizes use the tallest leading on each line', () => {
  const value = layer({ text: 'ab\ncd', textMode: 'point', rich: { version: 1, runs: [{ length: 1, style: { fontSize: 40 } }, { length: 4 }] } });
  const layout = layoutRichText(value, { measure });
  assert.equal(layout.lines[0].height, 48);
  assert.equal(layout.lines[0].size, 40);
  assert.equal(layout.lines[1].y, 48);
  assert.equal(layout.lines[1].height, 24);
});

test('tracking, scale and caps change advances and force per-glyph drawing', () => {
  const tracked = layoutRichText(layer({ text: 'abc', rich: { version: 1, runs: [{ length: 3, style: { tracking: 500 } }] } }), { measure });
  // 10px glyphs + 10px tracking (500/1000 em at 20px) between glyphs.
  assert.equal(tracked.lines[0].width, 50);
  assert.equal(tracked.lines[0].segments[0].perGlyph, true);
  const caps = layoutRichText(layer({ text: 'abc', rich: { version: 1, runs: [{ length: 3, style: { caps: 'all-caps' } }] } }), { measure });
  assert.equal(caps.lines[0].segments[0].text, 'ABC');
  const wide = layoutRichText(layer({ text: 'abc', rich: { version: 1, runs: [{ length: 3, style: { scaleX: 200 } }] } }), { measure });
  assert.equal(wide.lines[0].width, 60);
  assert.match(fontCss({ ...layoutRichText(layer(), { measure }).lines[0].segments[0].style, italic: true }), /^italic 400 20px "Arial"$/);
});

test('paragraph overflow is reported against the box height', () => {
  const value = layer({ text: 'aaaa bbbb cccc dddd', boxWidth: 50, boxHeight: 30, textMode: 'paragraph' });
  const layout = layoutRichText(value, { measure });
  assert.equal(layout.overflow, true);
  assert.equal(layout.overflowOffset, layout.lines[1].start);
  assert.equal(layoutRichText({ ...value, boxHeight: 1000 }, { measure }).overflow, false);
});

test('dynamic text fit scales type to fill and shrink to the box', () => {
  const value = layer({ text: 'aaaa bbbb cccc dddd', boxWidth: 100, boxHeight: 30, textMode: 'paragraph', fit: 'shrink' });
  const scale = fitTextScale(value, { measure });
  assert.ok(scale < 1 && scale > 0.1);
  const fitted = layoutRichText(value, { measure, scale });
  assert.equal(fitted.overflow, false);
  assert.ok(fitted.height <= 30.5);
  const grow = fitTextScale({ ...value, text: 'ab', fit: 'fit', boxHeight: 200 }, { measure });
  assert.ok(grow > 1);
  assert.equal(fitTextScale({ ...value, fit: 'none' }, { measure }), 1);
});

test('caret geometry, hit testing and navigation follow visual lines', () => {
  const value = layer({ text: 'aaaa bbbb cccc', boxWidth: 100, textMode: 'paragraph' });
  const layout = layoutRichText(value, { measure });
  assert.deepEqual(lineTexts(value, layout), ['aaaa bbbb ', 'cccc']);
  const caret = caretGeometry(layout, 2);
  assert.deepEqual([caret.x, caret.y, caret.line], [20, 0, 0]);
  // Soft-wrap boundary: backward stays at line end, forward goes to next line.
  assert.equal(caretGeometry(layout, 10, 'forward').line, 1);
  assert.equal(offsetAtPoint(layout, 21, 30), 12);
  assert.equal(offsetAtPoint(layout, -50, 5), 0);
  assert.equal(offsetAtPoint(layout, 999, 999), 14);
  const down = verticalCaretMove(layout, 2, 1);
  assert.equal(down.offset, 12);
  assert.equal(verticalCaretMove(layout, down.offset, -1, down.goal).offset, 2);
  assert.equal(verticalCaretMove(layout, 2, -1).offset, 0);
  assert.equal(lineBoundary(layout, 12, 'start'), 10);
  assert.equal(lineBoundary(layout, 12, 'end'), 14);
  const rects = selectionRects(layout, 2, 12);
  assert.equal(rects.length, 2);
  assert.deepEqual([rects[1].x, rects[1].y, rects[1].width], [0, 24, 20]);
  assert.deepEqual(selectionRects(layout, 3, 3), []);
});

test('vertical text lays glyphs down columns with caret stops', () => {
  const value = layer({ text: 'ab\ncd', orientation: 'vertical' });
  const layout = layoutRichText(value, { measure });
  assert.equal(layout.vertical, true);
  assert.equal(layout.lines.length, 2);
  assert.equal(layout.lines[1].x, 24);
  const caret = caretGeometry(layout, 4);
  assert.equal(caret.vertical, true);
  assert.equal(caret.x, 24);
  assert.equal(caret.y, 20);
});

test('word, paragraph ranges and layer names', () => {
  assert.deepEqual(wordRange('Hello brave world', 8), { start: 6, end: 11 });
  assert.deepEqual(wordRange('Hello brave world', 11), { start: 6, end: 11 });
  assert.deepEqual(wordRange('a  b', 2), { start: 2, end: 3 });
  assert.deepEqual(paragraphRange('one\ntwo\nthree', 5), { start: 4, end: 7 });
  assert.equal(typeLayerName('  Hello\n world  '), 'Hello world');
  assert.equal(typeLayerName(''), 'Text');
  assert.equal(typeLayerName('x'.repeat(40)).length, 31);
});

test('a 2,000-character paragraph lays out quickly with the width cache', () => {
  const text = Array.from({ length: 400 }, (_, i) => `word${i % 10}`).join(' ').slice(0, 2000);
  const value = layer({ text, textMode: 'paragraph', boxWidth: 600, rich: { version: 1, runs: [{ length: 1000, style: { italic: true } }, { length: text.length - 1000 }] } });
  let calls = 0;
  const counting = (font, value) => { calls++; return measure(font, value); };
  layoutRichText(value, { measure: counting });
  const started = performance.now();
  for (let i = 0; i < 20; i++) layoutRichText({ ...value, text: value.text }, { measure: counting });
  const elapsed = (performance.now() - started) / 20;
  assert.ok(elapsed < 25, `layout took ${elapsed.toFixed(2)}ms`);
  assert.ok(calls < 400, `measure calls ${calls}`);
});
