import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { deriveReleaseVersion } from '../scripts/release-version.mjs';

test('deployable artifact identifies the app and contains resolvable assets', async () => {
  const release = JSON.parse(await readFile('dist/release.json', 'utf8'));
  const ready = JSON.parse(await readFile('dist/api/readyz.json', 'utf8'));
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(release.application, 'pixelforge-photo-editor');
  // Built in this environment, so the version follows the same derivation
  // (0.1.<run> on a main deploy run, -pr./-dev. builds otherwise).
  const expected = deriveReleaseVersion({ packageVersion: manifest.version, env: process.env, commit: release.commit });
  assert.equal(release.version, expected.version);
  assert.equal(release.channel, expected.channel);
  assert.equal(ready.version, release.version);
  assert.match(release.commit, /^[a-f0-9]{40}$/);
  assert.equal(ready.ready, true);
  assert.equal(ready.commit, release.commit);
  const html = await readFile('dist/index.html', 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)];
  assert.ok(assets.length >= 2, 'built JavaScript and CSS assets are present');
  for (const [, asset] of assets) assert.ok((await readFile('dist' + asset)).length > 0);
});

test('the bundle bakes the same version and commit as /release.json', async () => {
  const release = JSON.parse(await readFile('dist/release.json', 'utf8'));
  const scripts = (await readdir('dist/assets')).filter((name) => name.endsWith('.js'));
  const sources = await Promise.all(scripts.map((name) => readFile('dist/assets/' + name, 'utf8')));
  // A quoted string literal, whichever quote style the minifier picks.
  const literal = (value) => new RegExp(`["'\`]${value.replace(/[.+]/g, '\\$&')}["'\`]`);
  assert.ok(sources.some((source) => literal(release.version).test(source)), 'baked version');
  assert.ok(sources.some((source) => literal(release.commit).test(source)), 'baked commit');
});
