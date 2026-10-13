import test from 'node:test';
import assert from 'node:assert/strict';
import { moveContentAwareSelection, validContentAwareMove } from '../src/contentAwareMove.ts';

const pixel = (r, g, b, a = 255) => [r, g, b, a];

test('content-aware move validates bounded metadata', () => {
  assert.equal(validContentAwareMove({ version: 1, dx: 2, dy: -1, radius: 4, opacity: 1 }), true);
  assert.equal(validContentAwareMove({ version: 1, dx: 4097, dy: 0, radius: 4, opacity: 1 }), false);
  assert.equal(validContentAwareMove({ version: 1, dx: 0, dy: 0, radius: 0, opacity: 1 }), false);
});

test('content-aware move translates selected pixels and fills the source hole', () => {
  const source = new Uint8ClampedArray([
    ...pixel(10, 10, 10), ...pixel(20, 20, 20), ...pixel(30, 30, 30),
    ...pixel(40, 40, 40), ...pixel(200, 0, 0), ...pixel(60, 60, 60),
    ...pixel(70, 70, 70), ...pixel(80, 80, 80), ...pixel(90, 90, 90),
  ]);
  const mask = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0, 0]);
  const result = moveContentAwareSelection(source, 3, 3, mask, {
    version: 1, dx: 1, dy: 0, radius: 1, opacity: 1,
  });
  assert.notEqual(result, source);
  assert.deepEqual(Array.from(source.slice(16, 20)), pixel(200, 0, 0));
  assert.deepEqual(Array.from(result.slice(20, 24)), pixel(200, 0, 0));
  assert.notDeepEqual(Array.from(result.slice(16, 20)), pixel(200, 0, 0));
});

test('content-aware move is deterministic and keeps transparent RGB neutral', () => {
  const source = new Uint8ClampedArray([0, 0, 0, 0, 90, 90, 90, 255, 0, 0, 0, 0, 40, 40, 40, 255]);
  const mask = new Uint8ClampedArray([0, 255, 0, 0]);
  const move = { version: 1, dx: 1, dy: 0, radius: 1, opacity: 1 };
  const first = moveContentAwareSelection(source, 2, 2, mask, move);
  assert.deepEqual(Array.from(first), Array.from(moveContentAwareSelection(source, 2, 2, mask, move)));
  assert.deepEqual(Array.from(first.slice(0, 4)), [0, 0, 0, 0]);
});
