# Developer guide

How to set up, build, change and debug PixelForge. For the system design read
[`architecture.md`](architecture.md); for file and storage formats,
[`data-formats.md`](data-formats.md); for the test suites,
[`testing.md`](testing.md); for release and production,
[`operations.md`](operations.md). The docs index is [`README.md`](README.md)
and the contribution rules are in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

Everything here is derived from the repository's own configuration
(`package.json`, `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`,
`vite.config.ts`, `playwright.config.ts`, `.github/workflows/ci-cd.yml`). When
this page and the code disagree, the code wins; please fix the page.

---

## 1. Setup

### Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | `>=22.13.0` (`engines` in `package.json`) | CI uses the latest Node 22 (`node-version: '22'`). The pure tests import `src/*.ts` directly and rely on Node's built-in type stripping, which is on by default from **Node 22.18** (and in 23.6+/24). On 22.13–22.17 run tests with `NODE_OPTIONS=--experimental-strip-types`, or just use a current 22.x/24.x. |
| npm | the one bundled with Node | `package-lock.json` is authoritative; use `npm ci`. |
| Chromium for Playwright | pinned by `@playwright/test` (1.63.0) | Both Playwright projects (`desktop`, `mobile`) run Chromium. |

There is no `.nvmrc`; pick any Node that satisfies the notes above.

### First run

```sh
npm ci                            # exact dependency tree from package-lock.json
npx playwright install chromium   # browser for the e2e suite (CI does the same, without --with-deps)
npm run dev                       # http://127.0.0.1:5173/ (editor at /editor)
```

`npm run dev` and `npm run build` first run `scripts/copy-fonts.mjs`, which
copies the self-hosted font library from the pinned `@fontsource*` packages
into `public/fonts/` (generated, git-ignored). If the committed registry
`src/fontLibrary.generated.ts` no longer matches the packages, the script fails
and asks you to run `npm run fonts:sync`.

No environment variables are needed to develop or test. The only build-time
variable the app reads is `VITE_CHEAPLY_GA_MEASUREMENT_ID` (optional analytics,
see [`analytics.md`](analytics.md)); release identity variables are described
in [`operations.md`](operations.md). Never put credentials in the repository
(see [`security-and-privacy.md`](security-and-privacy.md)).

### Full local verification

The same gates CI runs (see [`testing.md`](testing.md#6-ci-behaviour)):

```sh
npm run lint
npm run typecheck
npm run build      # required before test:e2e: the e2e server serves dist/
npm test
npm run test:e2e
```

---

## 2. npm scripts

| Script | Command | What it does / when to use it |
| --- | --- | --- |
| `dev` | `node scripts/copy-fonts.mjs && vite --host 127.0.0.1` | Vite dev server with HMR on `http://127.0.0.1:5173` (Vite's default port; pass `-- --port N` to change). File watching uses polling (`server.watch.usePolling` in `vite.config.ts`). No service worker, no `/release.json`, no Help Center. |
| `build` | `copy-fonts` → `vite build` → `scripts/write-release.mjs` → `scripts/build-help.mjs` | Production bundle in `dist/` (no source maps), then writes `dist/release.json` and `dist/api/readyz.json`, then builds the Help Center into `dist/help/`. Fails on an invalid help article. |
| `help:build` | `node scripts/build-help.mjs` | Rebuild only the Help Center into `dist/help/`. Authoring rules: [`knowledge-base.md`](knowledge-base.md). |
| `help:shots` | `playwright test -c help/playwright.shots.config.ts` | Recapture Help Center screenshots into `help/img/`. Runs against production unless `HELP_SHOTS_BASE_URL` is set. See [`knowledge-base.md`](knowledge-base.md#screenshots). |
| `preview` | `vite preview --host 127.0.0.1` | Serve the built `dist/` on `http://127.0.0.1:4173`. Production-like: registers the service worker. Used by the e2e `webServer`. |
| `lint` | `oxlint app/page.tsx src vite.config.ts playwright.config.ts playwright.settings.mjs tests scripts help` | Type-aware lint (see §4). `components/`, `hooks/` and `lib/` (generated UI kit) are not linted. |
| `typecheck` | `tsc --noEmit` | Strict TypeScript over the `include` list in `tsconfig.json`. |
| `test` | `node --test tests/*.test.mjs` | Pure Node tests (~280 files). See [`testing.md`](testing.md). |
| `test:e2e` | `playwright test` | Desktop + mobile Playwright suite in `tests/browser/` against `npm run preview`. **Build first.** |
| `verify:deployment` | `node scripts/verify-deployment.mjs` | Post-deploy check of `/release.json`, `/api/readyz.json` and the app at `DEPLOY_URL`. Used by the deploy job; see [`operations.md`](operations.md). |
| `format` | `oxfmt` | Formats **and writes** every supported file in the repository. Not enforced in CI and most existing files are not oxfmt-clean, so do not run it bare; format only the files you touch (`npx oxfmt path/to/file.ts`) or check with `npx oxfmt --check <paths>`. |
| `fonts:sync` | `node scripts/sync-font-library.mjs && node scripts/copy-fonts.mjs --force` | Regenerate `src/fontLibrary.generated.ts` from `scripts/font-catalog.mjs` and the pinned font packages, then recopy fonts. Run after changing the catalogue or a font package version. |

Other scripts in `scripts/` that are run directly:

| Script | Purpose |
| --- | --- |
| `scripts/release-version.mjs` | Build identity (`<major>.<minor>.<run>` on main, `-pr.`/`-ci.`/`-dev+sha` otherwise). Shared by `vite.config.ts`, `write-release.mjs` and `verify-deployment.mjs`. |
| `scripts/write-release.mjs` | Writes `/release.json` and `/api/readyz.json` (also served as `/health`). |
| `scripts/font-catalog.mjs`, `scripts/lib/font-*.mjs` | Font catalogue input and font table helpers for `sync-font-library.mjs`. Only OFL 1.1, Apache 2.0, Ubuntu Font Licence 1.0 and CC0 fonts are accepted. |
| `scripts/measure-*.mjs` | Local performance harnesses (not CI). See [`testing.md`](testing.md#5-performance-measurement). |

---

## 3. Project layout

```text
app/page.tsx            The editor component (~25k lines): state, menus (MENU_DEFS),
                        command dispatch (runCommand), canvas input and panel markup.
app/globals.css         Editor styles (Tailwind 4 via @tailwindcss/postcss).
src/main.tsx            Entry: renders app/page.tsx when the path is /editor or the
                        hash starts with #draft=, else src/HomePage.tsx; registers
                        /sw.js in production builds only.
src/*.ts                ~300 DOM-free (mostly React-free) domain modules: document
                        model, filters, selection, history, drafts, import/export…
src/*.tsx               React components extracted from the editor (dialogs, panels).
src/*.worker.ts         Module workers: document-render, filter-band, image-encode.
public/                 Static files copied verbatim (sw.js, manifest, icons…).
public/fonts/           Generated by scripts/copy-fonts.mjs (git-ignored).
help/                   Help Center sources (articles, categories, screenshots, shots).
scripts/                Build, release, font and measurement scripts (Node ESM).
tests/*.test.mjs        Pure Node tests (node:test).
tests/browser/          Playwright specs (*.spec.ts) and shared helpers (*.ts).
docs/                   Developer docs and per-feature *-contract.md files.
components/, hooks/,    shadcn/ui kit (components.json). Not part of the editor's
lib/                    entry graph; not linted or type-checked.
firebase.json           Hosting config: headers, caching, rewrites.
.github/workflows/      ci-cd.yml: validate (6 shards) → deploy (main only).
```

Generated or ignored output: `dist/`, `public/fonts/`, `test-results/`,
`test-results-*/`, `playwright-report/`, `*.tsbuildinfo`, `.env*`
(see `.gitignore`).

---

## 4. Coding conventions

### Language and compiler

From `tsconfig.json`:

- `strict: true`, `noEmit: true`, `isolatedModules: true`, `jsx: react-jsx`,
  `module: esnext`, `moduleResolution: bundler`, `target: ES2017`.
- `allowImportingTsExtensions: true`: relative **runtime** imports inside
  `src/*.ts` use the explicit `.ts` extension (`import { … } from
  './filterRegion.ts'`). This is what lets `node --test` load the modules
  without a bundler. Extensionless imports in `src/*.ts` are only acceptable
  for `import type` (erased). `app/page.tsx` and `.tsx` components import
  extensionless (`'../src/psd'`); Vite resolves both.
- Code loaded by Node tests must be **erasable TypeScript**: no `enum`, no
  `namespace`, no constructor parameter properties, no JSX in `.ts` files.
- Path alias `@/*` maps to the repository root (used by the UI kit).
- `typecheck` covers `app/page.tsx`, `src/**/*.tsx`, `vite.config.ts`,
  `playwright.config.ts` and `tests/**/*.ts`, plus every `.ts` module they
  import. Test `.mjs` files are not type-checked.

### Lint (`.oxlintrc.json`)

- Plugins: `eslint`, `typescript`, `unicorn`, `oxc`, `react`, `import`,
  `jsx-a11y`. The whole `correctness` category is an error.
- Type-aware (`options.typeAware` and `typeCheck`, via `oxlint-tsgolint`).
- Notable explicit errors: `no-var`, `prefer-const`, `prefer-spread`,
  `prefer-rest-params`, `no-array-constructor`, `react/rules-of-hooks`,
  `react/react-compiler`, `react/no-unescaped-entities`,
  `typescript/no-explicit-any`, `typescript/ban-ts-comment`,
  `typescript/no-deprecated`, `typescript/no-namespace`,
  `typescript/no-require-imports`. `import/no-anonymous-default-export` warns.
- `no-explicit-any` and `ban-ts-comment` mean: model `unknown` input with a
  validator (`validX(value: unknown): value is X`) instead of casting or
  suppressing.

### Formatting (`.oxfmtrc.json`)

`singleQuote: true`, `printWidth: 80`, everything else oxfmt defaults
(Prettier-compatible). CI does not check formatting; match the surrounding
code and keep diffs focused (see `format` above).

### Line endings and encoding

- There is no `.gitattributes`. The repository stores **LF** (`git ls-files
  --eol` reports `i/lf`). Windows checkouts with `core.autocrlf=true` show CRLF
  in the working tree; Git normalises back to LF on commit.
- UTF-8 everywhere. Use real typographic characters where the UI does
  (`…` in menu labels such as `ZigZag…`, `×` in dimensions); tests match
  accessible names exactly.

### File naming

| Kind | Convention | Example |
| --- | --- | --- |
| Domain module | camelCase `.ts` in `src/` | `src/filterWorkerPool.ts`, `src/lastFilter.ts` |
| React component | PascalCase `.tsx` in `src/` | `src/FilterGalleryDialog.tsx` |
| Worker entry | kebab-case `*.worker.ts` | `src/filter-band.worker.ts` |
| Pure test | kebab-case `tests/<feature>.test.mjs` | `tests/tool-icons.test.mjs` |
| Browser spec | kebab-case `tests/browser/<feature>.spec.ts` | `tests/browser/command-search.spec.ts` |
| Feature contract | kebab-case `docs/<feature>-contract.md` | `docs/zigzag-effect-contract.md` |

### Pure module + thin UI

The central pattern of the codebase:

1. **Logic lives in a pure module** in `src/`: DOM-free and React-free where
   possible, deterministic, operating on plain data (`Uint8ClampedArray`
   pixels, `Frame`/`Layer` records, settings objects). It exports
   `validX`/`normalizeX` functions for every persisted or user-supplied shape,
   explicit bounds (`MAX_*` constants) and `serializeX`/`parseX` pairs for
   anything stored.
2. **The pure module is tested exhaustively in Node** (`tests/<feature>.test.mjs`):
   pixel/alpha results, boundaries, malformed input, determinism, limits.
3. **The UI is thin**: `app/page.tsx` or a `src/*.tsx` component wires state,
   menus and controls to the module and adds no business rules of its own.
4. **The browser spec proves the wiring** on desktop and mobile through
   accessible names (roles and labels), the same way a user reaches it.

Further rules that recur in every contract:

- **Nondestructive by default.** Effects store parameters on the layer
  (`adjustments.filterEffects`, Smart Filter stacks) and re-render from the
  immutable source asset. Pixels are replaced only on an explicit
  rasterise/apply step.
- **One user action = one undo step**, with cancel/Escape restoring state.
- **Versioned local preferences.** `localStorage` entries use the
  `pixelforge.*` key prefix and a `{ version, … }` envelope with a
  `normalizeX()` that drops unknown/invalid values (see
  `src/toolFamilyChoices.ts`, `src/menuPreferences.ts`). Every access is in
  `try/catch` (private mode).
- **Honest labels.** Approximations say so in the UI and docs
  (`'ZigZag (radial local approximation)'`); never claim Photoshop parity.
- **Local-first and anonymous.** No feature may require sign-in or upload
  pixels implicitly.
- **Accessible compact toolbar.** Keep tool families, icons, flyouts and
  responsive desktop/mobile behaviour intact
  ([`toolbar-contract.md`](toolbar-contract.md)).

---

## 5. How-to checklists

Each checklist names the real registries. Most of them are typed as
exhaustive `Record`s over a union, so `npm run typecheck` tells you what you
missed; the unit tests listed catch the rest. Always finish with a contract doc
(§6), pure tests and desktop+mobile specs ([`testing.md`](testing.md)).

### 5.1 Add a tool

1. **Tool id**: add it to the `Tool` union *and* to the allow-list array in
   `validSettings()` in `src/drafts.ts` (persisted `settings.tool`; an unknown
   id makes a draft invalid).
2. **Palette taxonomy** (`src/toolPalette.ts`):
   - `PaletteToolId` union;
   - its category in `TOOL_CATEGORIES`;
   - the Photoshop repeated-key family in `TOOL_FAMILIES` (if it has one);
   - the press-and-hold flyout in `TOOL_FLYOUTS` (if it belongs to a family);
   - a **unique, canonical** Lucide export name in `TOOL_ICONS`.
3. **Icon component**: import the Lucide icon in `src/toolIcons.ts`
   (`toolIcon()` maps `TOOL_ICONS` names to components).
4. **Editor wiring** (`app/page.tsx`): add `{ id, label, icon: toolIcon(id),
   key }` to `TOOLS`; implement pointer handling and options. The palette button
   is exposed as `"<Label> tool"`.
5. **Sidebar**: map the tool in `TOOL_SECTIONS` (`src/sidebarSections.ts`;
   `null` requires a reason in `TOOLS_WITHOUT_SECTION`) and in `TOOL_SIDEBAR`
   (`src/sidebarPanels.ts`). Both are exhaustive.
6. **Presets / shortcuts** (if applicable): `PRESET_TOOL_LABELS` in
   `src/toolPresets.ts`. User key overrides go through
   `normalizeToolShortcutPreferences()` (`src/toolShortcuts.ts`) and the
   remembered flyout variant through `src/toolFamilyChoices.ts`; both validate
   against the registries, so no edit is usually needed there.
7. **Tests to update**: `tests/tool-palette.test.mjs`,
   `tests/tool-icons.test.mjs` (one icon per tool, canonical, no duplicate
   drawings), `tests/tool-shortcuts.test.mjs`,
   `tests/tool-family-choices.test.mjs`, `tests/sidebar-sections.test.mjs`,
   `tests/sidebar-panels.test.mjs`; in the browser, add the label to
   `TOOL_FAMILIES` in `tests/browser/tool-selection.ts` so `selectTool()` can
   reach it, and check `toolbar-layout.spec.ts` / `toolbar-settings.spec.ts`.
8. **Help**: a Help Center article whose front matter `tools:` list names the
   tool id (`/help/tool/<id>` and *Help for Current Tool* depend on it). See
   [`knowledge-base.md`](knowledge-base.md).
9. **Docs**: the tool's contract, [`toolbar-contract.md`](toolbar-contract.md)
   if families change, [`keyboard-shortcuts.md`](keyboard-shortcuts.md) if a
   key is added.

### 5.2 Add a filter effect

1. **Type** (`src/filterEffects.ts`): append the id to `FILTER_EFFECT_TYPES`
   (drives the *Filter effect* `<select>`, last-filter validation and
   `FILTER_SECTIONS`). Add settings types, `DEFAULT_*` values and handling in
   `effectiveFilterEffects()`, `validFilterEffects()` and
   `retypeFilterEffects()` for any new fields.
2. **Pixels**: add the branch to `applyFilterEffectsPixels()` (pure, operates on
   `Uint8ClampedArray`). Keep alpha/transparent RGB source-safe and the result
   deterministic.
3. **Workers**: `src/filter-band.worker.ts` calls the same function, so a new
   effect runs off the main thread automatically. Opt into **parallel row
   bands** only if the effect is band-safe: return its halo in
   `filterBandHalo()` (`src/filterBands.ts`); `isParallelFilterEffect()` in
   `src/filterWorkerPool.ts` keys off it, and the banded result must be
   byte-identical to the single-pass one. `PREWARM_FILTER_TYPES` lists the
   heavy kernels warmed when the pool starts; add to it only for comparable
   neighbourhood filters.
4. **Menu command**: follow §5.3 with a `filter-<id>` command whose
   `runCommand` branch calls `chooseFilterEffect('<id>', '<Label>')`; add it to
   the layer-required `case` list in `menuItemDisabled()`.
5. **Actions and batch**: add `filter-<id>` to `REPLAYABLE_ACTION_COMMANDS`
   (`src/actions.ts`) and to the command → type map in `src/batchActions.ts`.
   New settings that must be recorded go into `filterActionParameters()`
   (`src/filterActionParameters.ts`, inside the bounded `filterExtra` JSON).
6. **Controls**: per-effect controls render inside the *Filter effects*
   sidebar section in `app/page.tsx` (`filterEffects.type === '<id>' && …`).
7. **Caches**: `layerFilterCacheKey()` (`src/layerFilterCache.ts`) keys on
   `effectiveFilterEffects()`, so every new setting that changes output must
   survive normalisation there, or cached pixels go stale.
8. **Not needed**: `src/lastFilter.ts` (validates against the type list) and
   `src/FilterGalleryDialog.tsx`, which only lists the quick-filter presets
   (`FILTERS` in `app/page.tsx`: Original, Vivid, Mono, Warm, Cool), not effect
   types ([`filter-gallery-contract.md`](filter-gallery-contract.md)).
9. **Tests**: `tests/filter-effects.test.mjs` (or a dedicated
   `tests/<id>-filter.test.mjs`) for determinism, identity, edges, alpha,
   malformed input and a size bound; band equivalence if parallel;
   `tests/actions.test.mjs` / batch tests if replayable;
   `tests/browser/filter-effects.spec.ts` (or a dedicated spec) on desktop and
   mobile: menu activation, *Filter effect* value, pixels, immutable asset,
   reload, project round trip, undo.
10. **Docs**: `docs/<id>-effect-contract.md` and a Help article.

### 5.3 Add a menu command

1. **Id**: add the string to the `Command` union in `app/page.tsx`. Use the
   `<area>-<verb>` style of its neighbours (`filter-zigzag`,
   `help-current-tool`).
2. **Menu entry**: add `{ label, command, shortcut? }` to the right menu in
   `MENU_DEFS` (`Record<MenuName, MenuItem[]>`). Labels that open a dialog end
   with `…`. `shortcut` (for example `'Ctrl+O'`) is **display text** for the
   menu, command search and the Keyboard Shortcuts dialog; built-in keys are
   handled by the editor's global `keydown` handler in `app/page.tsx`, so a new
   built-in chord needs a branch there as well.
3. **Behaviour**: add the branch to `runCommand()`. Keep logic in a `src/`
   module. Never call `window.prompt` (it can be blocked and is poor on
   phones). For a few values use the in-app prompt dialog:
   `const answer = await askPrompt({ title, fields, submitLabel })` in
   `app/page.tsx` (or `usePromptDialog()` from `src/PromptDialog.tsx` in a
   component, rendering its `dialog`). Fields are `text`, `number`
   (`min`/`max`/`integer`/`suffix`, validated inline with submit disabled),
   `select` (fixed choices) or `checkbox`; `answer` is `null` on Cancel/Esc.
   Validation lives in `src/promptForm.ts`; browser specs drive it with
   `answerPrompt()` from `tests/browser/prompt-dialog.ts`. Larger option sets
   still deserve a dedicated dialog component.
4. **Enablement**: add a `case` to `menuItemDisabled()` when the command needs
   a layer, selection, unlocked layer, etc. Disabled roadmap items stay visible
   unless the user hides them (`src/menuPreferences.ts`, *Show disabled*).
5. **Derived automatically from `MENU_DEFS`**: command search
   (`commandSearchItems` → `src/CommandSearchDialog.tsx`), the keyboard
   shortcuts dialog (`src/KeyboardShortcutsDialog.tsx`) and the allowed ids for
   user shortcut overrides (`normalizeCommandShortcutPreferences()` in
   `src/commandShortcuts.ts`, stored under `pixelforge.command-shortcuts`;
   chords are letters, digits, F1–F12 or `= - , +` with modifiers).
6. **Optional registries**: `COMMAND_SECTIONS` (`src/sidebarSections.ts`) if
   the command should reveal a sidebar section; `REPLAYABLE_ACTION_COMMANDS`
   (`src/actions.ts`) if it is a deterministic, recordable step.
7. **Tests**: `tests/command-shortcuts.test.mjs` /
   `tests/menu-preferences.test.mjs` when shortcuts or visibility rules change;
   browser coverage that opens the menu by role
   (`menu(page, 'Filter', 'ZigZag…')` from `tests/browser/editor-document.ts`
   clicks the `Filter` menu button, then the exact `menuitem`)
   on both projects, and `command-search.spec.ts` / `keyboard-shortcuts.spec.ts`
   when relevant.
8. **Docs**: the feature contract; [`menu-roadmap.md`](menu-roadmap.md) and
   [`keyboard-shortcuts.md`](keyboard-shortcuts.md) when they list the item.

### 5.4 Add a layer kind

Layer kinds are the `kind` discriminant of the `Layer` union in
`src/document.ts` (`raster`, `smart-object`, `adjustment`, `text`,
`rectangle`, `ellipse`, `line`, `polygon`, `path`). Adding one touches the
persisted format, so read [`data-formats.md`](data-formats.md) and
[`layer-document-format.md`](layer-document-format.md) first.

1. **Model**: add the variant to `Layer` in `src/document.ts`; update helper
   predicates/unions (for example `RasterContentLayer`, the vector-kind
   predicate) as appropriate.
2. **Validation**: accept it in `validateFrame()` (`src/document.ts`) with
   bounded fields. Drafts (`src/drafts.ts` `validateDraft()`) and portable
   bundles (`src/portableBundle.ts`) reuse it; anything that fails validation
   makes the whole document unreadable, so keep old documents valid.
3. **Format version**: if older builds cannot read the new data, follow the
   versioning rules in [`draft-storage-contract.md`](draft-storage-contract.md)
   and [`portable-project-bundle-contract.md`](portable-project-bundle-contract.md)
   (`CURRENT_DRAFT_VERSION` in `src/drafts.ts`).
4. **Rendering**: draw it in `renderFrame()` and its per-kind drawing code in
   `src/document.ts`; the worker renderer (`src/document-render.worker.ts`,
   `src/workerRender.ts`, [`worker-render-contract.md`](worker-render-contract.md))
   and tiled rendering (`src/tiledRender.ts`) must produce the same pixels.
   Check clipping (`src/layerClipping.ts`) and the composite caches.
5. **UI**: the Layers panel icon/label (`src/LayersPanel.tsx`,
   `src/LayerThumbnail.tsx`), creation command(s) in `app/page.tsx`, and
   `sidebarSections`/`sidebarPanels` if it has properties.
6. **Interchange**: decide per exporter whether it is exported natively or
   flattened: `src/svgDocumentExport.ts`, `src/cssExport.ts`,
   `src/psdExport.ts`, `src/pdfExport.ts`. Disclose flattening.
7. **Tests**: validation (valid, malformed, bounds), render pixels, draft and
   `.pixelforge` round trips in Node; desktop+mobile spec covering creation,
   render, undo, reload and download/reopen of the project file
   (`projectFrame()` in `tests/browser/editor-document.ts`).

### 5.5 Add an import or export file format

**Import**

1. **Classification** (`src/importFormats.ts`): add an `ImportFormat` value,
   extension/MIME sets and a branch in `describeImportFormat()` with an honest
   `capability` (`supported` / `conditional` / `unsupported`), `tryDecode` and
   a user-facing `disclosure`. `importFailureMessage()` builds the error.
2. **Decoder**: a pure module returning a bounded composite, like
   `decodeTiffComposite()` (`src/tiff.ts`), `decodePsdComposite()`
   (`src/psd.ts`), `decodePdfComposite()` (`src/pdf.ts`) or
   `planSvgImport()` (`src/svgImport.ts`). Enforce the import limits (16 MP,
   16,000 px per edge; [`performance-budgets.md`](performance-budgets.md)) and
   reject malformed input with a clear error.
3. **Wiring** (`app/page.tsx`): call the decoder from the import path next to
   the existing PSD/TIFF/PDF branches, and add the extension to the relevant
   `<input type="file" accept="…">` lists (open, place, batch).
4. **Tests**: `tests/<format>-import.test.mjs` with tiny synthetic files built
   in the test (see `tests/tiff-import.test.mjs`) plus
   `tests/import-formats.test.mjs`; desktop+mobile coverage in
   `tests/browser/import-formats.spec.ts` via `setInputFiles` with an in-memory
   `buffer`.
5. **Docs**: `docs/<format>-import-contract.md` (see
   [`tiff-import-contract.md`](tiff-import-contract.md)).

**Export**

1. Add the id to `EXPORT_FORMATS` and `exportLabels` in `src/export.ts`; the
   Export dialog (`src/ExportDialog.tsx`) and batch export read them.
2. Implement the encoder as a pure module (`src/psdExport.ts`,
   `src/pdfExport.ts`, `src/svgExport.ts`) or extend `encodeImage()` for a
   browser-native type; heavy encoding can use the image-encode worker
   (`src/image-encode.worker.ts`, `src/workerEncode.ts`). Respect
   `MAX_EXPORT_TARGET_BYTES` / `MAX_BATCH_EXPORT_BYTES` and metadata privacy
   ([`metadata-privacy-contract.md`](metadata-privacy-contract.md)).
3. Tests: `tests/<format>-export.test.mjs` (parse the output back) and
   `tests/browser/export-downloads.spec.ts` (download on desktop and mobile).
4. Docs: [`export-contract.md`](export-contract.md) and a format contract.

---

## 6. Contract docs

Every user-visible feature has a `docs/<feature>-contract.md` (there are more
than 150). A contract is the agreed, testable behaviour of the feature; a PR
that changes behaviour updates its contract in the same change.

Common structure (short features use paragraphs instead of headings, see
[`zigzag-effect-contract.md`](zigzag-effect-contract.md); larger ones use
sections, see [`light-rays-filter-contract.md`](light-rays-filter-contract.md),
[`stroke-selection-contract.md`](stroke-selection-contract.md)):

```markdown
# <Feature> contract

One paragraph: the menu path or tool, what it does, that it is a bounded local
approximation (no Photoshop parity), and what is stored
(for example `filterEffects.type = <id>` plus a settings record) and what stays
immutable (the source asset).

## Parameters / Options
Each control: range, default, units, clamping, what is persisted and where.

## Pixel rules / Geometry
Exact rules for alpha, transparent pixels, edges, selection/region limits,
determinism (seeds), undo granularity.

## Performance
Bounds and measured local timings on a stated document size, worker or band
behaviour. Local evidence only, not a guarantee.

## Tests (or Acceptance)
`tests/<feature>.test.mjs`: what the pure tests cover.
`tests/browser/<feature>.spec.ts` (desktop and mobile): what the browser
tests cover (menu path, pixels, undo/redo, reload, project round trip).

## Limitations / Remaining work
What is planned or deliberately out of scope.
```

---

## 7. Debugging

### Dev server and URLs

| URL | What |
| --- | --- |
| `http://127.0.0.1:5173/` | Home page (`src/HomePage.tsx`), dev server |
| `http://127.0.0.1:5173/editor` | Editor; reopens the last draft (`pixelforge:last-draft`) |
| `/editor?new=1` | Editor with a fresh draft (what the specs use) |
| `/editor#draft=<uuid>` | Open a specific saved draft |
| `http://127.0.0.1:4173/` | `npm run preview` of `dist/` (service worker, `/release.json`, `/help`) |

The account menu calls the Cheaply Marketplace API at
`https://marketplace.cheaply.fr/marketplace/api/photoeditor…`; the specs stub it
with `{ authenticated: false }`. Anonymous editing works without it.

### Performance marks

`src/performanceMarks.ts` exposes `beginPerformanceSpan(operation)`. Each span
emits `pixelforge.<op>.start`/`.end` marks, a `pixelforge.<op>` measure and a
`pixelforge.<op>.latest` mark (or `.cancelled`). Current operations: `render`,
`paint`, `save`, `export`. Caches and pipelines also emit marks with a
`detail` payload: `pixelforge.composite-cache`, `pixelforge.layer-filter-cache`,
`pixelforge.tile-commit`, `pixelforge.decoded-tile-cache`,
`pixelforge.persistent-layer-cache`, `pixelforge.stroke-window`,
`pixelforge.draft-preview`, `pixelforge.draft-preview-installed`,
`pixelforge.draft-warm`, `pixelforge.presented-composite`.

```js
// DevTools console
performance.getEntriesByType('measure').filter((m) => m.name.startsWith('pixelforge.'))
performance.getEntriesByName('pixelforge.composite-cache', 'mark').map((m) => m.detail)
```

They also appear in the DevTools Performance panel's *Timings* track.
`tests/browser/large-painting-fixture.ts` exports `marks(page, name)` for
specs. Budgets: [`performance-budgets.md`](performance-budgets.md).

### Workers

Workers are module workers created with `new Worker(new URL('./x.worker.ts',
import.meta.url), { type: 'module' })`: `document-render.worker.ts`
(`src/workerRender.ts`), `filter-band.worker.ts` (pool in
`src/filterWorkerPool.ts`: up to 8 workers on desktop, 2 on mobile) and
`image-encode.worker.ts` (`src/workerEncode.ts`).

- In Chrome DevTools, pick the worker in the Sources panel thread list (or the
  console context dropdown) to set breakpoints and log.
- Worker requests are plain messages with transferred `ArrayBuffer`s; errors
  come back as `{ kind: 'error', message }`. Reproduce a wrong pixel by calling
  the same pure function (`applyFilterEffectsPixels`, `renderFilterBand`) in a
  Node test; that is usually faster than debugging the worker.
- The document renderer falls back to the main thread when
  `canRenderInWorker()` is false (no `Worker`, `OffscreenCanvas` or
  `createImageBitmap`); see [`worker-render-contract.md`](worker-render-contract.md).

### IndexedDB and local storage

DevTools → Application → Storage:

| Store | Contents |
| --- | --- |
| IndexedDB `pixelforge-documents` (v2) | `drafts` (draft records) and `draftBlobs` (payload chunks, `asset:`-prefixed tiles). `src/drafts.ts`. |
| IndexedDB `pixelforge-layer-cache` | `blobs` + `meta`: on-device render cache. `src/persistentLayerCache.ts`. Safe to delete. |
| `localStorage` `pixelforge.*` | Versioned UI preferences (toolbar, shortcuts, menu, last filter, sidebar…). |
| `localStorage` / `sessionStorage` `pixelforge:*` | Draft bookkeeping (`pixelforge:last-draft`, `pixelforge:pending-draft:*`, …). |

Formats are documented in [`draft-storage-contract.md`](draft-storage-contract.md)
and [`data-formats.md`](data-formats.md). To reset everything, use
Application → Storage → *Clear site data* for the origin (this deletes local
drafts on that origin).

### Service worker

`public/sw.js` is registered only when `import.meta.env.PROD` is true, so it is
**never active under `npm run dev`**. It is active under `npm run preview` and
in production. When a preview looks stale after a rebuild, use DevTools →
Application → Service workers → *Update on reload* or *Unregister*, or clear
site data. Caching rules: [`offline-pwa.md`](offline-pwa.md) and
[`operations.md`](operations.md).

### Build identity

`/release.json` and `/api/readyz.json` exist only in a built `dist/`. In a
local build the version is `<package version>-dev+<sha7>`. The top bar shows
the baked version.

### E2E failures

Traces are kept for failing tests (`trace: 'retain-on-failure'`):

```sh
npx playwright show-report                       # HTML report in playwright-report/
npx playwright show-trace test-results/<test-dir>/trace.zip
npx playwright test tests/browser/foo.spec.ts --project=desktop --debug   # step through
npx playwright test tests/browser/foo.spec.ts --headed --workers=1
```

In CI the report and `test-results/` are uploaded as
`browser-test-results-<shard>` when a shard fails. More in
[`testing.md`](testing.md).
