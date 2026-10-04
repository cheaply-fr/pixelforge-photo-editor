import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendActionStep,
  createActionSet,
  MAX_ACTION_FILE_BYTES,
  parseActionSets,
  removeActionStep,
  replayActionSet,
  renameAction,
  serializeActionSets,
  validActionSet,
  validActionSets,
} from '../src/actions.ts';

const now = new Date('2026-10-04T10:00:00.000Z');

test('action recipes append only allow-listed deterministic commands and remain immutable', () => {
  const first = createActionSet('  Color pass  ', 'action-1', now);
  const next = appendActionStep(first, 'auto-tone', 'Auto Tone', undefined, 'step-1', now);
  assert.deepEqual(first.steps, []);
  assert.equal(next.name, 'Color pass');
  assert.equal(next.steps[0].command, 'auto-tone');
  assert.throws(
    () => appendActionStep(next, 'open', 'Open image', undefined, 'step-2', now),
    /cannot be recorded/,
  );
});

test('action recipes serialize and validate bounded round trips', () => {
  const source = appendActionStep(
    createActionSet('Export recipe', 'action-2', now),
    'filter-gaussian-blur',
    'Gaussian Blur',
    { radius: 6, amount: 85 },
    'step-2',
    now,
  );
  const parsed = parseActionSets(serializeActionSets([source]));
  assert.deepEqual(parsed, [source]);
  assert.equal(validActionSets(parsed), true);
  assert.equal(validActionSet({ ...source, steps: [{ ...source.steps[0], command: 'noop' }] }), false);
  assert.throws(() => parseActionSets('{"version":2,"actions":[]}'), /invalid/);
});

test('recipes support deterministic rename and step removal without mutating history', () => {
  const source = appendActionStep(
    appendActionStep(createActionSet('Recipe', 'action-3', now), 'flip-h', 'Flip horizontal', undefined, 'step-a', now),
    'flip-v',
    'Flip vertical',
    undefined,
    'step-b',
    now,
  );
  const removed = removeActionStep(source, 0, now);
  const renamed = renameAction(removed, '  Final recipe  ', now);
  assert.equal(source.steps.length, 2);
  assert.equal(renamed.steps.length, 1);
  assert.equal(renamed.steps[0].command, 'flip-v');
  assert.equal(renamed.name, 'Final recipe');
});

test('replay reports completed steps and stops at the first failure', async () => {
  const action = appendActionStep(
    appendActionStep(createActionSet('Replay', 'action-4', now), 'auto-tone', 'Auto Tone', undefined, 'step-1', now),
    'flip-h',
    'Flip horizontal',
    undefined,
    'step-2',
    now,
  );
  const seen = [];
  const result = await replayActionSet(action, async (step) => {
    seen.push(step.command);
    if (step.command === 'flip-h') throw new Error('locked layer');
  });
  assert.deepEqual(seen, ['auto-tone', 'flip-h']);
  assert.equal(result.completed, 1);
  assert.equal(result.failure?.index, 1);
  assert.equal(result.failure?.error, 'locked layer');
});

test('replay observes cancellation before the next step', async () => {
  const action = appendActionStep(
    appendActionStep(createActionSet('Cancel', 'action-5', now), 'auto-tone', 'Auto Tone', undefined, 'step-1', now),
    'flip-v',
    'Flip vertical',
    undefined,
    'step-2',
    now,
  );
  const controller = new AbortController();
  const seen = [];
  const result = await replayActionSet(action, async (step) => {
    seen.push(step.command);
    controller.abort();
  }, controller.signal);
  assert.deepEqual(seen, ['auto-tone']);
  assert.equal(result.completed, 1);
  assert.equal(result.failure?.index, 1);
  assert.match(result.failure?.error || '', /cancelled/);
});

test('recipe envelopes reject oversized payloads before parsing', () => {
  assert.throws(
    () => parseActionSets('x'.repeat(MAX_ACTION_FILE_BYTES + 1)),
    /256 KB/,
  );
});
