import test from 'node:test';
import assert from 'node:assert/strict';
import { cookieCutterPath } from '../src/cookieCutter.ts';

test('Cookie Cutter paths are bounded editable closed contours', () => {
  for (const shape of ['rectangle', 'ellipse', 'triangle', 'star', 'hexagon']) {
    const path = cookieCutterPath(120, 80, shape);
    assert.equal(path.closed, true);
    assert.equal(path.fill, true);
    assert.equal(path.stroke, false);
    assert.ok(path.nodes.length >= 3);
    assert.ok(path.nodes.every((point) => point.x >= 0 && point.x <= 120 && point.y >= 0 && point.y <= 80));
  }
});

test('Cookie Cutter rejects unknown shapes and malformed dimensions', () => {
  assert.throws(() => cookieCutterPath(120, 80, 'heart'), /invalid/);
  assert.throws(() => cookieCutterPath(0, 80, 'ellipse'), /invalid|dimension/);
});
