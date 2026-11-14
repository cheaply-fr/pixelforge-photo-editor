# Testing

PixelForge has two automated suites and a set of opt-in performance
harnesses. Every implemented feature needs **substantial pure tests and
desktop + mobile browser tests** (project rule in `CLAUDE.md`). Setup and the
npm scripts are in [`developer-guide.md`](developer-guide.md); release
verification of a deployed build is in [`operations.md`](operations.md).

| Suite | Runner | Location | Command | Approx. size |
| --- | --- | --- | --- | --- |
| Pure (unit / domain) | Node `node:test` | `tests/*.test.mjs` | `npm test` | ~280 files |
| Browser acceptance | Playwright 1.63, Chromium | `tests/browser/*.spec.ts` | `npm run test:e2e` | ~230 specs × 2 projects |
| Performance benchmarks | Playwright / Node scripts | `tests/browser/*-benchmark.spec.ts`, `scripts/measure-*.mjs` | opt-in, see below | local only |

Keep three kinds of evidence distinct in reports: **local** runs, **CI** runs
on the PR/commit, and **live** verification of the deployed revision.

---

## 1. Strategy

**Pure tests carry the detail.** Logic lives in DOM-free modules under `src/`
(see the pure-module + thin-UI pattern in
[`developer-guide.md`](developer-guide.md#pure-module--thin-ui)). Test them in
Node for exact pixel and alpha values, geometry, boundaries and clamping,
malformed and hostile input, determinism (seeds), serialisation round trips,
version migration and explicit size/time bounds. They are fast and give
precise failures.

**Browser specs prove the product works.** Each spec drives the real built app
through accessible roles and labels, the way a user does, on a desktop and a
phone profile. Cover: the menu/tool entry point, the visible controls,
representative rendered pixels, undo/redo and cancel/Escape, locked-layer and
no-selection guards, reload (draft recovery), the `.pixelforge` project round
trip, and keyboard **and** touch where relevant.

Avoid tests that mirror implementation structure. A few pure tests read
`app/page.tsx` or a `.tsx` component as **source text** to assert wiring
invariants (for example `tests/sidebar-sections.test.mjs`); prefer behaviour
tests when possible.

---

## 2. Pure tests (`npm test`)

- Command: `node --test tests/*.test.mjs`. Node expands the glob itself, so it
  works in any shell. Files run in parallel child processes.
- Tests are ESM (`.mjs`) and import TypeScript modules directly:
  `import { … } from '../src/actions.ts'`. This uses Node's built-in **type
  stripping** (default from Node 22.18; on 22.13–22.17 set
  `NODE_OPTIONS=--experimental-strip-types`). Consequences:
  - modules under test, and everything they import at runtime, must use
    explicit `.ts` import specifiers and erasable syntax only (no `enum`,
    `namespace`, parameter properties or JSX);
  - `.tsx` components cannot be imported; tests that need them read the
    source with `fs.readFile`. React rendering of plain components is possible
    with `react-dom/server` (see `tests/tool-icons.test.mjs`).
- Assertions use `node:assert/strict`. Fixtures (PNG, TIFF, PSD, PDF bytes,
  projects) are built **in the test** from small synthetic data; there is no
  binary fixture directory.
- CI wraps the run in a 10-minute timeout.

Run subsets:

```sh
node --test tests/filter-effects.test.mjs                       # one file
node --test tests/tool-*.test.mjs                               # a glob
node --test --test-name-pattern="zigzag" tests/filter-effects.test.mjs   # by test name
node --test --test-concurrency=1 tests/*.test.mjs               # serial, for timing-sensitive debugging
```

Some files assert timing bounds on large synthetic images (for example a
3000 × 4000 stroke in `tests/stroke-selection.test.mjs`); run them on an idle
machine before concluding they are flaky.

---

## 3. Browser tests (`npm run test:e2e`)

### Configuration (`playwright.config.ts`, `playwright.settings.mjs`)

| Setting | Value |
| --- | --- |
| `testDir` | `./tests/browser` (every `*.spec.ts`) |
| Projects | `desktop`: `devices['Desktop Chrome']`; `mobile`: `devices['Pixel 7']` (touch, mobile viewport). Every spec runs in **both** unless it skips itself. |
| `baseURL` | `http://127.0.0.1:<PLAYWRIGHT_PORT>` (default **4173**) |
| `webServer` | `npm run preview -- --port <port> --strictPort`, i.e. Vite preview of the **existing `dist/`**. It does not build. |
| `reuseExistingServer` | Never in CI; locally only when `PLAYWRIGHT_REUSE_SERVER=1` |
| `retries` | `2` when `CI` is set, else `0` |
| `workers` | CI: `PLAYWRIGHT_WORKERS` (default `2`). Locally: Playwright's default (half the CPU cores). |
| Timeouts | Playwright defaults (30 s per test, 5 s per `expect`); slow specs raise them with `test.setTimeout(…)` or `test.describe.configure({ timeout })`, commonly 120–300 s. |
| `trace` | `retain-on-failure` |
| `reducedMotion` | `'reduce'` for every context (deterministic geometry after clicks; `sidebar-autoscroll.spec.ts` opts back in) |
| Reporters | `list` + HTML (never auto-opened) |
| Output | `test-results/` and `playwright-report/`, or `PLAYWRIGHT_OUTPUT_DIR` and `<dir>-report` |

`playwright.settings.mjs` is unit-tested by `tests/playwright-settings.test.mjs`,
and `tests/browser/e2e-server-isolation.spec.ts` checks the run talks to its
own server.

### Environment variables

| Variable | Effect |
| --- | --- |
| `PLAYWRIGHT_PORT` | Preview port (1–65535, default 4173). Give each worktree its own port. |
| `PLAYWRIGHT_REUSE_SERVER=1` | Reuse a server already on that port (local only). Off by default so you never test another worktree's build. |
| `PLAYWRIGHT_OUTPUT_DIR` | Artifacts directory; the report goes to `<dir>-report`. Use `test-results-<name>` (git-ignored) for concurrent runs in one worktree. |
| `PLAYWRIGHT_WORKERS` | Worker count, read only when `CI` is set. |
| `CI` | Enables retries and `PLAYWRIGHT_WORKERS`, disables server reuse. |
| `PIXELFORGE_BENCH=1` | Enables the opt-in benchmark specs (desktop only). |

### Running

**Always rebuild first** (`npm run build`): the suite serves `dist/`, so a
stale build silently tests old code. `/release.json`, the service worker and
`/help` only exist in a build.

```sh
npm run build
npm run test:e2e                                          # everything, both projects
npx playwright test tests/browser/filter-effects.spec.ts  # one file
npx playwright test filter-effects                        # files matching a substring
npx playwright test -g "ZigZag"                           # tests whose title matches
npx playwright test --project=desktop                     # one project
npx playwright test --project=mobile tests/browser/command-search.spec.ts:42   # one test by line
npx playwright test --shard=3/6                           # one CI shard
npx playwright test --last-failed                         # re-run failures
npx playwright test --repeat-each=5 -g "ZigZag" --workers=1   # flakiness check
PLAYWRIGHT_PORT=4180 npm run test:e2e                     # side-by-side worktree
```

Arguments after `npm run test:e2e --` are passed to Playwright
(`npm run test:e2e -- --project=mobile`).

### Debugging failures

```sh
npx playwright show-report                               # playwright-report/
npx playwright show-trace test-results/<test-dir>/trace.zip
npx playwright test <file> --project=desktop --debug     # inspector, step through
npx playwright test <file> --headed --workers=1
npx playwright test --ui                                 # watch mode UI
```

### Helpers in `tests/browser/`

Shared helpers are plain `.ts` modules next to the specs (not fixtures
registered with `test.extend`).

| File | Exports | Use |
| --- | --- | --- |
| `editor-document.ts` | `openEditor`, `newDocument(w, h)`, `addPaintLayer`, `canvas`, `footer`, `settled(page, timeout = 60 s)`, `setColor`, `setInputColor`, `pixels(points)`, `snapshot`, `menu(name, item)`, `undo`, `gesture(points, id, kind)`, `marquee`, `lassoPath`, `projectFrame`, `outlinePath`, `WHITE` | General specs that paint on a fresh document and read rendered pixels. `gesture()` dispatches pointer events in document coordinates without yielding, identical on desktop and touch. |
| `tool-selection.ts` | `selectTool(page, label)` | Selects any tool through the compact palette, opening the family flyout (via right-click, deterministic on both projects) for hidden subtools; maps legacy labels (`Select` → `Rectangular Marquee`). Its `TOOL_FAMILIES` table must list every tool. |
| `sidebar-panels.ts` | `openPropertiesSheet`, `openPanel(label)`, `closePanels`, `SidebarPanelLabel` | Opens "More panels" panels by accessible name and expands the phone properties sheet. |
| `project-file.ts` | `downloadedProject(path)`, `placedAsset(page, project, layer)` | Reads a downloaded `.pixelforge` bundle with the app's own `readPortableBundle`; draws a paint layer's stored asset at its offset for canvas-space sampling. |
| `audit-retouch-helpers.ts` | `openEditor`, `project`, `saved`, `drag`, `click`, `altClick`, `selectRect`, `brushTool`, `transparentPaintLayer`, `blueLayerWithRedBand`, `RED`, `BLUE`, … | Retouch-tool specs (`audit-retouch-*.spec.ts`) on the default 1200 × 800 document. |
| `large-painting-fixture.ts` | `nightSkyPainting(count)`, `seedPainting(page, w, h, layers)`, `marks`, `compositeChecksum`, `layerStoreEntries`, `dropDraftPreview`, `PAINTING_FILTERS` | Writes a large tiled draft straight into IndexedDB `pixelforge-documents` so reopen tests and benchmarks skip minutes of UI setup; reads performance marks and composite checksums. |

### Standard spec skeleton

```ts
import { test, expect } from '@playwright/test';
import { menu, newDocument, openEditor, pixels, settled, undo } from './editor-document';

test.beforeEach(async ({ page }) => {
  // openEditor stubs the Marketplace account API with { authenticated: false }
  // and opens /editor?new=1 (a fresh, isolated draft).
  await openEditor(page);
});

test('ZigZag displaces pixels and undoes in one step', async ({ page }) => {
  await newDocument(page, 64, 64);
  const before = await pixels(page, [[10, 10]]);
  await menu(page, 'Filter', 'ZigZag…');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('zigzag');
  await settled(page);
  // …assert changed pixels, then:
  await undo(page);
  expect(await pixels(page, [[10, 10]])).toEqual(before);
});
```

Readiness signals used throughout the suite:

- `getByRole('application')` has `aria-busy="false"`: the editor mounted.
- `getByTestId('editor-canvas')` has `data-rendering="false"`: the composite
  is settled (`settled()`); read pixels only after this.
- `getByRole('status', { name: 'Draft save status' })` reads
  `Saved on this device`: the local draft is written (needed before reload).

### Fixtures and test data

- **No binary fixture directory.** Images are generated in the test: PNG
  bytes built with `zlib` and a CRC table, tiny PSD/TIFF/PDF buffers, or
  canvases painted in the page. Files are given to the app with
  `page.getByTestId('file-input').setInputFiles({ name, mimeType, buffer })`
  (`project-input` for `.pixelforge` files).
- **Projects** are read back by downloading `File > Download project file` and
  parsing it with `downloadedProject()`; assert on the history frame
  (`projectFrame()`), not on internal React state.
- **Never** use personal photos or real account data. The Marketplace account
  endpoint is always stubbed.
- Each test owns a browser context, so IndexedDB drafts and `localStorage`
  are isolated per test.

---

## 4. Writing good specs

1. **Desktop and mobile by default.** Every spec runs in both projects. Skip a
   project only for a real platform difference, with a reason:
   `test.skip(testInfo.project.name === 'mobile', 'hover-only control')`. Prefer
   one test body that works on both (use `gesture()`, `selectTool()`,
   `openPanel()`), and add a mobile-specific test when the phone layout differs
   (properties sheet, flyouts, touch).
2. **Use accessible names.** `getByRole`/`getByLabel` with `exact: true`.
   Accessible names are part of the product contract; renaming one is a
   breaking change for the suite. `getByTestId` is for elements without a
   meaningful accessible name: the canvas (`editor-canvas`), hidden file inputs
   (`file-input`, `project-input`, `batch-image-input`), the `tool-palette`
   container and a few diagnostic readouts.
3. **Assert outcomes, not timings.** Wait with web-first assertions
   (`toHaveAttribute`, `toHaveValue`, `expect.poll`) and the readiness signals
   above, never fixed sleeps.
4. **Check pixels and persistence.** Sample rendered pixels, verify the
   immutable source asset is unchanged for nondestructive features, reload and
   re-check, and download/reopen the project.
5. **Cover the edges in the browser that only the browser can show:**
   disabled states, locked layers, empty selection, cancel/Escape, keyboard
   operation, focus return after dialogs.
6. **Budget time explicitly.** If a test legitimately needs more than 30 s,
   call `test.setTimeout()` with a bound you can justify; a slow test lengthens
   its CI shard (15-minute limit).
7. **No `test.only`.** The config does not set `forbidOnly`, so a committed
   `.only` would silently drop the rest of a file in CI.
8. **Name specs after the feature** (`tests/browser/<feature>.spec.ts`) and
   list them in the feature's contract doc.

---

## 5. Performance measurement

None of these run in CI. Numbers are local evidence for one machine, not a
guarantee; record the machine, build and date with any figure you publish
(see [`performance-budgets.md`](performance-budgets.md)).

### Instrumented specs (run in CI)

`tests/browser/performance-marks.spec.ts` checks that `render`, `paint`,
`save` and `export` publish `pixelforge.*` marks; `performance.spec.ts`,
`huge-projects.spec.ts`, `large-radius-filters.spec.ts`,
`large-brush-size.spec.ts`, `feathered-selection-performance.spec.ts` and
`layer-pixel-budget.spec.ts` assert generous bounds and limits.

### Opt-in benchmark specs

Skipped unless `PIXELFORGE_BENCH=1`, and desktop project only. Sizes default
to a 2646 × 4096 poster; override with `BENCH_W`, `BENCH_H`, `BENCH_LAYERS`.

| Spec | Measures | Example |
| --- | --- | --- |
| `large-draft-benchmark.spec.ts` | Reopening a large saved draft: first visible composite, "Render ready", first stroke; and the 89-layer night-sky painting reopened three ways (cold, saved preview, on-device layers). `BENCH_FILTERS` picks filters (default `Clouds,Lens Flare…`). | `PIXELFORGE_BENCH=1 BENCH_LAYERS=16 npx playwright test large-draft-benchmark --project=desktop` |
| `add-layer-benchmark.spec.ts` | "Add paint layer" mid-stack after painting a lower layer, plus composite-cache reuse. `BENCH_NOISE=1` uses noisy content. | `PIXELFORGE_BENCH=1 BENCH_LAYERS=40 npx playwright test add-layer-benchmark --project=desktop` |
| `paint-low-layer-benchmark.spec.ts` | Brush strokes on a low and on the top layer, plus composite-cache reuse. | `PIXELFORGE_BENCH=1 BENCH_LAYERS=40 npx playwright test paint-low-layer-benchmark --project=desktop` |

### `scripts/measure-*.mjs`

Standalone Node scripts that launch Playwright's Chromium against a running
build and print a JSON result. Start a production-like server first
(`npm run build && npm run preview`), then pass its URL.

| Script | Usage | Measures |
| --- | --- | --- |
| `measure-huge-project.mjs` | `node scripts/measure-huge-project.mjs http://127.0.0.1:4173 <project.pixelforge>` | Imports your project file and times import + first render, first draft save, hide/show re-render, stroke → rendered, stroke draft save, reload restore and portable export (with exported size). Reports JS heap (CDP) at each stage and, **on Windows only**, the browser process-tree working set. |
| `measure-stroke-commit.mjs` | `node scripts/measure-stroke-commit.mjs http://127.0.0.1:4173` | On a generated 2646 × 4096 noisy photo layer (worst case for PNG encoding) plus a sparse paint layer: pointer-up → committed, rendered stroke; keyboard undo/redo through every stroke; `pixelforge.tile-commit` / `decoded-tile-cache` counters and recent paint measures. `STROKES` (default 8) sets the number of photo strokes. |
| `measure-structural-edits.mjs` | `node scripts/measure-structural-edits.mjs http://127.0.0.1:4173 [width] [height] [layers]` | Builds a synthetic portable project (default 2646 × 4096, 40 layers, Clouds/Motion Blur, masks, styles, clipping, folders, Overlay/Soft Light) and times opacity change, hide, show, Send Backward, undo and Delete until the canvas settles, with `pixelforge.render` measures and layer-filter / composite cache marks. Imports `src/*.ts`, so it needs a Node with type stripping. |

Never commit a personal project file used with `measure-huge-project.mjs`.

---

## 6. CI behaviour

Workflow: `.github/workflows/ci-cd.yml` ("CI and deploy"). Triggers: every
`pull_request`, `push` to `main`, and manual `workflow_dispatch`. A newer run
for the same ref cancels the older one (`concurrency: pixelforge-<ref>`).

### `validate` job: 6 shards

Matrix `shard: [1..6]`, `fail-fast: false`, `ubuntu-latest`, 25-minute job
timeout. Each shard runs, in order:

1. `npm ci` (Node 22, npm cache).
2. Validates the optional `PIXELFORGE_GA_MEASUREMENT_ID` repository variable
   (`G-…` format).
3. `npm run lint`, `npm run typecheck`.
4. `npm run build` (with `VITE_CHEAPLY_GA_MEASUREMENT_ID`).
5. `npm test` under `timeout 10m`.
6. Restores `~/.cache/ms-playwright` (keyed on `package-lock.json`) and runs
   `npx playwright install chromium` (no `--with-deps`).
7. `npm run test:e2e -- --shard=<n>/6` with `PLAYWRIGHT_WORKERS=2` under
   `timeout 15m`; `CI` is set, so failed tests retry up to **2** times.
8. Uploads `dist/` as `site-<sha>-<n>` (14 days).
9. On failure, uploads `playwright-report/` and `test-results/` as
   `browser-test-results-<n>` (7 days). Download it from the run page and open
   it with `npx playwright show-report <dir>` or `show-trace`.

Lint, typecheck, build and pure tests therefore run once per shard; only the
Playwright suite is divided. A test that passes only on retry is reported as
**flaky** in the list output; treat it as a bug to fix, not as green.

### `deploy` job

Runs only for `main` (not pull requests) after all six shards pass. It
publishes the tested `dist/` artifact to Firebase Hosting and runs
`npm run verify:deployment` against both production URLs. Details, release
versions and rollback: [`operations.md`](operations.md).

### Before merging

- Local: `lint`, `typecheck`, `build`, `npm test` and the relevant specs on
  **both** projects pass.
- CI: all six `Validate editor (n/6)` checks are green on the PR head commit.
- Report test counts and the commit SHA; say which evidence is local, which is
  CI and which (after deploy) is live.
