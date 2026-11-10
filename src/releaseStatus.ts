export type ReleaseInfo = {
  application: 'pixelforge-photo-editor';
  version?: string;
  commit: string;
  builtAt?: string;
};

export type ReadyInfo = {
  ready: boolean;
  application: 'pixelforge-photo-editor';
  version?: string;
  commit: string;
};

export type ReleaseHealth = 'online' | 'degraded' | 'offline';

const APPLICATION = 'pixelforge-photo-editor' as const;
const SAFE_TEXT = /^[a-zA-Z0-9._+-]{1,80}$/;

declare const __PIXELFORGE_BUILD_VERSION__: string | undefined;
/**
 * Version of the running build, baked in by vite.config.ts from the same
 * derivation as /release.json (scripts/release-version.mjs), so offline and
 * local sessions still identify the app. Unbundled code (pure tests) has no
 * baked version.
 */
export const APP_VERSION =
  typeof __PIXELFORGE_BUILD_VERSION__ === 'string' && SAFE_TEXT.test(__PIXELFORGE_BUILD_VERSION__)
    ? __PIXELFORGE_BUILD_VERSION__
    : '0.0.0-dev';
const COMMIT = /^[a-f0-9]{40}$/i;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_TEXT.test(value);

const commit = (value: unknown): value is string =>
  typeof value === 'string' && COMMIT.test(value);

/** Parse the static release artifact without allowing arbitrary server data into UI text. */
export function parseReleasePayload(value: unknown): ReleaseInfo | null {
  if (
    !record(value) ||
    value.application !== APPLICATION ||
    !commit(value.commit) ||
    (value.version !== undefined && !text(value.version))
  )
    return null;
  return {
    application: APPLICATION,
    commit: value.commit,
    ...(text(value.version) ? { version: value.version } : {}),
    ...(typeof value.builtAt === 'string' ? { builtAt: value.builtAt } : {}),
  };
}

/** Parse the readiness artifact and require the canonical application identity. */
export function parseReadyPayload(value: unknown): ReadyInfo | null {
  if (
    !record(value) ||
    value.application !== APPLICATION ||
    typeof value.ready !== 'boolean' ||
    !commit(value.commit) ||
    (value.version !== undefined && !text(value.version))
  )
    return null;
  return {
    ready: value.ready,
    application: APPLICATION,
    commit: value.commit,
    ...(text(value.version) ? { version: value.version } : {}),
  };
}

/** A release is online only when readiness is true and both artifacts name the same commit. */
export function releaseHealth(
  release: ReleaseInfo | null,
  ready: ReadyInfo | null,
): ReleaseHealth {
  if (!release || !ready) return 'offline';
  if (
    !ready.ready ||
    release.commit.toLowerCase() !== ready.commit.toLowerCase() ||
    release.version !== ready.version
  )
    return 'degraded';
  return 'online';
}

/**
 * Top-bar version label. While a newer deploy is waiting for a reload the tab
 * still runs its own build, so pass `null` to show the baked version; the
 * update notice names the new one.
 */
export function releaseLabel(release: ReleaseInfo | null, fallback: string = APP_VERSION): string {
  return `v${release?.version ?? fallback}`;
}

export function healthLabel(health: ReleaseHealth): string {
  if (health === 'online') return 'Server online';
  if (health === 'degraded') return 'Server degraded';
  return 'Offline · local editing';
}

/**
 * Whether the server now serves a different build than the one running in
 * this tab. `loadedCommit` is the commit baked into the bundle (or, without
 * one, the first release this tab saw). Unknown or malformed data never
 * claims an update.
 */
export function releaseUpdateAvailable(
  loadedCommit: string | undefined,
  release: ReleaseInfo | null,
): boolean {
  if (!release || !commit(loadedCommit)) return false;
  return release.commit.toLowerCase() !== loadedCommit.toLowerCase();
}
