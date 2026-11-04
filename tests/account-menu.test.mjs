import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/AccountMenu.tsx', import.meta.url), 'utf8');

test('account menu keeps the shared Cheaply auth contract and local guest identity', () => {
  assert.match(source, /marketplace\.cheaply\.fr\/marketplace\/auth\/logout/);
  assert.match(source, /marketplace\.cheaply\.fr\/marketplace\/profile/);
  assert.match(source, /SIGN_IN/);
  assert.match(source, /pixelforge:guest-avatar/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /Editing is free without an account/);
  assert.match(source, /Your edits stay on this device/);
});


test('an unavailable account service is explained instead of linking to sign-in', async () => {
  const cloud = await fs.readFile(new URL('../src/cloud.ts', import.meta.url), 'utf8');
  assert.match(cloud, /setUnavailable\(true\)/);
  assert.match(cloud, /return \{ member, checking, unavailable, retry \}/);
  assert.match(source, /Sign-in is unavailable right now/);
  assert.match(source, /Try again/);
  // The sign-in link is rendered only in the available branch.
  const unavailableBranch = source.slice(source.indexOf('{unavailable ? ('), source.indexOf(') : (', source.indexOf('{unavailable ? (')));
  assert.doesNotMatch(unavailableBranch, /href=\{SIGN_IN\}/);
});
