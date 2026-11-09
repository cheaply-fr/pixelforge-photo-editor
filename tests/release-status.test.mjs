import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  healthLabel,
  parseReadyPayload,
  parseReleasePayload,
  releaseHealth,
  releaseLabel,
} from '../src/releaseStatus.ts';

const commit = 'a'.repeat(40);

test('release and readiness payloads accept the canonical application and version', () => {
  const release = parseReleasePayload({
    application: 'pixelforge-photo-editor',
    version: '0.1.0',
    commit,
    builtAt: '2026-10-03T00:00:00.000Z',
  });
  const ready = parseReadyPayload({
    ready: true,
    application: 'pixelforge-photo-editor',
    version: '0.1.0',
    commit,
  });
  assert.equal(release?.version, '0.1.0');
  assert.equal(ready?.ready, true);
  assert.equal(releaseHealth(release, ready), 'online');
  assert.equal(releaseLabel(release), 'v0.1.0');
});

test('malformed or foreign payloads fail closed to offline', () => {
  assert.equal(parseReleasePayload({ application: 'other', commit }), null);
  assert.equal(parseReleasePayload({ application: 'pixelforge-photo-editor', commit: 'nope' }), null);
  assert.equal(parseReleasePayload({ application: 'pixelforge-photo-editor', commit: 'a'.repeat(7) }), null);
  assert.equal(parseReleasePayload({ application: 'pixelforge-photo-editor', commit, version: '<script>' }), null);
  assert.equal(parseReadyPayload({ application: 'pixelforge-photo-editor', ready: true, commit, version: 1 }), null);
  assert.equal(parseReadyPayload({ application: 'pixelforge-photo-editor', ready: 'yes', commit }), null);
  assert.equal(releaseHealth(null, null), 'offline');
  assert.equal(healthLabel('offline'), 'Offline · local editing');
});

test('readiness false is degraded even when release commits match', () => {
  const release = parseReleasePayload({ application: 'pixelforge-photo-editor', commit });
  const ready = parseReadyPayload({ application: 'pixelforge-photo-editor', ready: false, commit });
  assert.equal(releaseHealth(release, ready), 'degraded');
  assert.equal(healthLabel('degraded'), 'Server degraded');
});

test('a commit mismatch is degraded and never reported online', () => {
  const release = parseReleasePayload({ application: 'pixelforge-photo-editor', commit });
  const ready = parseReadyPayload({
    application: 'pixelforge-photo-editor',
    ready: true,
    commit: 'b'.repeat(40),
  });
  assert.equal(releaseHealth(release, ready), 'degraded');
});

test('version mismatches are degraded even when commits match', () => {
  const release = parseReleasePayload({ application: 'pixelforge-photo-editor', version: '1.0.0', commit });
  const ready = parseReadyPayload({ application: 'pixelforge-photo-editor', version: '2.0.0', ready: true, commit });
  assert.equal(releaseHealth(release, ready), 'degraded');
  const missingReadyVersion = parseReadyPayload({ application: 'pixelforge-photo-editor', ready: true, commit });
  assert.equal(releaseHealth(release, missingReadyVersion), 'degraded');
});

test('versionless local metadata keeps a useful local label', () => {
  // Unbundled code has no baked build version.
  assert.equal(releaseLabel(parseReleasePayload({ application: 'pixelforge-photo-editor', commit })), 'v0.0.0-dev');
  assert.equal(releaseLabel(null), 'v0.0.0-dev');
  assert.equal(releaseLabel(null, '0.1.512'), 'v0.1.512');
  assert.equal(releaseLabel(parseReleasePayload({ application: 'pixelforge-photo-editor', commit, version: '0.1.513' }), '0.1.512'), 'v0.1.513');
});
