import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLastFilterType } from '../src/lastFilter.ts';

const allowed = ['gaussian-blur', 'twirl'];

test('last filter normalization accepts known effect IDs and rejects stale values', () => {
  assert.equal(normalizeLastFilterType(' Gaussian-Blur ', allowed), 'gaussian-blur');
  assert.equal(normalizeLastFilterType('none', allowed), undefined);
  assert.equal(normalizeLastFilterType('unsupported', allowed), undefined);
  assert.equal(normalizeLastFilterType(null, allowed), undefined);
});
