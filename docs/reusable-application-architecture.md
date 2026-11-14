# Reusable application architecture and delivery blueprint

> **Blueprint, not current state.** This guide is a recommended architecture for
> future applications. Its directory layout (for example `src/domain/`,
> `src/render/`) and authentication guidance (Authorization Code with PKCE) do
> not describe PixelForge as built: PixelForge uses a flat `src/` and the
> existing Marketplace session cookie. For the actual system see
> [`architecture.md`](./architecture.md).

This guide extracts the reusable engineering patterns from PixelForge for a
new browser application, including a video editor. It describes boundaries and
release gates rather than prescribing the product's exact features. Keep the
same discipline when replacing Canvas with a video timeline, WebCodecs,
WebAudio, or a server-side render service.

## Product principles

1. **Free core, optional identity.** Let anonymous users complete useful work
   without sign-in or payment. Authentication unlocks private projects,
   cross-device sync and account features. Never make sign-in a prerequisite
   for local editing.
2. **Local-first data ownership.** Import and edit locally by default. Do not
   upload a photo, video, audio track, or project merely because a user signs
   in. Make every remote upload an explicit, labelled action.
3. **Editable until export.** Keep user intent as structured metadata and
   immutable source assets. Render a flattened or encoded output only at an
   explicit export boundary.
4. **Honest capability labels.** A visible command must either work within a
   documented bounded contract or be visibly disabled with a roadmap label.
   Never use a button, menu item, or progress bar to imply an unsupported
   capability.
5. **Evidence before claims.** Separate source changes, local tests, protected
   CI, deployment, and live verification. A green test or deployed revision is
   not by itself proof that the live workflow works.
6. **Bound every resource.** Set limits for pixels/frames, layers/tracks,
   history, decoded memory, project size, queue length, export duration and
   remote storage. Reject or degrade explicitly before an allocation can take
   down the tab.

## Recommended technical shape

PixelForge is a static React/Vite application hosted from Firebase Hosting on
Google Cloud. A similar app can use another static host, but preserve the
separation below:

```text
UI shell (React)
  ├─ command/menu/shortcut layer
  ├─ inspector and tool panels
  └─ viewport/timeline adapter

Domain model (pure TypeScript)
  ├─ versioned document/project schema
  ├─ validation and migrations
  ├─ commands, history and selection state
  └─ deterministic operations/render plans

Runtime adapters
  ├─ Canvas/WebCodecs/WebAudio/OffscreenCanvas workers
  ├─ IndexedDB local drafts and asset blobs
  ├─ optional authenticated project API
  └─ import/export/encoding adapters

Release and verification
  ├─ unit/property/pixel/contract tests
  ├─ desktop and mobile Playwright acceptance
  ├─ protected GitHub Actions build/deploy
  └─ live revision, DNS/TLS and readiness checks
```

Keep browser APIs and network calls at the edges. The domain modules should be
callable from Node tests without a DOM, network, account, or filesystem. This
makes pixel, geometry, timeline, migration, and failure behavior deterministic
and keeps the UI thin enough to change.

Suggested project layout:

```text
app/                       route/page composition and global shell
components/                reusable accessible UI primitives
src/domain/                project schema, validation, migrations, commands
src/operations/            pure editing operations and render-plan builders
src/render/                 main-thread and worker adapters
src/persistence/            IndexedDB, portable files, cloud API boundary
src/import/                 format decoders and fidelity labels
src/export/                 encoders, target-size search, metadata policy
tests/                     pure contract tests
tests/browser/             desktop/mobile acceptance tests
docs/                      contracts, budgets, limitations and release runbooks
scripts/                   release metadata and deployment verification
```

PixelForge currently has some legacy composition in `app/page.tsx`; for a new
application, keep that file as orchestration and move feature state, commands,
and render algorithms into domain modules from the beginning.

## The versioned project model

Use a project envelope with a schema version, stable IDs, metadata, assets and
an editable state history. Never persist live class instances, DOM nodes,
object URLs, functions, React state, credentials, or browser-specific handles.

```ts
type ProjectEnvelope = {
  format: 'your-app-project';
  version: 1 | 2;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  current: DocumentState;
  history: DocumentState[];
  index: number;
  assets: Record<string, AssetRecord>;
  settings: UserProjectSettings;
};

type AssetRecord = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'mask' | 'proxy' | 'font';
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
  bytes: number;
  data: string; // or an IndexedDB blob reference; never a remote URL alone
};
```

Rules that matter:

- Validate every field at the persistence boundary, including dimensions,
  finite numeric values, enum values, IDs, references and byte counts.
- Reject unknown versions and malformed references; do not partially install a
  corrupt document.
- Migrate old versions in pure, named functions. Preserve the old local record
  until the migrated record is successfully written.
- Keep source assets immutable. A command creates a new metadata state or a
  derived asset, rather than silently overwriting an original.
- Use stable IDs for layers, tracks, clips, masks, keyframes, selections and
  assets. Never use array indexes as identity.
- Keep UI-only state (collapsed panels, selected tab, active tool) separate from
  content state where possible, while persisting it when reopening the project
  is expected to restore the workspace.

### Video-editor translation

For a video editor, map the image concepts as follows:

| Image editor | Video editor equivalent |
| --- | --- |
| Frame/canvas | Project settings plus sequence/timeline format |
| Raster/text/vector layer | Video, audio, subtitle, shape, adjustment or nested-composition track |
| Layer transform | Clip transform/crop/anchor/keyframed transform |
| Layer mask/selection | Clip matte, alpha mask, garbage matte or keyframed mask |
| Adjustment layer | Timeline/track/clip effect node |
| Immutable source PNG | Original media asset plus generated proxy/decoded cache |
| Undo frame | Immutable project snapshot or command inverse |
| Rendered export | Encoded video/audio file with explicit codec/profile metadata |
| Artboard | Sequence, composition, aspect-ratio or output-viewport preset |
| Batch export | Render queue with per-output status and cancellation |

Store timeline time as integer ticks or microseconds, never accumulated binary
floating-point seconds. Define a project timebase, frame-rate policy, audio
sample rate and timecode conversion rules in the schema. Make clip boundaries,
transitions, keyframes and effect parameters deterministic at exact boundary
times.

## Commands, history and concurrency

Every edit should pass through a command boundary:

```text
validate input → compute next immutable state → validate next state
→ append/coalesce history → persist locally → schedule render
```

A command should declare its scope, for example `transform-layer`,
`split-clip`, `add-keyframe`, `set-adjustment`, `trim-canvas`, or `export`.
Commands must be safe when the active item is hidden, locked, deleted, stale,
or missing. Return a typed failure reason that the UI can explain.

History guidance:

- Undo and redo are document operations, not ad-hoc React state reversal.
- Coalesce continuous pointer/keyframe drags into one history entry on pointer
  up or cancellation.
- A no-op must not create history.
- Undo history has a count and byte budget; trim the oldest entries only after
  preserving the current state and referenced assets.
- Cancellation restores the previous state and prior viewport/timeline frame.
- Superseded renders carry a monotonically increasing request ID. Only the
  latest request may publish pixels, thumbnails, waveform data or telemetry.

For cloud projects, send an expected revision/generation with every update.
Reject stale writes. On conflict, keep the user's local state intact and offer
two explicit actions: reload the newer cloud copy, or save the local state as a
new project. Validate and render the remote copy before replacing anything.

## Local and cloud persistence

### Anonymous local path

- Store drafts and undo history in IndexedDB, not only `localStorage`.
- Use one atomic transaction for the record and asset references.
- Queue writes within a tab; expose “saving”, “saved”, and “save failed” states
  based on transaction completion.
- Store a monotonically increasing local revision. A stale tab cannot overwrite
  a newer draft.
- Put a stable draft ID in the URL hash/query so bookmarks reopen the project.
- On reload, validate, migrate, decode and render before replacing the visible
  current document.
- Clearing browser data can remove local work; explain this in the UI and offer
  a portable project download.

### Optional authenticated path

- Reuse the organization's central OAuth/OIDC session; use Authorization Code
  with PKCE in the browser, never implicit flow.
- Keep anonymous local storage and authenticated cloud projects separate.
- Scope every API read/write to the authenticated subject on the server.
- Do not log tokens, cookies, authorization codes, project pixels or media URLs.
- Keep sign-in, profile, project library, save, update, conflict and logout
  flows individually testable.
- Never auto-upload existing local media after login; require an explicit “Save
  to cloud” action and show what will be uploaded.

## Rendering and large media

Use a render-plan boundary. The UI requests a plan; the renderer consumes the
validated plan and immutable assets. The same plan should work in a pure test,
the main thread, a worker, and a batch/export path.

### Browser rendering strategy

1. Use a synchronous/predictable small-document path for immediate edits.
2. Use a module worker for committed large renders when Worker,
   OffscreenCanvas/WebCodecs and required codecs are available.
3. Keep interactive override surfaces (a brush stroke, drag preview, or
   timeline scrub) on the main thread until the command is committed.
4. Use latest-wins cancellation and an idle worker teardown.
5. For neighborhood effects, process bounded tiles with explicit overlap and
   write each tile's inner rectangle once. Compare tiled output with a
   full-frame oracle before enabling a new effect.
6. Fall back safely when a worker, codec, tile allocation, or feature is
   unavailable. Preserve the previous visible result on failure.

Tile contract requirements:

- canonical row-major plan rebuilt from dimensions; never trust client tile
  rectangles;
- explicit tile size, overlap, batch byte budget and maximum tile count;
- alpha-premultiplied sampling and transparent-edge/hidden-RGB tests;
- serial or bounded-concurrency processing, with a retained-byte ledger;
- cancellation checks before and after each tile;
- monotonic progress that describes tiles or layers accurately;
- parity, seam, odd-size, edge-tile and worker-fallback tests;
- cache keys include document revision, effect parameters, source identity and
  tile rectangle; cap bytes and report hits/misses/evictions locally.

For video, add media-specific layers:

- decode only the visible time window plus a small prefetch margin;
- generate low-resolution proxies and thumbnails, retaining source identity;
- use WebCodecs where supported, with a clear fallback or server render path;
- keep audio waveform generation cancellable and bounded;
- avoid seeking by repeatedly decoding from an unbounded start point; use key
  frame/index metadata and a bounded decoder cache;
- separate preview quality from final export quality;
- make dropped frames visible as a preview diagnostic, never as silent loss in
  a final export;
- keep color space, pixel format, audio channels, sample rate and codec profile
  explicit in the project and export dialog.

## UI and visual system

The PixelForge visual language is a dark, dense creative-workspace UI. Reuse
the principles, not a pixel-for-pixel copy:

- near-black workspace background with slightly lighter panels;
- one strong accent for active controls and primary actions (PixelForge uses a
  cyan/orange brand combination); use semantic success/warning/error colors;
- high-contrast text, muted secondary labels and clear disabled states;
- rounded cards and controls with restrained shadows and thin borders;
- Lucide-style line icons with visible labels and keyboard hints;
- persistent top bar for brand, project title, save state, undo/redo, import and
  export;
- left tool palette grouped by task, in two columns at normal desktop width and
  three at wide widths; on mobile it becomes a compact scrollable grid or sheet;
- press-and-hold or keyboard Arrow/Enter opens a subtool flyout; a short click
  selects the primary tool. Put a small bottom-right triangle/chevron on
  groups that contain subtools, and give every subtool its own icon;
- right inspector for properties, layers/tracks and project metadata;
- bottom status bar for selection/tool state, local save state, render progress,
  server status and version;
- keep empty-space intentional: use CSS grid with consistent row/column gaps,
  avoid fixed-height category boxes, and collapse or virtualize long groups;
- preserve touch targets of at least about 44 CSS px and keyboard focus rings;
- use reduced-motion media queries and never rely on color alone;
- maintain visible “Discard draft” / “Return home” and recovery affordances.

### Video-editor layout adaptation

Keep the same shell and tokens, then replace the photo-specific centre and right
panels with:

```text
top bar: brand | project | save/revision | undo/redo | preview quality | export
left:    tools (select, cut, ripple, slip, text, shape, effects, audio)
centre:  program monitor + optional source monitor
right:   inspector, effects, media metadata, layers/compositing
bottom:  timeline with tracks, clips, keyframes, markers, snapping and zoom
```

Use the same command names in menus, toolbar, keyboard shortcuts and context
menus. Do not hide an important timeline action behind hover only. Show clip
selection, track lock/mute/solo, snapping, playhead time and render status in
text as well as visual indicators.

Centralize design tokens in CSS variables or a theme module:

```css
:root {
  --workspace: #11131a;
  --panel: #171a22;
  --panel-raised: #202532;
  --border: #303849;
  --text: #f4f7fb;
  --muted: #9aa3b4;
  --accent: #39c5e8;
  --primary-action: #ff6545;
  --success: #32d583;
  --warning: #f5b83d;
  --danger: #f04438;
  --focus: #9b6cff;
  --radius-sm: 6px;
  --radius-md: 10px;
  --space: 4px;
}
```

Do not let feature code invent one-off colors, shadows, z-indexes, or icon
sizes. Use shared accessible primitives for buttons, menus, dialogs, sliders,
tabs, tooltips, badges, sheets and alerts.

## Import, export and fidelity boundaries

Every format must have an explicit capability label: supported, conditional, or
unsupported. A flattened import is not an editable round trip. Tell the user:

- what remains editable;
- what is flattened or discarded;
- whether metadata, color profiles, captions, audio, keyframes or effects are
  omitted;
- whether processing is local or remote;
- where the resulting file is stored.

Exports should be deterministic where feasible, strip sensitive metadata by
default, expose quality/size controls, and report encoded bytes rather than
guessing from source size. Target-size search must be bounded and allowed to
fail clearly when the requested size is impossible.

For video, define separate contracts for:

- project archive (lossless/editable);
- preview proxy (lossy/temporary);
- final render (codec/profile/audio settings);
- captions/subtitles and timecode;
- alpha/video-with-transparency support;
- media metadata privacy and source-link handling.

## Security and privacy

- Treat imported files, project JSON and cloud responses as untrusted data.
- Validate MIME, decoded dimensions, duration, codec, frame count and byte size
  before allocating.
- Do not execute project content as code; allow-list action commands and cap
  action steps/recipe size.
- Keep CSP, `X-Content-Type-Options`, strict referrer policy and a restrictive
  Permissions Policy.
- Limit network destinations to required first-party APIs and analytics.
- Keep secrets only in GitHub/Google/Cloudflare secret stores. Never commit
  tokens, service-account keys, cookies or provider artifacts.
- Scope private projects by authenticated subject server-side; client-side UI
  checks are not authorization.
- For optional AI or remote processing, require consent, show provider and
  retention policy, support cancellation, and provide a local fallback when
  one exists.

## Testing strategy

Use a test pyramid with every feature treated as a contract:

### Pure/domain tests

- valid and boundary parameters;
- malformed/forged input rejection;
- deterministic representative pixels or media samples;
- alpha, transparent hidden RGB, color space and geometry behavior;
- migration and round-trip JSON;
- command no-op, undo/redo and lock/visibility guards;
- cancellation, stale request and memory/byte limits;
- export signatures, dimensions, metadata and target-size behavior.

### Browser acceptance tests

Run the same meaningful scenarios on desktop and mobile Playwright projects:

- import/create, tool/menu/shortcut activation and accessible names;
- pointer, touch and keyboard interaction, including Escape cancellation;
- settings and subtool persistence;
- representative visual/pixel assertions, not only “button exists”;
- undo/redo, reload/bookmark recovery and portable project round-trip;
- offline shell behavior and cloud/auth conflict paths;
- worker capability, fallback, progress and cancellation;
- performance marks with a watchdog, clearly labelled as diagnostics.

### Release verification

Protected CI should run lint, typecheck, build, pure tests and the full
desktop/mobile browser suite. Upload the exact tested artifact. The deploy job
must promote that artifact rather than rebuild it, authenticate with short-lived
OIDC credentials, and verify:

1. hosting revision/release metadata matches the commit;
2. readiness endpoint is healthy;
3. custom DNS and TLS respond;
4. the live app can load and perform a representative workflow;
5. account/project authorization is tested separately from anonymous editing.

Keep warnings (runner migrations, Node action deprecations, bundle-size
warnings) visible and tracked, but distinguish them from failures.

## Performance and observability

Instrument local-only marks for editor ready, input/gesture, render, save,
export, decode and timeline seek. Never include pixels, filenames, tokens or
project contents. Report operation and queue state in the UI without claiming
that it is network streaming.

Measure repeated p50/p95 cold and warm runs on representative physical desktop
and mobile devices. Record browser, OS, viewport, DPR, commit, media dimensions,
codec and quality. CI emulation catches regressions but is not a device support
claim. Add memory traces and low-memory recovery before increasing limits.

## Delivery workflow

Use small vertical slices:

1. Write a contract and limitation statement.
2. Add the pure model/renderer and validation.
3. Add the UI/command/menu/shortcut path.
4. Add desktop/mobile acceptance and persistence/export tests.
5. Run local lint, typecheck, build and focused/full tests.
6. Open a PR with exact scope, risks and evidence.
7. Wait for protected CI; fix failures before merge.
8. Merge only the verified branch; monitor the main deployment.
9. Verify deployed SHA, readiness, DNS/TLS and live workflow independently.
10. Update roadmap and limitations with evidence, not intention.

Avoid combining unrelated feature families in one release. A feature is
“implemented” only when its data model, UI, tests, persistence behavior,
fallback/error states and release evidence all exist.

## Video-editor first milestone recommendation

Start the new project with a narrow but real vertical slice:

1. Create a project with one sequence and one video clip.
2. Import media locally, validate duration/dimensions/codecs and create a
   thumbnail/proxy without uploading.
3. Select, move, trim and split the clip with integer timebase math.
4. Persist the project and undo history in IndexedDB; reopen from a bookmark.
5. Render a cancellable preview window in a worker with a main-thread fallback.
6. Export one clearly labelled MP4/WebM path, or provide an explicit
   unsupported-codec message if the browser cannot encode it.
7. Add desktop/mobile acceptance for the complete slice, including reload,
   cancellation, locked tracks and malformed media.

Only after that should you add transitions, audio waveforms, keyframes,
captions, effects, proxy management, batch render, cloud projects and
collaboration. This keeps the video editor honest, testable and extensible
while it grows toward a professional workflow.

## Reusable handoff checklist

Before asking another project to implement a feature, provide:

- the user-visible command and keyboard shortcut;
- the versioned state fields and migration behavior;
- source-asset and privacy policy;
- deterministic algorithm or provider contract;
- bounds and memory budget;
- success, no-op, locked, malformed, cancellation and offline behavior;
- desktop/mobile acceptance steps;
- pixel/media/geometry expectations;
- export and metadata implications;
- CI, deployment and live-verification gates;
- explicit limitations and what remains staged.

This checklist is the most important reusable habit: it prevents a polished
button from being mistaken for a safe, persistent, tested capability.
