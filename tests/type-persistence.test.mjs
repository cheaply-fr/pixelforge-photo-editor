import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTextAntiAlias, drawTextLayer, effectiveTextLayer, neutral, validateFrame } from '../src/document.ts';
import { textAntiAliasAlpha } from '../src/richText.ts';

const id = '22222222-2222-4222-8222-222222222222';
const textLayer = (patch = {}) => ({
  id, name: 'Type', visible: true, locked: false, opacity: 1, blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0], adjustments: structuredClone(neutral),
  kind: 'text', text: 'Hello world', color: '#000000', fontSize: 20, fontFamily: 'Arial', bold: false,
  boxWidth: 100, textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, ...patch,
});
const frame = (layer) => ({ w: 200, h: 200, layers: [layer], active: id });

test('legacy text layers without type-tool fields still validate and normalize', () => {
  assert.doesNotThrow(() => validateFrame(frame(textLayer()), {}));
  const legacy = effectiveTextLayer(textLayer(), 200);
  assert.equal(legacy.textMode, undefined);
  assert.equal(legacy.rich, undefined);
});

test('rich runs, paragraph settings, modes, anti-aliasing and fit validate', () => {
  const rich = textLayer({
    textMode: 'paragraph', boxHeight: 80, antiAlias: 'sharp', fit: 'shrink',
    rich: { version: 1, runs: [{ length: 6 }, { length: 5, style: { fontWeight: 700, color: '#ff0000', fontFamily: 'Library Serif' } }] },
    paragraph: { justify: 'left', indentLeft: 4, indentRight: 0, indentFirst: 8, spaceBefore: 0, spaceAfter: 6, list: 'bullet' },
  });
  assert.doesNotThrow(() => validateFrame(frame(rich), {}));
  for (const bad of [
    { textMode: 'curved' },
    { boxHeight: 0 },
    { antiAlias: 'blurry' },
    { fit: 'grow' },
    { rich: { version: 1, runs: [{ length: 3 }] } },
    { rich: { version: 1, runs: [{ length: 11, style: { fontSize: 5000 } }] } },
    { rich: { version: 9, runs: [{ length: 11 }] } },
    { paragraph: { justify: 'left' } },
    { text: 'x'.repeat(10001) },
  ]) assert.throws(() => validateFrame(frame(textLayer(bad)), {}), /Invalid layer document/, JSON.stringify(bad).slice(0, 60));
});

test('drawing honours per-run colour, decorations and paragraph wrapping', () => {
  const calls = [];
  const context = {
    font: '', fillStyle: '#000000', textAlign: 'start', direction: 'ltr',
    measureText: (text) => ({ width: Array.from(text).length * 10 }),
    fillText: function (text, x, y) { calls.push({ op: 'text', text, x, y, fill: this.fillStyle }); },
    fillRect: function (x, y, w) { calls.push({ op: 'rect', x, y, w, fill: this.fillStyle }); },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  };
  drawTextLayer(context, textLayer({
    textMode: 'paragraph', boxWidth: 70,
    rich: { version: 1, runs: [{ length: 6 }, { length: 5, style: { color: '#ff0000', underline: true } }] },
  }));
  const texts = calls.filter((call) => call.op === 'text');
  assert.deepEqual(texts.map((call) => [call.text, call.fill]), [['Hello ', '#000000'], ['world', '#ff0000']]);
  assert.ok(texts[1].y > texts[0].y, 'second word wraps to a new line');
  const underline = calls.find((call) => call.op === 'rect');
  assert.equal(underline.fill, '#ff0000');
  assert.equal(underline.w, 50);
});

test('anti-aliasing curves are monotonic, bounded and None is binary', () => {
  for (const mode of ['none', 'sharp', 'crisp', 'strong', 'smooth']) {
    let previous = -1;
    for (let alpha = 0; alpha <= 255; alpha++) {
      const value = textAntiAliasAlpha(mode, alpha);
      assert.ok(value >= previous && value >= 0 && value <= 255, `${mode} ${alpha}`);
      previous = value;
    }
    assert.equal(textAntiAliasAlpha(mode, 0), 0);
    assert.equal(textAntiAliasAlpha(mode, 255), 255);
  }
  assert.deepEqual([textAntiAliasAlpha('none', 127), textAntiAliasAlpha('none', 128)], [0, 255]);
  assert.ok(textAntiAliasAlpha('strong', 100) > 100);
  assert.ok(textAntiAliasAlpha('sharp', 100) < 100);
  const pixels = new Uint8ClampedArray([0, 0, 0, 100, 0, 0, 0, 200]);
  applyTextAntiAlias(pixels, 'none');
  assert.deepEqual([pixels[3], pixels[7]], [0, 255]);
});
