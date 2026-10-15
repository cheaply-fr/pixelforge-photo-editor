import test from 'node:test';
import assert from 'node:assert/strict';
import { bristleCoverage, bristleOpacity, normalizeBrushBristle } from '../src/brushBristle.ts';

test('bristle normalization clamps malformed and bounded values', () => {
  assert.equal(normalizeBrushBristle(undefined), 0);
  assert.equal(normalizeBrushBristle(-10), 0);
  assert.equal(normalizeBrushBristle(140), 100);
  assert.equal(normalizeBrushBristle(37.4), 37);
});

test('bristle modulation is an exact zero identity and replay deterministic', () => {
  assert.equal(bristleOpacity(3, 5, 0), 1);
  const first = bristleOpacity(3, 5, 100);
  assert.equal(first, bristleOpacity(3, 5, 100));
  assert.ok(first >= 0.45 && first <= 1);
  assert.notEqual(first, bristleOpacity(4, 5, 100));
});

test('bristle geometry is an exact zero identity and changes bounded filament coverage', () => {
  assert.equal(bristleCoverage(2, 3, 10, 0), 1);
  const covered = bristleCoverage(2, 3, 10, 100);
  assert.ok(covered >= 0 && covered <= 1);
  assert.equal(covered, bristleCoverage(2, 3, 10, 100));
  assert.notEqual(covered, bristleCoverage(0, 0, 10, 100));
});
