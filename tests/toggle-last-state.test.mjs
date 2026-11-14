import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveToggleLastState } from '../src/toggleLastState.ts';

const states = (count) => Array.from({ length: count }, (_, index) => ({ index }));

test('Toggle Last State alternates between the current and previous state on a long history', () => {
  const history = states(5);
  let index = 4;
  let anchor = null;
  const visited = [];
  for (let press = 0; press < 4; press++) {
    const step = resolveToggleLastState(history, index, anchor);
    assert.ok(step);
    index = step.target;
    anchor = step.anchor;
    visited.push(index);
  }
  // The old menu handler stepped 4 → 3 → 2 → 1; the toggle must bounce.
  assert.deepEqual(visited, [3, 4, 3, 4]);
});

test('with nothing to undo it toggles forward to the redo state and back', () => {
  const history = states(3);
  const first = resolveToggleLastState(history, 0, null);
  assert.equal(first.target, 1);
  const second = resolveToggleLastState(history, first.target, first.anchor);
  assert.equal(second.target, 0);
});

test('another history move or a new edit starts a fresh toggle', () => {
  const history = states(5);
  const first = resolveToggleLastState(history, 4, null);
  assert.equal(first.target, 3);
  // The user pressed Undo again: index 2 is not the anchored state.
  assert.equal(resolveToggleLastState(history, 2, first.anchor).target, 1);
  // A new edit replaced the redo states: the anchored "from" state is gone.
  const edited = [...history.slice(0, 4), { index: 'new' }];
  assert.equal(resolveToggleLastState(edited, 3, first.anchor).target, 2);
});

test('a single-state history has nothing to toggle', () => {
  assert.equal(resolveToggleLastState(states(1), 0, null), undefined);
  assert.equal(resolveToggleLastState([], 0, null), undefined);
});
