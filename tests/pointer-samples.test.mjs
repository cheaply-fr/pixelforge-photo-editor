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
