# Offline and installable shell

PixelForge now ships an installable progressive web app shell. The manifest is
served from `/manifest.webmanifest` and uses the PixelForge mark at 192 and 512
pixels. Production builds register `/sw.js` as soon as the shell renders; local
development does not register the worker, so Vite hot reload remains isolated
from the production cache.

The worker follows two rules:

- HTML navigations use the network first and refresh the cached `/index.html`
  when the request succeeds. If the network is unavailable, the last shell is
  returned so `/editor` and bookmarked drafts can open.
- Same-origin GET assets use a versioned runtime cache. Hashed Vite assets are
  safe to reuse after the first successful online load. Marketplace requests
  and other cross-origin traffic are excluded, so cloud session/project calls
  never become an implicit offline data cache.

This milestone requires one successful online visit before the shell and app
assets are available offline. Draft pixels, settings and undo history continue
to use the versioned IndexedDB manifest/blob bundle described in [`draft-storage-contract.md`](./draft-storage-contract.md); a cached shell does not make cloud save or
project-library operations available without a connection. Bump `CACHE_NAME`
in `public/sw.js` when the cache contract changes. The browser removes older
`pixelforge-shell-*` caches during activation.

The static contract is covered by `tests/pwa.test.mjs`. Verify the generated
artifact with `npm run build && npm test`, then use a browser's Application
panel to confirm the service worker controls the page and that a previously
loaded `/editor` route opens with the network disabled.

The desktop/mobile acceptance contract in
`tests/browser/offline-pwa.spec.ts` performs that runtime check: it waits for
an activated, controlling worker, saves a named local draft, disables the
network, reloads the bookmarked draft, and verifies that the editor and draft
status recover. Cloud requests intentionally remain online-only and are not
treated as successful offline operations.

Release metadata and readiness probes (`/release.json` and `/api/readyz.json`) bypass the service-worker cache, including cache-busting queries. They therefore reflect current network reachability and never accumulate poll responses in the offline shell cache. The top bar retains the baked app version and shows **Offline · local editing** when health probes cannot reach the server.
