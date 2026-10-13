import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeUndoHistory } from '../src/historyPurge.ts';

test('purges history to the selected current frame without mutating source history', () => {
  const first = { id: 'first' }, current = { id: 'current' }, future = { id: 'future' };
  const history = [first, current, future];
  const result = purgeUndoHistory(history, 1);
  assert.deepEqual(result, [current]);
  assert.deepEqual(history, [first, current, future]);
  assert.notEqual(result, history);
});

test('rejects invalid history positions before creating a purge plan', () => {
  assert.throws(() => purgeUndoHistory([], 0), /invalid history/);
  assert.throws(() => purgeUndoHistory([{ id: 'only' }], -1), /invalid history/);
  assert.throws(() => purgeUndoHistory([{ id: 'only' }], 2), /invalid history/);
});
