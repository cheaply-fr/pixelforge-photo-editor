import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrushWetEdges, wetEdgesOpacity } from '../src/brushWetEdges.ts';
import { radialStampMask } from '../src/brush.ts';

test('wet edges normalize malformed and bounded values', () => {
  assert.equal(normalizeBrushWetEdges(undefined), 0);
  assert.equal(normalizeBrushWetEdges(-4), 0);
  assert.equal(normalizeBrushWetEdges(120), 100);
  assert.equal(normalizeBrushWetEdges(24.6), 25);
});

test('wet edges are an identity at zero and deterministic otherwise', () => {
  assert.equal(wetEdgesOpacity(0, 10, 0), 1);
  assert.equal(wetEdgesOpacity(10, 10, 100), 1);
  const centre = wetEdgesOpacity(0, 10, 100);
  assert.ok(centre < 1 && centre > 0.6);
  assert.equal(centre, wetEdgesOpacity(0, 10, 100));
});

test('wet-edge brush mask preserves the tip edge and reduces the centre only', () => {
  const plain = radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, wetEdges: 0 });
  const wet = radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, wetEdges: 100 });
  const centre = (12 - wet.bounds.top) * wet.width + (12 - wet.bounds.left);
  assert.ok(wet.data[centre] < plain.data[centre]);
  const edge = (12 - wet.bounds.top) * wet.width + (19 - wet.bounds.left);
  assert.equal(wet.data[edge], plain.data[edge]);
  assert.deepEqual(Array.from(wet.data), Array.from(radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, wetEdges: 100 }).data));
});
