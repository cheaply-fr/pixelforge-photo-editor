import test from 'node:test';
import assert from 'node:assert/strict';
import { canRestoreHistory, summarizeHistory } from '../src/historyTimeline.ts';

const frame = (name, width = 8) => ({
  w: width,
  h: 6,
  layers: [{ id: `${name}-id`, name, kind: 'raster', visible: true, locked: false, opacity: 100, blend: 'normal', matrix: [1, 0, 0, 1, 0, 0], adjustments: {} }],
  active: `${name}-id`,
});

test('history timeline summaries identify current state and preserve order', () => {
  const entries = summarizeHistory([frame('Background'), frame('Retouch', 10)], 1);
  assert.deepEqual(entries.map((entry) => entry.label), ['1. Background', '2. Retouch']);
  assert.equal(entries[0].current, false);
  assert.equal(entries[0].reachable, true);
  assert.equal(entries[1].current, true);
  assert.equal(entries[1].width, 10);
});

test('history timeline clamps an out-of-range current index without mutating frames', () => {
  const frames = [frame('One'), frame('Two')];
  const entries = summarizeHistory(frames, 99);
  assert.equal(entries.at(-1).current, true);
  assert.equal(frames.length, 2);
});

test('history restore rejects invalid and current targets', () => {
  const frames = [frame('One'), frame('Two')];
  assert.equal(canRestoreHistory(frames, 1, 0), true);
  assert.equal(canRestoreHistory(frames, 1, 1), false);
  assert.equal(canRestoreHistory(frames, 1, 2), false);
  assert.equal(canRestoreHistory([], 0, 0), false);
});
