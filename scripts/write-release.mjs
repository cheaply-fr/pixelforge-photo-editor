import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { deriveReleaseVersion, resolveBuildCommit } from './release-version.mjs';

const APPLICATION = 'pixelforge-photo-editor';

/** The /release.json record for a build; the version scheme is in release-version.mjs. */
export function buildReleaseRecord({ packageVersion, env = {}, commit, builtAt = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('A full Git commit is required');
  const { version, channel } = deriveReleaseVersion({ packageVersion, env, commit });
  return { application: APPLICATION, version, channel, commit, builtAt: builtAt.toISOString() };
}

/** Write /release.json and the /api/readyz.json probe (also served as /health). */
export async function writeReleaseFiles(outDir, release) {
  await mkdir(join(outDir, 'api'), { recursive: true });
  await writeFile(join(outDir, 'release.json'), JSON.stringify(release) + '\n');
  await writeFile(join(outDir, 'api', 'readyz.json'), JSON.stringify({ ready: true, ...release }) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const release = buildReleaseRecord({
    packageVersion: manifest.version,
    env: process.env,
    commit: resolveBuildCommit(process.env),
  });
  await writeReleaseFiles('dist', release);
  console.log(`Release ${release.version} (${release.channel}) for ${release.commit}`);
}
