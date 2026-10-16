import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePromptToEdit,
  validPromptEditPlan,
  PROMPT_TO_EDIT_MAX_PROMPT,
} from '../src/promptToEdit.ts';

test('parses combined natural language into bounded local adjustments', () => {
  const result = parsePromptToEdit('Make it warmer and slightly brighter, then sharpen');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.patch.photoAdjustments?.temperature, 10);
  assert.equal(result.plan.patch.brightness, 110);
  assert.equal(result.plan.patch.sharpenNoise?.sharpen, 10);
  assert.equal(validPromptEditPlan(result.plan), true);
});

test('recognizes grayscale, contrast and hue while clamping values', () => {
  const result = parsePromptToEdit('grayscale, increase contrast by 120%, hue rotate -240');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.patch.saturation, 0);
  assert.equal(result.plan.patch.photoAdjustments?.blackAndWhite, true);
  assert.equal(result.plan.patch.contrast, 180);
  assert.equal(result.plan.patch.hue, -180);
});

test('reset is explicit and cannot be combined with another edit', () => {
  const reset = parsePromptToEdit('reset all adjustments');
  assert.equal(reset.ok, true);
  if (reset.ok) {
    assert.equal(reset.plan.reset, true);
    assert.deepEqual(reset.plan.operations, ['reset']);
  }
  const mixed = parsePromptToEdit('reset adjustments and warm it');
  assert.equal(mixed.ok, false);
});

test('unknown, empty and oversized prompts fail closed', () => {
  assert.equal(parsePromptToEdit('').ok, false);
  assert.equal(parsePromptToEdit('make the sky look cinematic').ok, false);
  assert.equal(parsePromptToEdit('x'.repeat(PROMPT_TO_EDIT_MAX_PROMPT + 1)).ok, false);
  assert.equal(parsePromptToEdit(null).ok, false);
});

test('planning is deterministic and does not mutate the request text', () => {
  const input = '  COOLER by 40%  ';
  const first = parsePromptToEdit(input);
  const second = parsePromptToEdit(input);
  assert.deepEqual(first, second);
  assert.equal(input, '  COOLER by 40%  ');
});
