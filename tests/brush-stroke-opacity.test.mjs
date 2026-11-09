import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRadialStamp, BrushStrokeBuffer, BRUSH_STROKE_TILE } from '../src/brush.ts';
import { applyPatternStamp } from '../src/patternStamp.ts';

const width = 120, height = 24;
const flat = (rgba) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return data;
};
const at = (data, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const dab = (x, extra = {}) => ({ width, height, x, y: 12, size: 16, hardness: 100, opacity: 0.5, mode: 'source-over', color: [255, 0, 0, 255], ...extra });
/** A 25 %-spacing stroke along y = 12 from x = 10 to x = 110. */
const strokeXs = Array.from({ length: 26 }, (_, i) => 10 + i * 4);

test('without a stroke buffer overlapping 50 % dabs compound (the old behaviour)', () => {
  const data = flat([34, 59, 66, 255]);
  for (const x of strokeXs) applyRadialStamp(data, dab(x));
  assert.ok(at(data, 60, 12)[0] > 230, 'four overlapping dabs exceed the Opacity');
});

test('a long Opacity 50 % / Flow 100 % stroke stays exactly at 50 %', () => {
  const single = flat([34, 59, 66, 255]);
  applyRadialStamp(single, dab(60));
  const data = flat([34, 59, 66, 255]),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  for (const x of strokeXs) applyRadialStamp(data, dab(x), stroke);
  for (const [channel, value] of at(data, 60, 12).entries())
    assert.ok(Math.abs(value - at(single, 60, 12)[channel]) <= 1, 'stroke matches one 50 % dab');
  assert.deepEqual(at(data, 60, 12), [145, 30, 33, 255]);
  for (const x of [12, 40, 80, 108]) assert.deepEqual(at(data, x, 12), [145, 30, 33, 255]);
  assert.deepEqual(at(data, 60, 0), [34, 59, 66, 255], 'outside the tip is untouched');
});

test('flow below 100 % accumulates within a stroke up to the Opacity ceiling', () => {
  const data = flat([0, 0, 0, 0]),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.6), originX: 0, originY: 0 };
  applyRadialStamp(data, dab(60, { opacity: 0.6 * 0.25 }), stroke);
  const first = at(data, 60, 12)[3];
  assert.ok(Math.abs(first - 0.15 * 255) <= 1, `first dab ${first}`);
  for (let i = 0; i < 60; i += 1) applyRadialStamp(data, dab(60, { opacity: 0.6 * 0.25 }), stroke);
  const built = at(data, 60, 12)[3];
  assert.ok(built > first, 'repeated dabs build up');
  assert.ok(Math.abs(built - 0.6 * 255) <= 1, `capped at 60 %: ${built}`);
});

test('eraser at 50 % removes at most half the alpha in one stroke', () => {
  const data = flat([10, 20, 30, 255]),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  for (const x of strokeXs) applyRadialStamp(data, dab(x, { mode: 'destination-out', color: undefined }), stroke);
  assert.deepEqual(at(data, 60, 12), [10, 20, 30, 128]);
  // A second stroke (new buffer) removes half again: Photoshop-style per-stroke cap.
  const next = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  for (const x of strokeXs) applyRadialStamp(data, dab(x, { mode: 'destination-out', color: undefined }), next);
  assert.deepEqual(at(data, 60, 12), [10, 20, 30, 64]);
});

test('clone and heal strokes are capped at Opacity and keep the fixed source offset', () => {
  const source = flat([34, 59, 66, 255]);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < 30; x += 1) source.set([201, 129, 79, 255], (y * width + x) * 4);
  const data = new Uint8ClampedArray(source),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  // Paint x 70..80 from source x 10..20 (offset -60).
  for (let x = 70; x <= 80; x += 2)
    applyRadialStamp(data, dab(x, { mode: 'clone', color: undefined, source, sourceX: x - 60, sourceY: 12, size: 8 }), stroke);
  const expected = [118, 94, 73, 255];
  for (const [channel, value] of at(data, 75, 12).entries()) assert.ok(Math.abs(value - expected[channel]) <= 1);
  const healed = new Uint8ClampedArray(source),
    healStroke = { buffer: new BrushStrokeBuffer(width, height, 1), originX: 0, originY: 0 };
  for (let x = 70; x <= 80; x += 2)
    applyRadialStamp(healed, dab(x, { opacity: 1, mode: 'heal', color: undefined, source, sourceX: x - 60, sourceY: 12, size: 8 }), healStroke);
  // Healing keeps its bounded 0.65 blend, not 1 − 0.35ⁿ.
  assert.ok(Math.abs(at(healed, 75, 12)[0] - Math.round(201 * 0.65 + 34 * 0.35)) <= 1);
});

test('stroke buffers map local dab regions to canvas coordinates and allocate tiles lazily', () => {
  const buffer = new BrushStrokeBuffer(4000, 3000, 0.5);
  assert.equal(buffer.tileCount, 0);
  const local = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 400; i += 1) local.set([0, 0, 255, 255], i * 4);
  const request = { width: 20, height: 20, x: 10, y: 10, size: 16, hardness: 100, opacity: 0.5, mode: 'source-over', color: [255, 255, 255, 255] };
  applyRadialStamp(local, request, { buffer, originX: 2000, originY: 1500 });
  applyRadialStamp(local, request, { buffer, originX: 2000, originY: 1500 });
  assert.ok(buffer.tileCount >= 1 && buffer.tileCount <= 4);
  assert.ok(buffer.coverageAt(2010, 1510) > 0.99);
  assert.equal(buffer.coverageAt(10, 10), 0);
  assert.deepEqual(Array.from(local.slice((10 * 20 + 10) * 4, (10 * 20 + 10) * 4 + 4)), [128, 128, 255, 255]);
  assert.equal(BRUSH_STROKE_TILE, 64);
  assert.throws(() => new BrushStrokeBuffer(10, 10, 2));
});

test('colour-jittered dabs blend inside the stroke but never exceed the ceiling', () => {
  const data = flat([0, 0, 0, 255]),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  applyRadialStamp(data, dab(60, { color: [255, 0, 0, 255] }), stroke);
  applyRadialStamp(data, dab(60, { color: [0, 0, 255, 255] }), stroke);
  // The later opaque dab replaces the stroke colour; alpha stays 50 % over black.
  assert.deepEqual(at(data, 60, 12), [0, 0, 128, 255]);
});

test('pattern stamp strokes are capped at Opacity', () => {
  const request = (x) => ({ width, height, x, y: 12, size: 16, hardness: 100, opacity: 0.5, pattern: 'checker', tileSize: 8, foreground: [255, 255, 255, 255], background: [255, 255, 255, 255] });
  const data = flat([0, 0, 0, 255]),
    stroke = { buffer: new BrushStrokeBuffer(width, height, 0.5), originX: 0, originY: 0 };
  for (const x of strokeXs) applyPatternStamp(data, request(x), stroke);
  assert.deepEqual(at(data, 60, 12), [128, 128, 128, 255]);
});
