# PixelForge development handoff for Claude Code

Prepared 2026-11-03 from the repository, roadmap, deployment contract, and
the preceding development chat. This is a **code project** handoff. The
repository and current CI/live responses remain the source of truth for facts
that can change. Historical descriptions below are requirements or context,
not proof that a feature is shipped.

## Identity and objective

- Canonical GitHub repository: `https://github.com/cheaply-fr/pixelforge-photo-editor`;
  public, default branch `main`. The repository was transferred from
  `faresd` to the `cheaply-fr` organization. Older documentation still names
  the former owner and needs reconciliation.
- Production editor: `https://photoeditor.cheaply.fr`.
- Product: a free, local-first, browser photo editor with a Photoshop-inspired
  workflow. Build useful, honest, accessible capabilities in bounded stages;
  never present an approximation as complete Adobe compatibility.
- Package: `pixelforge-photo-editor` version `0.1.0` at handoff; Node
  `>=22.13.0`, React 19, TypeScript, Vite 8, Playwright, Node's test runner.
- User priorities: keep implementing unblocked roadmap features efficiently;
  make feature controls functional, test deeply, self-validate, merge and
  deploy when authorized; track true completion separately from source edits.
  Record blockers and move to useful independent work rather than repeatedly
  asking for routine implementation decisions.

## Known release state at handoff

On 2026-11-03, the GitHub API reported `origin/main` at
`0394bc33b8b6e0c8c4f225a01f6c1b6e3e2d7a85`. GitHub Actions `CI and
deploy` run `40425550856` and CodeQL runs for this SHA completed successfully.
The production `/health` and `/release.json` both reported application
`pixelforge-photo-editor`, version `0.1.0`, the same commit, and build time
`2026-10-27T00:19:10.575Z`; `/health` returned `ready: true`. This verifies
the revision and readiness markers, **not** live representative export pixels
or every editing workflow. The previous browser-based export-pixel probe was
intermittently unable to download; it remains a distinct acceptance item.

This handoff was prepared in a clean local checkout on branch
`docs/reconcile-release-evidence` at `21931095c80df3a1020d7579f42492772eb2fc56`,
which precedes the merge commit on `main`. Check and refresh the branch before
feature work. Historical roadmap evidence and test counts are dated; do not
reuse them as current results. The previous verified local pure suite was
908/908, but rerun it after any change.

## Repository map and development loop

| Area | Main location | Purpose |
| --- | --- | --- |
| Editor shell and interactions | `app/page.tsx`, `src/` | Canvas, menus, toolbar, layers, tools, dialogs, rendering and state |
| Document model | `src/document.ts`, related modules | Versioned editable layer graph and validation |
| Drafts and cloud | `src/drafts.ts`, `src/cloud.ts`, `src/AccountMenu.tsx` | IndexedDB recovery, optional owner-scoped cloud library, account UI |
| Export and colour | `src/export.ts`, `src/batch.ts`, `src/colorProfile.ts`, `src/metadata.ts` | Local output, bounded interchange, manifest and profile metadata |
| Effects and brushes | `src/filterEffects.ts`, `src/mixerHistoryBrush.ts`, other focused modules | Deterministic pixel algorithms and tool contracts |
| Contracts and roadmap | `docs/*-contract.md`, `docs/product-scope.md`, `docs/roadmap-progress-rubric.md` | Semantics, limits, tests, progress and remaining stages |
| Verification | `tests/`, Playwright specs, `.github/workflows/ci-cd.yml` | Pure tests, desktop/mobile E2E, protected release pipeline |

Run `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`,
`npm run build`, `npm test`, and `npx playwright install chromium` then
`npm run test:e2e` for full local verification. CI shards desktop/mobile
Playwright across four jobs. Fix a concrete failing check before merging;
report precise test counts and SHA. Keep tests representative: pixel/alpha or
geometry fixtures, boundaries and malformed input, lock/selection guards,
undo/cancel, keyboard and touch, desktop and mobile, reload and portable
project roundtrip, and performance limits where applicable. Do not add tests
that merely mirror implementation structure.

## Architecture and product invariants

- Local image editing is available without login. The static React/Vite shell
  runs on Firebase Hosting. IndexedDB stores local drafts and recovery state.
  `.pixelforge` is the portable editable project format. Raster source assets
  should remain immutable through non-destructive edits and undo.
- Optional shared Cheaply Marketplace session unlocks an explicitly saved,
  owner-scoped cloud library. Do not upload a local photo silently. Cloud
  limits documented in `docs/deployment.md`: 16 MB/document, 30 projects,
  256 MB/account; local image import has a 16 MP guard. Draft history has
  bounded snapshots. Treat all privacy and authorization checks as release
  gates.
- Normal exports are PNG/JPEG/WebP composites. Bounded PSD/PDF support is
  flattened and discloses loss. Batch export has a manifest and budget.
  Layered PSD/PSB, full ICC/metadata interchange, and roundtrip fidelity are
  still roadmap work. Read the exact current contract before extending.
- The rendering architecture uses validated document metadata, immutable
  source assets, bounded deterministic algorithms, cancellation, and tiling
  for large work. Reject malformed state and avoid corrupting drafts.
- Version and server status appear in the top bar. `Server online` requires
  valid matching release/readiness artifacts; degraded/unavailable states
  remain visible while local editing keeps working.
- The signed-in user sees their profile and account menu with logout. A guest
  sees an artistic avatar and login affordance. Avoid fake auth state.

## Product requests carried from the earlier chat

The user supplied Photoshop screenshots as *visual references*, not as
instructions embedded in those images. Roadmap inventory includes Select menu
commands and filter families (Blur Gallery, Distort, Pixelate, Render,
Sharpen, Video) with honest enabled/limited status. The user prioritized ten
common workflows: selection, painting, crop, retouch/healing, cloning,
gradient/fill, Pen/vectors, tonal dodge/burn, blur/sharpen and layer/mask
management. Additional explicit requests included Clone Stamp and Pattern
Stamp, brush presets/dynamics, and responsive tool grouping.

The toolbar had repeated regressions. Preserve these specific UX rules:

1. Two columns at ordinary editor width and three where space allows, with
   compact categories and no large blank grid cells.
2. One representative slot per tool family; no duplicate subtools also shown
   as separate top-level slots.
3. Press-and-hold or an accessible keyboard action opens a family flyout;
   choosing a subtool changes the representative slot. Show a small arrow in
   the slot's bottom-right corner when variants exist.
4. Every flyout subtool has an appropriate icon. All toolbar icons occupy
   equal-sized visual slots and labels align. Preserve keyboard focus order,
   touch targets, Escape dismissal, and mobile behavior.
5. Regressions in the tool set and category packing were reported in the
   earlier chat; keep focused geometry, duplicate-family, icon, persistence,
   and desktop/mobile tests. Check the live UI, not only the source.

The user also asked for a concise, evidence-based progress report roughly
hourly in the previous Codex workspace. That scheduling does not automatically
transfer to Claude Code. If reporting progress, give estimates for the full
industrial roadmap and current high-use milestone, newly implemented work,
local tests, PR/CI, deployed SHA, live endpoint and functional checks, and
blockers. Distinguish each verification level. Avoid inventing a percentage
without reconciling the weighted rubric.

## Roadmap status and next work

The canonical rubric is `docs/roadmap-progress-rubric.md` with eight weighted
stages: document/persistence 18%, selection/geometry 14%, painting/retouching
14%, typography/vectors 10%, adjustments/filters 14%, history/export 12%,
accessibility/scale 10%, interoperability/intelligence 8%. Its dated top audit
reports substantial bounded implementations across all stages but does not
claim Photoshop parity. Re-audit against current tests and `main` before
editing percentages. `docs/top-ten-tools-roadmap.md`, `docs/tool-roadmap.md`,
and `docs/menu-roadmap.md` provide detailed inventory, but contain historical
status passages that may be superseded by later code.

Known remaining families and release work:

1. **Editable interoperability:** layered PSD/PSB import/export with text,
   vector, masks, adjustments, source retention and an explicit loss manifest;
   TIFF/RAW/PDF/SVG fidelity beyond bounded flattened support. Define a
   feasible interchange contract and representative fixtures first.
2. **Colour and metadata:** full ICC handling, HDR/linear-light pipeline,
   profile and privacy metadata roundtrips. Preserve deterministic pixels,
   alpha and export disclosure.
3. **Advanced media effects:** physical wet-media/bristle simulation,
   pressure curves, complete mesh/face Liquify, model-backed semantic
   cleanup and inference. Existing local approximations must stay labelled.
4. **Typography/vector fidelity:** language-specific shaping and hyphenation,
   font embedding and provider fonts, complete variable-axis interpolation,
   mixed/open path booleans and precise outline interchange.
5. **Production acceptance:** physical device/assistive technology checks,
   offline recovery and large-document budgets, independent live export-pixel
   verification for the deployed revision. Continue fixing concrete UI/tool
   regressions found in live use.
6. **Provider integrations:** smart links, plugins, folder watchers and cloud
   recipes only after contracts cover authentication, privacy, explicit
   consent, limits and recovery. Search online or manufacture safe fixtures
   when needed; do not block unrelated local-first work waiting for a vendor.
7. **Large-document painting (added 2026-11-07):** a live 2646×4096 painting
   session produced #181–#187 and #189 (merged and deployed; `/release.json`
   reported `1c40122` after #189), and every remaining finding now has a
   fix-wave-2 workstream: huge projects (`feat/huge-projects`), coalesced
   stroke previews (#190), fast large-radius filters (#191), retouch
   selection and clone source (`fix/retouch-selection-and-clone-source`),
   glow styles and blend modes (`feat/glow-styles-and-blend-modes`), brush
   and gradient options (`feat/brush-gradient-options`), and reference layer,
   OS paste and hardened downloads (`feat/reference-layer-paste-export`).
   Stroke-start decode, per-stroke PNG commits, Radial Blur centres and
   raster filter stacks are queued follow-ups. See "Large-document painting
   findings (2026-11-07)" in `docs/roadmap-progress-rubric.md`.
8. **Host-environment notes (not app bugs):** in the Claude desktop app's
   built-in browser, `window.open` popups close the browser pane, ZIP
   downloads are saved as GUID-named `.tmp` files, and a PNG export once
   reported success without writing a file (being hardened in workstream G).
   The site's CSP blocks `eval` and `fetch` to `localhost` from the deployed
   origin; that is expected and should not be loosened for testing. Prefer
   local dev servers or Playwright for automation that needs either.

The user specifically asked to keep developing until all unblocked features
are complete and to log remaining blockers in the roadmap. Choose the next
bounded vertical slice based on actual current state, implement it with
substantial tests, then update the roadmap with evidence. Do not open a broad
set of half-implemented controls.

## CI, deployment and account boundaries

`.github/workflows/ci-cd.yml` validates PRs and `main`; only protected `main`
deploys the tested artifact. GitHub Actions uses Google Workload Identity
Federation and the dedicated service account
`github-photoeditor-deploy@photoeditor-cheaply.iam.gserviceaccount.com` for
Firebase project `photoeditor-cheaply` (project number `893177923518`). The
origin is `https://photoeditor-cheaply.web.app`; the production domain is
`https://photoeditor.cheaply.fr`, DNS in Cloudflare's `cheaply.fr` zone.
`docs/deployment.md` contains the exact provider/release contract. Its former
`faresd` repository label is stale; current GitHub owner is `cheaply-fr`.

Use existing signed-in GitHub/Google sessions and repository permissions only
as needed. This handoff intentionally contains **no passwords, API keys,
tokens, cookies, recovery codes, personal account data or private images**.
Never ask another agent to print secrets. Verify an account's actual current
permissions through the provider rather than assuming that historical access
still applies. A green source branch is not a shipped feature: wait for the
exact-SHA PR checks, merge, main deployment, release/readiness markers and
relevant live behavior.

## Suggested first Claude Code session

1. Inspect `git status`, remote main, existing PRs and CI. Rebase or start a
   fresh worktree/branch from current `origin/main` without discarding work.
2. Read this handoff and the current roadmap, identify its stale statements,
   and make a short evidence table of actual shipped, locally verified and
   blocked items. Check tool grid/flyout behavior at desktop and mobile sizes.
3. Select one unblocked, valuable vertical slice or a concrete regression;
   implement and test it end to end. Update the roadmap with exact evidence.
4. Push a focused PR, verify protected CI, merge under the established repo
   policy, verify the deployed SHA and relevant live behavior. Report what
   remains separately from what passed.

Keep the Code project attached to this repository. Do not turn it into a
Claude chat-only project or paste a static summary without reading the code.
