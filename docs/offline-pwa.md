# Offline and installable shell

PixelForge now ships an installable progressive web app shell. The manifest is
served from `/manifest.webmanifest` and uses the PixelForge mark at 192 and 512
pixels. Production builds register `/sw.js` after the first page load; local
development does not register the worker, so Vite hot reload remains isolated
from the production cache.

The worker (`public/sw.js`) uses two caches and handles only same-origin
`GET` requests:

| Cache | Contents | Lifetime |
| --- | --- | --- |
| `pixelforge-shell-v3` (`CACHE_NAME`) | Precached shell (`/`, `/index.html`, manifest, favicon, logo, icons), the last editor HTML, hashed Vite assets and Help Center pages | Replaced when `CACHE_NAME` is bumped; older `pixelforge-shell-*` caches are deleted on activation |
| `pixelforge-fonts-v1` (`FONT_CACHE_NAME`) | Library fonts and glyph metadata under `/fonts/` (URLs carry `?v=<asset version>`), cached on first use | Survives shell bumps, so a font used once keeps working offline (see [`font-library-contract.md`](./font-library-contract.md)) |

Request rules, in order:

1. **Health and release probes bypass the worker:** `/release.json`,
   `/api/readyz.json`, `/api/readyz` and `/health` always go to the network
   (including cache-busting queries) and are never cached.
2. **Fonts** (`/fonts/…`): cache first in `pixelforge-fonts-v1`, filled on the
   first successful response.
3. **Help Center navigations** (`/help…`): network first; a successful response
   is cached under its own URL. Offline, the cached copy of that page is
   returned, else the cached `/help` index. Help pages are never stored as the
   editor shell.
4. **Other HTML navigations:** network first, refreshing the cached
   `/index.html` on success. Offline, the last shell is returned so `/editor`
   and bookmarked drafts can open.
5. **Other assets:** cache first; the first successful response is stored.
   Hashed Vite assets are immutable, so reuse is safe.

Marketplace requests and other cross-origin traffic are not intercepted, so
cloud session/project calls never become an implicit offline data cache.

**Updates.** The worker calls `skipWaiting()` on install and
`clients.claim()` after activation, so a new deploy's worker takes control of
open tabs without waiting for them to close. Because navigations are network
first, the next page load picks up the new HTML and its hashed assets.

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

Release metadata and readiness probes (`/release.json`, `/api/readyz.json`, `/api/readyz` and `/health`) bypass the service-worker cache, including cache-busting queries. They therefore reflect current network reachability and never accumulate poll responses in the offline shell cache. The top bar retains the baked app version and shows **Offline · local editing** when health probes cannot reach the server.
