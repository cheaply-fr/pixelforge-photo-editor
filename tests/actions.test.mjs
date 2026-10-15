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
  const merge = appendActionStep(next, 'merge-layers', 'Merge Layers', undefined, 'step-3', now);
  assert.equal(merge.steps.at(-1).command, 'merge-layers');
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

test('local Path and Spin Blur commands record and round-trip through the action allowlist', () => {
  const original = createActionSet('Gallery blur', 'blur-action', now);
  const path = appendActionStep(original, 'filter-path-blur', 'Path Blur', undefined, 'path', now);
  const spin = appendActionStep(path, 'filter-spin-blur', 'Spin Blur', undefined, 'spin', now);
  assert.deepEqual(original.steps, []);
  assert.deepEqual(spin.steps.map((step) => step.command), ['filter-path-blur', 'filter-spin-blur']);
  assert.deepEqual(parseActionSets(serializeActionSets([spin])), [spin]);
});

test('filter geometry parameters survive Action serialization without source data', () => {
  const source = createActionSet('Geometry pass', 'geometry-action', now);
  const action = appendActionStep(
    source,
    'filter-field-blur',
    'Field Blur',
    {
      amount: 85,
      filterExtra: JSON.stringify({ fieldPoints: [{ x: 0.25, y: 0.75, radius: 18 }] }),
    },
    'geometry-step',
    now,
  );
  const parsed = parseActionSets(serializeActionSets([action]));
  assert.deepEqual(parsed, [action]);
  assert.equal(validActionSets(parsed), true);
  assert.equal(JSON.stringify(parsed).includes('data:'), false);
});

test('Pointillize records as a replayable local pixelate command', async () => {
  const original = createActionSet('Stipple finish', 'pointillize-action', now);
  const action = appendActionStep(
    original,
    'filter-pointillize',
    'Pointillize',
    { amount: 85, radius: 10 },
    'pointillize-step',
    now,
  );
  assert.deepEqual(original.steps, []);
  assert.equal(action.steps[0].command, 'filter-pointillize');
  assert.deepEqual(parseActionSets(serializeActionSets([action])), [action]);
  const seen = [];
  const result = await replayActionSet(action, async (step) => {
    seen.push(step.command);
  });
  assert.equal(result.completed, 1);
  assert.deepEqual(seen, ['filter-pointillize']);
});

test('active noise and cleanup filters are replayable without aliases', async () => {
  const commands = [
    'filter-add-noise',
    'filter-median',
    'filter-dust-scratches',
    'filter-despeckle',
    'filter-reduce-noise',
    'filter-gradient-map',
    'filter-lens-correction',
    'filter-liquify',
    'filter-reflection-removal',
  ];
  const source = createActionSet('Noise and cleanup', 'noise-action', now);
  let action = source;
  for (const [index, command] of commands.entries())
    action = appendActionStep(action, command, command, undefined, `step-${index}`, now);
  const seen = [];
  const result = await replayActionSet(action, async (step) => seen.push(step.command));
  assert.equal(result.completed, commands.length);
  assert.deepEqual(seen, commands);
});

test('plain Blur is an allow-listed replayable filter command', async () => {
  const action = appendActionStep(
    createActionSet('Blur', 'blur-action', now),
    'filter-blur',
    'Blur',
    { amount: 70, radius: 6 },
    'blur-step',
    now,
  );
  const seen = [];
  const result = await replayActionSet(action, async (step) => seen.push(step.command));
  assert.equal(result.completed, 1);
  assert.deepEqual(seen, ['filter-blur']);
  assert.deepEqual(parseActionSets(serializeActionSets([action])), [action]);
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
