import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleContentAwareSelection, validContentAwareScale } from '../src/contentAwareScale.ts';

const pixel = (r, g, b, a = 255) => [r, g, b, a];

test('content-aware scale validates bounded independent axes', () => {
  assert.equal(validContentAwareScale({ version: 1, scaleX: 1.2, scaleY: 0.8, radius: 12, opacity: 0.75 }), true);
  assert.equal(validContentAwareScale({ version: 1, mask: 'mask-asset', scaleX: 1.2, scaleY: 0.8, radius: 12, opacity: 0.75 }), true);
  assert.equal(validContentAwareScale({ version: 1, mask: 'bad value', scaleX: 1.2, scaleY: 0.8, radius: 12, opacity: 0.75 }), false);
  assert.equal(validContentAwareScale({ version: 1, scaleX: 0.2, scaleY: 1, radius: 12, opacity: 1 }), false);
  assert.equal(validContentAwareScale({ version: 1, scaleX: 4.1, scaleY: 1, radius: 12, opacity: 1 }), false);
  assert.equal(validContentAwareScale({ version: 1, scaleX: 1, scaleY: 1, radius: 0, opacity: 1 }), false);
});

test('content-aware scale fills the old selection and scales its pixels around the selection centre', () => {
  const width = 5;
  const height = 1;
  const source = new Uint8ClampedArray([
    ...pixel(10, 10, 10), ...pixel(20, 20, 20), ...pixel(200, 0, 0), ...pixel(200, 0, 0), ...pixel(10, 10, 10),
  ]);
  const mask = new Uint8Array([0, 0, 255, 255, 0]);
  const result = scaleContentAwareSelection(source, width, height, mask, {
    version: 1, scaleX: 0.5, scaleY: 1, radius: 2, opacity: 1,
  });
  assert.equal(result.length, source.length);
  assert.notDeepEqual(Array.from(result), Array.from(source));
  assert.deepEqual(Array.from(result.slice(0, 4)), pixel(10, 10, 10));
  assert.deepEqual(Array.from(result.slice(16, 20)), pixel(10, 10, 10));
});

test('content-aware scale is deterministic, detached, alpha-safe, and empty selections are identity', () => {
  const source = new Uint8ClampedArray([
    ...pixel(30, 40, 50, 255), ...pixel(90, 80, 70, 128),
    ...pixel(1, 2, 3, 0), ...pixel(100, 110, 120, 255),
  ]);
  const mask = new Uint8Array([0, 255, 0, 0]);
  const settings = { version: 1, scaleX: 1.5, scaleY: 1.5, radius: 4, opacity: 0.8 };
  const one = scaleContentAwareSelection(source, 2, 2, mask, settings);
  const two = scaleContentAwareSelection(source, 2, 2, mask, settings);
  assert.deepEqual(Array.from(one), Array.from(two));
  assert.notEqual(one, source);
  assert.equal(one[11], 0);
  const identity = scaleContentAwareSelection(source, 2, 2, new Uint8Array(4), settings);
  assert.deepEqual(Array.from(identity), Array.from(source));
});

