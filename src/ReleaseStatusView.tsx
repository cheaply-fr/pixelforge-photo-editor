'use client';

import { useEffect, useRef, useState } from 'react';

import {
  healthLabel,
  parseReadyPayload,
  parseReleasePayload,
  releaseHealth,
  releaseLabel,
  releaseUpdateAvailable,
  type ReadyInfo,
  type ReleaseHealth,
  type ReleaseInfo,
} from './releaseStatus';

export const RELEASE_STATUS_POLL_MS = 30_000;

declare const __PIXELFORGE_BUILD_COMMIT__: string | undefined;
/** Commit this bundle was built from (empty in unbuilt/dev sessions). */
const BUILD_COMMIT =
  typeof __PIXELFORGE_BUILD_COMMIT__ === 'string' ? __PIXELFORGE_BUILD_COMMIT__ : undefined;

type Snapshot = {
  health: ReleaseHealth | 'checking';
  release: ReleaseInfo | null;
  ready: ReadyInfo | null;
  /** Commit of a newer deploy than the build running in this tab. */
  updateCommit: string | null;
};

const initialSnapshot: Snapshot = { health: 'checking', release: null, ready: null, updateCommit: null };

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${path}?status=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export type ReleaseStatusProps = {
  pollIntervalMs?: number;
  /** Reload into the new build; the editor saves its local draft first. */
  onReload?: () => void;
};

/** Compact, accessible release identity and server health indicator for the editor chrome. */
export default function ReleaseStatus({
  pollIntervalMs = RELEASE_STATUS_POLL_MS,
  onReload = () => window.location.reload(),
}: ReleaseStatusProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  // The build running in this tab: the baked commit, else the first release seen.
  const loadedCommit = useRef<string | undefined>(BUILD_COMMIT || undefined);
  const [dismissedCommit, setDismissedCommit] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;

    const check = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 5_000);
      try {
        const [releasePayload, readyPayload] = await Promise.all([
          fetchJson('/release.json', requestController.signal),
          fetchJson('/api/readyz.json', requestController.signal),
        ]);
        if (!alive || controller !== requestController) return;
        const release = parseReleasePayload(releasePayload);
        const ready = parseReadyPayload(readyPayload);
        if (release && !loadedCommit.current) loadedCommit.current = release.commit;
        setSnapshot({
          health: releaseHealth(release, ready),
          release,
          ready,
          updateCommit: releaseUpdateAvailable(loadedCommit.current, release) ? release!.commit : null,
        });
      } catch {
        if (alive && controller === requestController)
          // Keep a known update visible while the server is briefly unreachable.
          setSnapshot((previous) => ({ health: 'offline', release: null, ready: null, updateCommit: previous.updateCommit }));
      } finally {
        window.clearTimeout(timeout);
        if (controller === requestController) controller = undefined;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), pollIntervalMs);
    // A tab coming back to the foreground checks at once for a newer deploy.
    const visible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [pollIntervalMs]);

  const version = releaseLabel(snapshot.release);
  const state =
    snapshot.health === 'checking' ? 'Checking server…' : healthLabel(snapshot.health);
  const label = `${version}. ${state}`;

  const update = snapshot.updateCommit && snapshot.updateCommit !== dismissedCommit
    ? { commit: snapshot.updateCommit, version: snapshot.release?.version }
    : null;

  return (
    <>
    <output
      className={`release-status release-status--${snapshot.health}`}
      data-testid="release-status"
      aria-live="polite"
      aria-label={label}
      title={snapshot.release ? `${label} · ${snapshot.release.commit}` : label}
    >
      <span aria-hidden="true" className="release-status-dot" />
      <span className="release-status-version">{version}</span>
      <span aria-hidden="true">·</span>
      <span className="release-status-state">{state}</span>
    </output>
    {update && (
      // Non-blocking: editing continues; Reload saves the local draft first.
      <output className="update-notice" data-testid="update-notice">
        <span>New version available{update.version ? ` (v${update.version})` : ''}</span>
        <button type="button" onClick={onReload}>Reload</button>
        <button
          type="button"
          aria-label="Dismiss new version notice"
          onClick={() => setDismissedCommit(update.commit)}
        >
          Later
        </button>
      </output>
    )}
    </>
  );
}
