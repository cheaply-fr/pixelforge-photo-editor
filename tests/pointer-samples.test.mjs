import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_COALESCED_SAMPLES, precedingCoalescedSamples } from '../src/pointerSamples.ts';

/** A browser-like move whose coalesced list ends with the event itself. */
const move = (points, extra = {}) => {
  const samples = points.map(([clientX, clientY, pressure = 0.5]) => ({ clientX, clientY, pressure }));
  const last = samples[samples.length - 1];
  return { ...last, ...extra, getCoalescedEvents: () => samples };
};

const sine = (count) =>
  Array.from({ length: count }, (_, index) => [index * 2, 100 + 40 * Math.sin(index / 5), index / count]);

test('every coalesced sample before the event is returned in order with its pressure', () => {
  const points = sine(17);
  const native = move(points);
  const samples = precedingCoalescedSamples(native, native);
  assert.equal(samples.length, 16);
  for (const [index, sample] of samples.entries()) {
    assert.equal(sample.clientX, points[index][0]);
    assert.equal(sample.clientY, points[index][1]);
    assert.equal(sample.pressure, points[index][2]);
    assert.equal(sample.source, native.getCoalescedEvents()[index]);
  }
});

test('the event itself (the last coalesced entry) is not repeated', () => {
  const native = move([[1, 1], [2, 2], [3, 3]]);
  const samples = precedingCoalescedSamples(native, native);
  assert.deepEqual(samples.map((sample) => [sample.clientX, sample.clientY]), [[1, 1], [2, 2]]);
});

test('a replayed move applies its client offset to every sample', () => {
  const native = move([[10, 10], [20, 15], [30, 30]]);
  const replayed = { clientX: native.clientX + 7, clientY: native.clientY - 4 };
  const samples = precedingCoalescedSamples(replayed, native);
  assert.deepEqual(samples.map((sample) => [sample.clientX, sample.clientY]), [[17, 6], [27, 11]]);
});

test('no samples without coalescing support, with a single entry, or when the list throws', () => {
  assert.deepEqual(precedingCoalescedSamples({ clientX: 1, clientY: 1 }, undefined), []);
  assert.deepEqual(precedingCoalescedSamples({ clientX: 1, clientY: 1 }, { clientX: 1, clientY: 1 }), []);
  const single = move([[5, 5]]);
  assert.deepEqual(precedingCoalescedSamples(single, single), []);
  const empty = { clientX: 0, clientY: 0, getCoalescedEvents: () => [] };
  assert.deepEqual(precedingCoalescedSamples(empty, empty), []);
  const throwing = { clientX: 0, clientY: 0, getCoalescedEvents: () => { throw new Error('detached'); } };
  assert.deepEqual(precedingCoalescedSamples(throwing, throwing), []);
});

test('non-finite samples are skipped and the rest keep their order', () => {
  const native = move([[1, 1], [Number.NaN, 2], [3, Number.POSITIVE_INFINITY], [4, 4], [5, 5]]);
  const samples = precedingCoalescedSamples(native, native);
  assert.deepEqual(samples.map((sample) => sample.clientX), [1, 4]);
});

test('a missing pressure stays undefined so the caller can fall back to the event', () => {
  const samples = [{ clientX: 1, clientY: 1 }, { clientX: 2, clientY: 2 }];
  const native = { clientX: 2, clientY: 2, getCoalescedEvents: () => samples };
  assert.equal(precedingCoalescedSamples(native, native)[0].pressure, undefined);
});

test('a runaway list is capped to the newest samples, still in order', () => {
  const points = Array.from({ length: MAX_COALESCED_SAMPLES + 11 }, (_, index) => [index, index]);
  const native = move(points);
  const samples = precedingCoalescedSamples(native, native);
  assert.equal(samples.length, MAX_COALESCED_SAMPLES);
  assert.equal(samples[0].clientX, 10);
  assert.equal(samples[samples.length - 1].clientX, points.length - 2);
  for (let index = 1; index < samples.length; index += 1)
    assert.ok(samples[index].clientX > samples[index - 1].clientX);
});

test('grouping a dense path into coalesced moves reproduces every sample (hidden-page delivery)', () => {
  const points = sine(201);
  const delivered = [];
  for (let start = 1; start < points.length; start += 16) {
    const native = move(points.slice(start, start + 16));
    for (const sample of precedingCoalescedSamples(native, native))
      delivered.push([sample.clientX, sample.clientY, sample.pressure]);
    delivered.push([native.clientX, native.clientY, native.pressure]);
  }
  assert.deepEqual(delivered, points.slice(1));
});

test('samples from before the press (the hover path to the new start) are dropped', () => {
  const at = (clientX, clientY, timeStamp, buttons) => ({ clientX, clientY, timeStamp, buttons });
  // Previous stroke ended at (10, 10); the pointer hovered to (100, 100) and pressed at t=50.
  const hover = [at(10, 10, 20, 0), at(55, 55, 30, 0), at(100, 100, 40, 0)];
  const drag = [at(104, 100, 60, 1), at(108, 100, 70, 1)];
  const list = [...hover, ...drag];
  const native = { ...drag[1], getCoalescedEvents: () => list };
  const samples = precedingCoalescedSamples(native, native, 50);
  assert.deepEqual(samples.map((sample) => [sample.clientX, sample.clientY]), [[104, 100]]);
  // Without a press time, hover samples inside a pressed move are still dropped.
  assert.deepEqual(precedingCoalescedSamples(native, native).map((sample) => sample.clientX), [104]);
});

test('samples at or after the press, and samples without times or buttons, are kept', () => {
  const list = [
    { clientX: 1, clientY: 1, timeStamp: 50, buttons: 1 },
    { clientX: 2, clientY: 2 },
    { clientX: 3, clientY: 3, timeStamp: 0, buttons: 1 },
    { clientX: 4, clientY: 4, timeStamp: 90, buttons: 1 },
  ];
  const native = { ...list[3], getCoalescedEvents: () => list };
  assert.deepEqual(precedingCoalescedSamples(native, native, 50).map((sample) => sample.clientX), [1, 2, 3]);
  // A hover move (no buttons) keeps its own hover samples: nothing is painted from them anyway.
  const hoverList = list.map((sample) => ({ ...sample, buttons: 0 }));
  const hoverNative = { ...hoverList[3], getCoalescedEvents: () => hoverList };
  assert.equal(precedingCoalescedSamples(hoverNative, hoverNative).length, 3);
});
