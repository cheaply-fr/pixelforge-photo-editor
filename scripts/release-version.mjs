// Build identity shared by vite.config.ts (baked into the bundle),
// scripts/write-release.mjs (/release.json, /api/readyz.json) and
// scripts/verify-deployment.mjs. Everything is derived from the build
// environment, so a deploy never needs a version-bump commit on main.
//
// Scheme (docs/deployment.md, "Release versions"):
//   main deploy run   <major>.<minor>.<GITHUB_RUN_NUMBER>   e.g. 0.1.512
//   pull request run  <package version>-pr.<n>+<sha7>       e.g. 0.1.0-pr.226+1a2b3c4
//   other CI run      <package version>-ci.<run>+<sha7>
//   local build       <package version>-dev+<sha7>          e.g. 0.1.0-dev+1a2b3c4
//
// GITHUB_RUN_NUMBER is per workflow, increments for every run of
// "CI and deploy" (PR runs included, so main versions have gaps) and is kept
// by re-runs, so a re-run republishes the same version. The major.minor come
// from package.json; bump them there for a deliberate larger step.
import { execFileSync } from 'node:child_process';

const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const RUN_NUMBER = /^[1-9]\d{0,9}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const PULL_REF = /^refs\/pull\/([1-9]\d{0,9})\/merge$/;
const DEPLOY_EVENTS = new Set(['push', 'workflow_dispatch']);

/** @typedef {Record<string, string | undefined>} BuildEnv */

/**
 * Parse the plain `x.y.z` package version; anything else is a build error.
 * @param {unknown} value
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parsePackageVersion(value) {
  const match = typeof value === 'string' ? SEMVER.exec(value) : null;
  if (!match) throw new Error(`package.json version must be a plain x.y.z version, got ${JSON.stringify(value)}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * Whether this environment is the main-branch run that deploys production.
 * @param {BuildEnv} [env]
 */
export function isMainDeployRun(env = {}) {
  return env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REF === 'refs/heads/main'
    && DEPLOY_EVENTS.has(env.GITHUB_EVENT_NAME);
}

/**
 * The version of a build. `commit` is the full SHA being built (optional for
 * local builds); `env` is the process environment.
 * Returns `{ version, channel }`, channel being release | pr | ci | dev.
 * @param {{ packageVersion?: unknown, env?: BuildEnv, commit?: string }} [options]
 * @returns {{ version: string, channel: 'release' | 'pr' | 'ci' | 'dev' }}
 */
export function deriveReleaseVersion({ packageVersion, env = {}, commit } = {}) {
  const { major, minor, patch } = parsePackageVersion(packageVersion);
  const base = `${major}.${minor}.${patch}`;
  const sha = typeof commit === 'string' && COMMIT.test(commit) ? `+${commit.slice(0, 7)}` : '';
  const run = env.GITHUB_RUN_NUMBER;

  if (isMainDeployRun(env)) {
    // Fail closed: a production artifact must never carry a non-monotonic version.
    if (typeof run !== 'string' || !RUN_NUMBER.test(run))
      throw new Error(`GITHUB_RUN_NUMBER must be a positive integer for a main deploy, got ${JSON.stringify(run)}`);
    return { version: `${major}.${minor}.${run}`, channel: 'release' };
  }

  if (env.GITHUB_ACTIONS === 'true') {
    const pull = typeof env.GITHUB_REF === 'string' ? PULL_REF.exec(env.GITHUB_REF) : null;
    if (pull && env.GITHUB_EVENT_NAME?.startsWith('pull_request'))
      return { version: `${base}-pr.${pull[1]}${sha}`, channel: 'pr' };
    const ci = typeof run === 'string' && RUN_NUMBER.test(run) ? `-ci.${run}` : '-ci';
    return { version: `${base}${ci}${sha}`, channel: 'ci' };
  }

  return { version: `${base}-dev${sha}`, channel: 'dev' };
}

/**
 * The full commit being built: GITHUB_SHA in Actions, else the checkout HEAD.
 * @param {BuildEnv} [env]
 * @param {() => string} [readHead]
 * @returns {string}
 */
export function resolveBuildCommit(env = {}, readHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })) {
  if (env.GITHUB_SHA) return env.GITHUB_SHA.trim().toLowerCase();
  try {
    return readHead().trim().toLowerCase();
  } catch {
    return '';
  }
}
