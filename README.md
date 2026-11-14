# PixelForge Photo Editor

A free, local-first photo editor that runs entirely in the browser. Images are decoded, edited, rendered and exported on the user's device; nothing is uploaded unless the user explicitly saves to the optional cloud library.

- **Production:** <https://photoeditor.cheaply.fr> (editor at `/editor`, Help Center at [`/help`](https://photoeditor.cheaply.fr/help))
- **Deployed revision:** [`/release.json`](https://photoeditor.cheaply.fr/release.json) and `/health`
- **Docs:** [documentation index](docs/README.md) · [changelog](CHANGELOG.md) · [contributing](CONTRIBUTING.md)

## Features

| Area | Highlights |
| --- | --- |
| Documents and layers | Raster, text, shape, path, adjustment and smart-object layers; groups, blend modes, clipping, raster and vector masks, layer styles, artboards. See [layer document format](docs/layer-document-format.md). |
| Selections | Marquee, lasso and magnetic lasso, magic wand, quick/object/subject selection, colour range, Select and Mask, feather and refine. |
| Painting and retouch | Brush engine with dynamics, presets and textures; erasers; clone, healing, patch and content-aware tools; dodge/burn/sponge; local (on-device) generative-style tools. |
| Type and vector | Editable text with a self-hosted font library, OpenType features, warp and text on path; Pen, path editing and shape tools. |
| Adjustments and filters | Levels, Curves, Hue/Saturation and other adjustments (destructive or as layers); a large Filter menu including blur galleries, distortions, render, noise, sharpen and stylize, with smart filters. |
| Files | Import PNG/JPEG/WebP/GIF/AVIF/BMP plus bounded SVG, PSD/PSB, TIFF, PDF and (where the browser can decode it) HEIC composites; export PNG, JPEG, WebP, flattened PSD, PDF and SVG; portable `.pixelforge` project files. See [data formats](docs/data-formats.md). |
| Workflow | Autosaved local drafts with undo history, keyboard shortcuts ([mapping](docs/keyboard-shortcuts.md)), command search, actions, batch export, installable offline shell. |

PixelForge offers bounded local approximations of familiar professional workflows; it does not claim Photoshop parity, and interchange formats such as PSD export are flattened. Each feature's exact behaviour and limits are in its [contract document](docs/README.md#complete-index).

## Quick start

Use Node.js 22 (minimum 22.13; see the [developer guide](docs/developer-guide.md#1-setup) for the type-stripping note that affects `npm test` on older 22.x releases).

```sh
npm ci
npm run dev        # http://127.0.0.1:5173
```

The landing page is `src/HomePage.tsx`; the editor is `app/page.tsx`, routed by `src/main.tsx`. Vite builds static assets for Firebase Hosting; no application server is required. Start with [architecture](docs/architecture.md) for the system overview.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e    # serves the existing dist/, so build first
```

Pure Node tests cover the editing modules; Playwright runs desktop and mobile projects against the built app (six shards in CI). See [testing](docs/testing.md).

## Deployment

Pull requests run checks. A tested `main` build is deployed automatically through GitHub Actions using short-lived Google credentials; the same build artifact is promoted and the deploy job does not rebuild it. See the [operations runbook](docs/operations.md) (release, verification, rollback) and [deployment infrastructure](docs/deployment.md).

## Local data, history and cloud

- Draft pixels, settings and undo history autosave in IndexedDB. Document bookmarks restore work in the same browser; clearing browser data can remove local work. The home page lets users continue their last draft, and Discard draft removes the current local document and returns home.
- File > Download project file saves pixels, settings and the persisted history window in a portable `.pixelforge` file; Open project restores it as a separate draft.
- Image imports preserve their resolution up to 16 megapixels; larger images are rejected explicitly.
- In-memory undo/redo history is bounded to 240 states and a device-aware 320 MB (desktop) / 128 MB (phones, ≤ 4 GB devices) / 96 MB (≤ 2 GB devices) of encoded images, trimmed oldest-first.
- Local drafts and project files persist the history window around the current state that fits 24 states, 64 MB of referenced images and 4,096 assets (incremental drafts write only new images); older states stay in memory only, and the History panel says so.
- After an online visit, the installable PWA shell can reopen the editor offline. The service worker caches same-origin app assets only; see [offline and installable shell](docs/offline-pwa.md).
- Optional sign-in reuses the existing Cheaply Marketplace session. The private project library supports explicit cloud save/update, reopen and removal; anonymous images never upload automatically. Cloud storage is limited to 30 projects, 16 MB per project and 256 MB per account (enforced by the Marketplace service). New edits autosave locally; use Update cloud project to sync them across devices.

What leaves the device, and when, is listed in [security and privacy](docs/security-and-privacy.md).
