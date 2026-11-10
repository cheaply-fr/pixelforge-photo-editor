import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE_COMMIT_SWITCH_TRIGGERS,
  TYPE_COMMIT_TRIGGERS,
  toolAfterTypeCommit,
} from '../src/typeCommitTool.ts';

const outcome = (patch = {}) => ({ trigger: 'confirm', mask: false, layerKept: true, tool: 'text', ...patch });

test('deliberate commits of horizontal and vertical type switch to Move', () => {
  for (const trigger of ['confirm', 'shortcut', 'click-outside'])
    for (const tool of ['text', 'vertical-text'])
      assert.equal(toolAfterTypeCommit(outcome({ trigger, tool })), 'move', `${trigger} on ${tool}`);
});

test('incidental commits keep the current tool', () => {
  for (const trigger of ['focus-out', 'tool-switch', 'page-hide', 'new-session', 'command'])
    assert.equal(toolAfterTypeCommit(outcome({ trigger })), undefined, trigger);
});

test('type masks, discarded or failed layers and non-type tools never switch', () => {
  assert.equal(toolAfterTypeCommit(outcome({ mask: true, tool: 'text-mask' })), undefined);
  assert.equal(toolAfterTypeCommit(outcome({ mask: true, tool: 'vertical-text-mask' })), undefined);
  assert.equal(toolAfterTypeCommit(outcome({ layerKept: false })), undefined, 'empty layer discarded');
  assert.equal(toolAfterTypeCommit(outcome({ tool: 'move' })), undefined, 'already left the Type tools');
  assert.equal(toolAfterTypeCommit(outcome({ tool: 'brush' })), undefined);
});

test('the switch triggers are a subset of the known triggers', () => {
  for (const trigger of TYPE_COMMIT_SWITCH_TRIGGERS) assert.ok(TYPE_COMMIT_TRIGGERS.includes(trigger), trigger);
  assert.deepEqual([...TYPE_COMMIT_SWITCH_TRIGGERS].sort(), ['click-outside', 'confirm', 'shortcut']);
});
