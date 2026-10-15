import assert from 'node:assert/strict';
import test from 'node:test';
import { shapeBounds, shapePoints, validateShapeVariant } from '../src/vectorShapes.ts';

test('shape variants produce deterministic vertex counts and bounds', () => {
  const triangle = shapePoints(200, 100, 'triangle', 9);
  const polygon = shapePoints(200, 100, 'polygon', 6);
  const star = shapePoints(200, 100, 'star', 5);
  assert.equal(triangle.length, 3);
  assert.equal(polygon.length, 6);
  assert.equal(star.length, 10);
  const bounds = shapeBounds(triangle);
  assert.equal(bounds.top, 0);
  assert.equal(bounds.right, 186.60254037844388);
  assert.ok(Math.abs(bounds.left - 13.39745962155615) < 1e-12);
  assert.ok(Math.abs(bounds.bottom - 75) < 1e-12);
  assert.equal(star[0].x, 100);
  assert.equal(star[0].y, 0);
  assert.ok(Math.abs(star[1].y - 29.774575140626315) < 1e-12);
  assert.deepEqual(shapePoints(200, 100, 'star', 5), shapePoints(200, 100, 'star', 5));
});

test('shape variants normalize legacy polygons and reject unsafe values', () => {
  assert.equal(validateShapeVariant(undefined), 'polygon');
  assert.equal(validateShapeVariant('triangle'), 'triangle');
  assert.throws(() => validateShapeVariant('hex'), /variant/);
  assert.throws(() => shapePoints(0, 100), /dimensions/);
  assert.throws(() => shapePoints(100, 100, 'star', 2), /sides/);
  assert.throws(() => shapeBounds([]), /points/);
});

test('star inner vertices remain inside the outer ring', () => {
  const points = shapePoints(120, 120, 'star', 7);
  const center = { x: 60, y: 60 };
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  assert.ok(Math.abs(Math.max(...radii) - 60) < 1e-12);
  assert.ok(Math.abs(Math.min(...radii) - 30) < 1e-12);
});

test('star inner radius is bounded and deterministic', () => {
  const points = shapePoints(120, 120, 'star', 5, 0.7);
  const center = { x: 60, y: 60 };
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  assert.ok(Math.abs(Math.min(...radii) - 42) < 1e-12);
  assert.throws(() => shapePoints(120, 120, 'star', 5, 0.05), /inner radius/);
  assert.throws(() => shapePoints(120, 120, 'star', 5, 0.95), /inner radius/);
});
