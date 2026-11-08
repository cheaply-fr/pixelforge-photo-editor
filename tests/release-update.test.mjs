import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReleasePayload, releaseUpdateAvailable } from '../src/releaseStatus.ts';

const application = 'pixelforge-photo-editor';
const a = 'a'.repeat(40), b = 'b'.repeat(40);

test('a different deployed commit is a new version; the same or unknown is not', () => {
  const release = parseReleasePayload({ application, version: '0.1.0', commit: b });
  assert.equal(releaseUpdateAvailable(a, release), true);
  assert.equal(releaseUpdateAvailable(b, release), false);
  assert.equal(releaseUpdateAvailable(b.toUpperCase(), release), false);
  assert.equal(releaseUpdateAvailable(undefined, release), false);
  assert.equal(releaseUpdateAvailable('', release), false);
  assert.equal(releaseUpdateAvailable('abc', release), false);
  assert.equal(releaseUpdateAvailable(a, null), false);
  // Malformed release payloads never claim an update.
  assert.equal(releaseUpdateAvailable(a, parseReleasePayload({ application, commit: 'nope' })), false);
});
