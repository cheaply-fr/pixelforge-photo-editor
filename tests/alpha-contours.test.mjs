import test from 'node:test';
import assert from 'node:assert/strict';
import { traceAlphaContours } from '../src/alphaContours.ts';

const mask = (width, height, points) => {
  const data = new Uint8Array(width * height);
  for (const [x, y, value = 255] of points) data[y * width + x] = value;
  return data;
};

test('traces an irregular silhouette and removes collinear anchors', () => {
  const traced = traceAlphaContours(mask(5, 5, [
    [1, 1], [2, 1], [3, 1],
    [1, 2], [2, 2],
    [1, 3], [2, 3], [3, 3],
  ]), 5, 5);
  assert.equal(traced.selectedPixels, 8);
  assert.equal(traced.contours.length, 1);
  assert.equal(traced.contours[0].closed, true);
  assert.ok(traced.contours[0].nodes.length >= 6);
  assert.ok(traced.contours[0].nodes.length < 16);
});

test('keeps disconnected islands as separate contours', () => {
  const traced = traceAlphaContours(mask(6, 3, [[0, 0], [1, 0], [4, 2], [5, 2]]), 6, 3);
  assert.equal(traced.selectedPixels, 4);
  assert.equal(traced.contours.length, 2);
  assert.ok(traced.contours.every((contour) => contour.closed && contour.nodes.length === 4));
});

test('keeps a hole as an opposite-oriented compound contour', () => {
  const points = [];
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) {
    if (x !== 2 || y !== 2) points.push([x, y]);
  }
  const traced = traceAlphaContours(mask(5, 5, points), 5, 5);
  assert.equal(traced.contours.length, 2);
  const area = (nodes) => nodes.reduce((sum, node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    return sum + node.x * next.y - next.x * node.y;
  }, 0);
  assert.notEqual(Math.sign(area(traced.contours[0].nodes)), Math.sign(area(traced.contours[1].nodes)));
});

test('rejects malformed dimensions and planes', () => {
  assert.throws(() => traceAlphaContours(new Uint8Array(1), 0, 1), /dimensions/);
  assert.throws(() => traceAlphaContours(new Uint8Array(1), 2, 2), /too small/);
});
