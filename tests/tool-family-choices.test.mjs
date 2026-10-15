import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeToolFamilyChoices,
  serializeToolFamilyChoices,
} from '../src/toolFamilyChoices.ts';

test('normalizes remembered variants and rejects unknown families/tools', () => {
  assert.deepEqual(
    normalizeToolFamilyChoices({
      version: 1,
      choices: { lasso: 'magnetic-lasso', bogus: 'clone', crop: 'not-a-tool' },
    }),
    { lasso: 'magnetic-lasso' },
  );
  assert.deepEqual(
    normalizeToolFamilyChoices({ version: 99, choices: { lasso: 'lasso' } }),
    {},
  );
  assert.deepEqual(normalizeToolFamilyChoices(null), {});
});

test('serializes a versioned, normalized preference envelope', () => {
  assert.equal(
    serializeToolFamilyChoices({ lasso: 'polygonal-lasso', bogus: 'clone' }),
    '{"version":1,"choices":{"lasso":"polygonal-lasso"}}',
  );
});
