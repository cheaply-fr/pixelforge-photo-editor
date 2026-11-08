import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  deriveReleaseVersion,
  isMainDeployRun,
  parsePackageVersion,
  resolveBuildCommit,
} from '../scripts/release-version.mjs';
import { buildReleaseRecord, writeReleaseFiles } from '../scripts/write-release.mjs';
import { parseReadyPayload, parseReleasePayload, releaseHealth, releaseLabel } from '../src/releaseStatus.ts';

const commit = '1a2b3c4d5e6f708192a3b4c5d6e7f80912a3b4c5';
const mainPush = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_NUMBER: '512',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: commit,
};
const derive = (env, packageVersion = '0.1.0', sha = commit) => deriveReleaseVersion({ packageVersion, env, commit: sha });

test('a main deploy run takes its patch from the workflow run number', () => {
  assert.deepEqual(derive(mainPush), { version: '0.1.512', channel: 'release' });
  assert.equal(derive({ ...mainPush, GITHUB_EVENT_NAME: 'workflow_dispatch' }).version, '0.1.512');
  // The package major.minor are kept; its patch is replaced, not added to.
  assert.equal(derive(mainPush, '2.7.9').version, '2.7.512');
  assert.ok(isMainDeployRun(mainPush));
});

test('main deploy versions increase with each run and survive re-runs unchanged', () => {
  const versions = ['511', '512', '530', '1000'].map((run) => derive({ ...mainPush, GITHUB_RUN_NUMBER: run }).version);
  assert.deepEqual(versions, ['0.1.511', '0.1.512', '0.1.530', '0.1.1000']);
  const patches = versions.map((version) => Number(version.split('.')[2]));
  assert.deepEqual([...patches].sort((a, b) => a - b), patches);
  // A re-run keeps GITHUB_RUN_NUMBER and only bumps the attempt.
  assert.equal(derive({ ...mainPush, GITHUB_RUN_ATTEMPT: '3' }).version, derive(mainPush).version);
});

test('a main deploy without a valid run number fails instead of publishing a stale version', () => {
  for (const run of [undefined, '', '0', '-4', '12a', '01', '3.5', ' 7', '12345678901'])
    assert.throws(() => derive({ ...mainPush, GITHUB_RUN_NUMBER: run }), /GITHUB_RUN_NUMBER/, String(run));
});

test('pull request builds are marked with the PR number and commit, never a release version', () => {
  const env = { ...mainPush, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/226/merge' };
  assert.deepEqual(derive(env), { version: '0.1.0-pr.226+1a2b3c4', channel: 'pr' });
  assert.equal(isMainDeployRun(env), false);
  assert.equal(derive({ ...env, GITHUB_RUN_NUMBER: undefined }).version, '0.1.0-pr.226+1a2b3c4');
});

test('other CI runs and non-main refs are marked as CI builds', () => {
  assert.deepEqual(
    derive({ ...mainPush, GITHUB_REF: 'refs/heads/feature', GITHUB_EVENT_NAME: 'workflow_dispatch' }),
    { version: '0.1.0-ci.512+1a2b3c4', channel: 'ci' },
  );
  assert.equal(derive({ ...mainPush, GITHUB_EVENT_NAME: 'schedule' }).channel, 'ci');
  assert.equal(derive({ ...mainPush, GITHUB_REF: 'refs/heads/feature', GITHUB_RUN_NUMBER: 'x' }).version, '0.1.0-ci+1a2b3c4');
  // A main ref outside GitHub Actions is a local build.
  assert.equal(derive({ ...mainPush, GITHUB_ACTIONS: undefined }).channel, 'dev');
});

test('local builds are marked dev, with the commit when one is known', () => {
  assert.deepEqual(derive({}), { version: '0.1.0-dev+1a2b3c4', channel: 'dev' });
  assert.equal(derive({}, '0.1.0', '').version, '0.1.0-dev');
  assert.equal(derive({}, '0.1.0', 'not-a-sha').version, '0.1.0-dev');
  assert.equal(deriveReleaseVersion({ packageVersion: '0.1.0' }).version, '0.1.0-dev');
});

test('invalid package versions fail the build', () => {
  for (const value of [undefined, '', '1', '1.2', '01.2.3', '1.2.3-beta', 'v1.2.3', 4])
    assert.throws(() => parsePackageVersion(value), /package\.json version/, String(value));
  assert.throws(() => derive(mainPush, '0.1'), /package\.json version/);
  assert.deepEqual(parsePackageVersion('0.1.0'), { major: 0, minor: 1, patch: 0 });
});

test('every derived version is safe UI text the release parser accepts', () => {
  for (const env of [mainPush, {}, { ...mainPush, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/9999999/merge' }]) {
    const { version } = derive(env, '123456789.123456789.0');
    const release = parseReleasePayload({ application: 'pixelforge-photo-editor', version, commit });
    assert.equal(release?.version, version);
    assert.equal(releaseLabel(release), `v${version}`);
  }
});

test('the build commit comes from GITHUB_SHA, else git HEAD, else nothing', () => {
  assert.equal(resolveBuildCommit({ GITHUB_SHA: commit.toUpperCase() }, () => 'x'), commit);
  assert.equal(resolveBuildCommit({}, () => `${commit}\n`), commit);
  assert.equal(resolveBuildCommit({}, () => { throw new Error('no git'); }), '');
});

test('the release record carries the derived version, channel and commit', () => {
  const builtAt = new Date('2026-11-08T12:00:00.000Z');
  assert.deepEqual(buildReleaseRecord({ packageVersion: '0.1.0', env: mainPush, commit, builtAt }), {
    application: 'pixelforge-photo-editor',
    version: '0.1.512',
    channel: 'release',
    commit,
    builtAt: '2026-11-08T12:00:00.000Z',
  });
  assert.equal(buildReleaseRecord({ packageVersion: '0.1.0', env: {}, commit, builtAt }).version, '0.1.0-dev+1a2b3c4');
  assert.throws(() => buildReleaseRecord({ packageVersion: '0.1.0', env: {}, commit: '' }), /full Git commit/);
  assert.throws(() => buildReleaseRecord({ packageVersion: '0.1.0', env: { ...mainPush, GITHUB_RUN_NUMBER: '' }, commit }), /GITHUB_RUN_NUMBER/);
});

test('release.json and the readiness probe report the same version and commit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pixelforge-release-'));
  try {
    const record = buildReleaseRecord({ packageVersion: '0.1.0', env: mainPush, commit });
    await writeReleaseFiles(dir, record);
    const releaseText = await readFile(join(dir, 'release.json'), 'utf8');
    const ready = JSON.parse(await readFile(join(dir, 'api', 'readyz.json'), 'utf8'));
    assert.ok(releaseText.endsWith('\n'));
    assert.deepEqual(JSON.parse(releaseText), record);
    assert.deepEqual(ready, { ready: true, ...record });
    assert.equal(releaseHealth(parseReleasePayload(JSON.parse(releaseText)), parseReadyPayload(ready)), 'online');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
