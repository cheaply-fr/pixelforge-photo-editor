# PixelForge data formats

Every format PixelForge persists or exchanges, with the module that owns it.
For how these fit into the running app see [`architecture.md`](./architecture.md);
for privacy rules see [`security-and-privacy.md`](./security-and-privacy.md).
The documentation index is [`README.md`](./README.md).

Code is authoritative. Each section names the defining module; check it
before relying on a value here.

## Contents

- [Overview](#overview)
- [The draft document (`Draft`)](#the-draft-document-draft)
- [Persisted history window](#persisted-history-window)
- [Project file (`.pixelforge`)](#project-file-pixelforge)
- [Local drafts in IndexedDB](#local-drafts-in-indexeddb)
- [Tiled assets](#tiled-assets)
- [Image and file exports](#image-and-file-exports)
- [Cloud project payload](#cloud-project-payload)
- [Browser storage keys](#browser-storage-keys)
- [`/release.json` and readiness probes](#releasejson-and-readiness-probes)
- [Versioning and migration rules](#versioning-and-migration-rules)

## Overview

| Format | Where | Owner | Version marker |
| --- | --- | --- | --- |
| `Draft` (editable document) | in memory; inside every format below | `src/drafts.ts`, `src/document.ts` | `version: 2` (`CURRENT_DRAFT_VERSION`); `1` migrated on read |
| Project file `.pixelforge` | user download / open | `src/portableBundle.ts` | ZIP with `manifest.json` `kind: "pixelforge-project"`, `version: 3` |
| Legacy JSON project | user open (`.json`) | `src/drafts.ts` `validateDraft` | `Draft.version` 1 or 2 |
| Local draft | IndexedDB `pixelforge-documents` (DB version 2) | `src/drafts.ts`, `src/draftAssetStore.ts`, `src/draftBundle.ts` | storage formats 1–4; writes 3 or 4 |
| Write-ahead snapshot | `sessionStorage` | `src/drafts.ts` | `{ token, tiled?, draft }` |
| Render cache / reopen preview | IndexedDB `pixelforge-layer-cache` | `src/persistentLayerCache.ts` | cache only, never a source of truth |
| Cloud project | Marketplace API (opt-in) | `src/cloud.ts` | `Draft` version 2 with private fields stripped |
| Image exports | user download | `src/export.ts`, `psdExport.ts`, `pdfExport.ts`, `svgDocumentExport.ts` | n/a (flattened outputs) |
| Preferences | `localStorage` | various | per-key envelope versions |
| Release record | `/release.json`, `/api/readyz.json` | `scripts/write-release.mjs` | n/a |

## The draft document (`Draft`)

`Draft` (in `src/drafts.ts`) is the single editable-document shape. Drafts,
project files and cloud projects all carry it, and all of them pass through
`validateDraft` before use.

```ts
type Draft = {
  version: 2;
  localRevision?: number;   // IndexedDB optimistic-concurrency counter (local only)
  cloud?: CloudLink;        // { id, generation, owner } (local only)
  history: Frame[];         // 1..24 frames when persisted
  assets: Assets;           // asset id → PngAsset | TiledAsset
  index: number;            // current frame in history
  name: string;             // ≤ 160 characters
  settings: Settings;       // tool and UI options restored with the draft
  metadata?: DocumentMetadata; // File Info: { title, description, author }
  audio?: AudioClips;       // Audio Annotation clips (clip id → AudioClip)
  migrated?: true;          // set when a version 1 draft was migrated
};
```

| Field | Notes |
| --- | --- |
| `history` / `index` | `Frame` snapshots, oldest first. Validation requires 1–24 frames and `0 ≤ index < history.length`. `Frame`, `Layer`, `Group` and asset shapes are described in [`architecture.md`](./architecture.md#document-model) and [`layer-document-format.md`](./layer-document-format.md). |
| `assets` | Pruned to `referencedAssets(history, assets)` on validation. At most 4,096 ids (`MAX_PROJECT_ASSETS`) and 1 GiB of encoded bytes (`PROJECT_ASSET_BYTES_CEILING`). Ids are UUIDs (`/^[a-f0-9-]{36}$/`). |
| `settings` | Tool, colour, brush, shape, pen, retouch, type, export (`exportFormat`, `exportQuality`, `exportTargetBytes`), zoom (`zoom` legacy 20–140 and `viewZoom` 1–3200), preset libraries embedded in the document (`customBrushPresets`, `customPatternPresets`, `imagePatterns`, `customShapePresets`, `customPathPresets`) and similar. New keys are optional; absent keys use defaults. |
| `metadata` | `{ title ≤ 160, description ≤ 2000, author ≤ 160 }` (`METADATA_LIMITS` in `src/metadata.ts`). Stored locally and in project files; removed from cloud payloads. |
| `audio` | `AudioClip = { url: 'data:<mime>;base64,…', mime, bytes, durationMs }`. Up to 32 clips, 5 MiB each, 32 MiB total, 120 s each (`src/audioAnnotations.ts`). Invalid or unreferenced clips are dropped with their markers. Removed from cloud payloads. |
| `localRevision`, `cloud` | Storage metadata. Removed from project files; `localRevision` is the IndexedDB revision. |

### Asset shapes

| Shape | Value | Notes |
| --- | --- | --- |
| `PngAsset` | `{ url: 'data:image/png;base64,…', w, h }` | `w`, `h` integers 1–16,000 and `w × h ≤ 16,000,000`. |
| `TiledAsset` | `{ w, h, tileSize: 256, tiles: (AssetTile \| null)[] }` | In memory and in local drafts only; flattened to a `PngAsset` for project files and cloud. See [Tiled assets](#tiled-assets). |

## Persisted history window

The in-memory undo stack (up to 240 states; see
[`architecture.md`](./architecture.md#history-budgets-srchistorybudgetts)) is
larger than what is persisted. `persistableHistoryDraft` /
`selectPersistedHistory` in `src/historyBudget.ts` pick a contiguous window:

1. Always the current frame (even if it alone exceeds the byte limit, up to the
   1 GiB ceiling).
2. Then neighbours, alternating undo and redo, nearest first. When one side no
   longer fits, the other side keeps growing.
3. Stop at 24 states (`DRAFT_HISTORY_MAX_STEPS`), 64 MiB of referenced image
   bytes (`DRAFT_HISTORY_MAX_BYTES`) or 4,096 distinct assets
   (`DRAFT_HISTORY_MAX_ASSETS`).

`index` and `settings.historySourceIndex` (History Brush source) are re-based
onto the window; a source outside it is dropped.

Byte accounting differs by destination:

| Destination | Accounting |
| --- | --- |
| Local draft | Shared tiles counted once (tile storage is deduplicated). |
| Project file, cloud | `flattened: true`: every asset counted at full size, because each tiled asset becomes one PNG. |

## Project file (`.pixelforge`)

Owner: `src/portableBundle.ts`. Contract:
[`portable-project-bundle-contract.md`](./portable-project-bundle-contract.md).

Written by **File › Download project** (`exportProject` in `app/page.tsx`) as
`<document name or "untitled">.pixelforge`, Blob type `application/zip`,
through either an `<a download>` link or the File System Access save picker.

### Structure

A ZIP archive using the **store** method only (no compression), UTF-8 names
(general-purpose flag `0x0800`), deterministic zero timestamps:

```text
manifest.json            first entry
document.json            second entry
assets/<asset-id>.png    one entry per asset, sorted by id
```

`manifest.json`:

```ts
type PortableBundleManifest = {
  kind: 'pixelforge-project';
  version: 3;
  document: 'document.json';
  assets: {
    id: string;          // asset UUID
    path: string;        // exactly `assets/${id}.png`
    sha256: string;      // lowercase hex of the PNG bytes
    byteLength: number;  // PNG bytes
    w: number; h: number // must match the PNG IHDR
  }[];
  documentSha256: string;
  documentByteLength: number;
  archiveByteLength: number; // whole .pixelforge file length
};
```

`document.json` is the `Draft` minus `assets`, `cloud` and `localRevision`
(still `version: 2`, with `history`, `index`, `name`, `settings`, `metadata`
and `audio`). Asset PNGs are the exact bytes decoded from each asset's data URL;
tiled assets are flattened to one PNG first (`flattenTiledAssets`), and the
history window is chosen with flattened accounting (see above). Audio clips
stay as data URLs inside `document.json`.

The writer converges `archiveByteLength` (whose decimal digits change the
archive length) in at most four passes.

### Limits (enforced on read and write)

| Limit | Value | Constant |
| --- | --- | --- |
| Archive size | 1 GiB | `PORTABLE_MAX_BYTES` |
| Entries | 4,098 (manifest + document + 4,096 assets) | `PORTABLE_MAX_ENTRIES` |
| Each JSON file | 64 MiB | `PORTABLE_MAX_JSON_BYTES` |
| Each PNG | 80 MiB | `PORTABLE_MAX_ASSET_BYTES` |
| Each image | 16,000 px per side, 16 MP | `readPngDimensions` |

### Reading

`readPortableBundle` fails closed. It requires a single-disk ZIP with no
archive comment, no ZIP64, no encryption, no data descriptors, method 0,
matching local and central headers, safe relative paths (no leading `/`, `\`,
empty, `.` or `..` segments, or control characters), no duplicates, and exactly
the entries the manifest lists. It verifies every CRC-32, the manifest
(`archiveByteLength`, document length and SHA-256), each asset's length,
SHA-256 and PNG dimensions, then rebuilds PNG data URLs and runs
`validateDraft`. An opened project becomes a **new** draft id with no cloud
link.

### Legacy JSON projects

Before v3, project files were the `Draft` JSON itself (`version` 1 or 2).
`readPortableBundle` still accepts a JSON string or a plain object, and
`importProject` routes a file whose MIME type is `application/json` or whose
name ends in `.json` to `validateDraft(JSON.parse(...))`. Every other file is
read as a ZIP.

## Local drafts in IndexedDB

Owner: `src/drafts.ts` (transactions), `src/draftAssetStore.ts` (formats 3/4,
pure), `src/draftBundle.ts` (format 2, pure). Contract:
[`draft-storage-contract.md`](./draft-storage-contract.md).

### Database

| Item | Value |
| --- | --- |
| Database | `pixelforge-documents` |
| Schema version | `2` (`DATABASE_VERSION`) |
| Object stores | `drafts` (out-of-line keys: draft id → pointer), `draftBlobs` (out-of-line keys: records) |
| Draft id | `crypto.randomUUID()`; appears in the URL as `/editor#draft=<id>` |

Format 3 and 4 added no schema change: their records live in `draftBlobs`
under an `asset:` prefix, so tabs on older builds are never blocked by a
version change.

### Storage formats under one draft id

| Format | Pointer in `drafts` | Records in `draftBlobs` | Written? |
| --- | --- | --- | --- |
| 1 | the complete `Draft` object | none | no; read and migrated on next save |
| 2 | `DraftBundleManifest` (`kind: "pixelforge-draft-bundle"`, `version: 1`) | ordered chunks at `<bundleId>:<index base36>`, ≤ 1 MiB each, ≤ 256 chunks, payload ≤ 64 MiB, SHA-256 checksum | no; read and migrated on next save |
| 3 | `DraftManifest` with `format: 3` | one `DraftAssetRecord` per distinct PNG asset and audio clip | yes, when no asset is tiled |
| 4 | `DraftManifest` with `format: 4` and `tileRefs` | as format 3, plus one `DraftTileRecord` per distinct tile | yes, when any asset is tiled |

### Format 3 / 4 shapes

```ts
type DraftManifest = Omit<Draft, 'assets' | 'localRevision' | 'audio'> & {
  kind: 'pixelforge-draft-manifest';
  format: 3 | 4;
  localRevision: number;             // revision this pointer commits
  assetRefs: Record<string,          // asset id →
    | { hash: string; w: number; h: number }            // PNG asset (SHA-256 of data URL)
    | { w: number; h: number; tileSize: 256;            // tiled asset (format 4 only)
        tiles: (string | null)[] }                      //   row-major tile keys
  >;
  tileRefs?: Record<string, string>; // format 4: tile key → SHA-256 of tile PNG bytes
  audioRefs?: Record<string,         // clip id →
    { hash: string; mime: string; bytes: number; durationMs: number }>;
  savedAt: string;                   // ISO timestamp
};

// draftBlobs record at `asset:<draftId>:<sha256>`
type DraftAssetRecord = { kind: 'pixelforge-draft-asset'; hash: string; bytes: ArrayBuffer }; // ASCII bytes of the data URL
type DraftTileRecord  = { kind: 'pixelforge-draft-tile';  hash: string; blob: Blob };        // tile PNG
```

Key rules:

- Records are **content addressed** (`asset:<draftId>:<sha256>`), never keyed
  by asset id, so an id reused for different pixels cannot alias old content.
- Records are **namespaced per draft**; `draftAssetKeyBounds(id)` is the range
  `asset:<id>:` … `asset:<id>:~` used for listing and garbage collection.
- Limits: 4,096 asset refs, 262,144 distinct tiles (`MAX_DRAFT_TILES`), tile
  PNG ≤ 1 MiB.

### Save and read

`saveDraft(id, draft, expectedRevision, pendingToken)`:

1. `prepareDraftForStorage` → `validateDraft` (assets already verified in this
   tab are matched by identity rather than re-scanned).
2. Hash only content not already hashed in this tab.
3. One read-write transaction over both stores: check the pointer's revision
   equals `expectedRevision` (else `LOCAL_CONFLICT`), list this draft's record
   keys, put only missing records, delete unreferenced ones and any format 2
   chunks, then put the manifest **last**. The pointer is the atomic commit.
4. Returns `expectedRevision + 1`. A `QuotaExceededError` becomes
   `LOCAL_STORAGE_FULL`; the previous revision stays readable.

`readDraft(id)` reads the pointer and all referenced records in one readonly
transaction, verifies every hash, runs `validateDraft`, and checks the
rebuilt draft's `localRevision` matches the pointer. Any failure rejects; the
editor keeps the bookmark and starts a new draft.

`discardDraft(id, expectedRevision)` deletes the pointer, this draft's
records and format 2 chunks in one transaction, under the same revision check,
and clears `pixelforge:last-draft` if it pointed here.

Saves are queued per tab in `app/page.tsx`; `holdDraftOpen` takes a shared Web
Lock `pixelforge:draft-open:<id>` so a second bookmark-less `/editor` tab
starts its own draft instead of racing on the same revision chain.

### Write-ahead snapshot (`sessionStorage`)

Before each IndexedDB save, `stagePendingDraft` writes
`pixelforge:pending-draft:<draftId>` =
`JSON.stringify({ token, tiled?: true, draft })` when it fits in 4 MiB
(`MAX_PENDING_DRAFT_BYTES`). Tiled assets are written as
`{ "pixelforge-pending-tiles": true, w, h, tileSize, tiles: [key | null] }`
and only when every tile is already stored for this draft; on read they are
resolved from the tiles of the stored draft. `readDraft` prefers a snapshot
only when its `localRevision` is strictly newer than the stored pointer, and
then re-bases it onto the stored revision. A completed save removes the
snapshot only if its token matches.

### Render cache database

`pixelforge-layer-cache` (`src/persistentLayerCache.ts`) has stores `blobs`
and `meta` (`keyPath: 'id'`, value `{ id, bytes, used, w, h, tag? }`). It
holds lossless PNGs of expensive filtered layers and one reopen-preview slot
(`pixelforge:presented-latest`, tagged with the composite-equivalence key).
Budget: 1 GiB desktop, 256 MiB mobile, 0 (disabled) on low-memory devices;
LRU eviction. It is a cache: losing it never loses work.

## Tiled assets

Owner: `src/tiledAssets.ts`. Contract:
[`tiled-layer-assets-contract.md`](./tiled-layer-assets-contract.md).

| Property | Value |
| --- | --- |
| When used | `addAsset` stores canvases of at least 1024 × 1024 px (`TILED_ASSET_MIN_PIXELS`) tiled |
| Tile size | 256 × 256 (`TILE_SIZE`); edge tiles are smaller |
| Grid | `ceil(w / 256) × ceil(h / 256)` cells, row-major; `null` = fully transparent tile |
| Tile | `AssetTile = { key, blob }`, `blob` a non-empty `image/png` ≤ 1 MiB (`MAX_TILE_BYTES`) |
| Tile key | 128-bit content hash of the tile's RGBA words and dimensions: 32 lowercase hex characters (`TILE_KEY_PATTERN = /^[0-9a-f]{32}$/`), computed by `hashTilePixels` |
| Sharing | A tab-wide index (`knownTile` / `internTile`) makes equal pixels share one immutable tile object across layers and history steps |
| Asset fingerprint | 64-bit hash of the ordered tile keys, used by caches |
| Persistence | Local drafts store each distinct tile once (format 4). Project files and cloud flatten to one PNG per asset. |

Tile keys are computed in the editor, never trusted from imported files; draft
tiles are verified against their SHA-256 on read.

## Image and file exports

Images are always encoded from a rendered canvas. Original EXIF/GPS data and
source ICC profiles are never copied, and File Info is never embedded. See
[`export-contract.md`](./export-contract.md) and
[`metadata-privacy-contract.md`](./metadata-privacy-contract.md).

### Raster and document exports (Export dialog)

`EXPORT_FORMATS = ['png', 'jpeg', 'webp', 'psd', 'pdf']` in `src/export.ts`;
the dialog (`src/ExportDialog.tsx`) adds layered SVG.

| Format | MIME | Encoder | Notes |
| --- | --- | --- | --- |
| PNG | `image/png` | `canvas.toBlob` | Lossless, alpha kept, no quality control. |
| JPEG | `image/jpeg` | `canvas.toBlob` | Quality 1–100; white matte under transparency. |
| WebP | `image/webp` | `canvas.toBlob` | Quality 1–100; fails visibly if the browser cannot encode WebP. |
| PSD | `image/vnd.adobe.photoshop` | `src/psdExport.ts` | Flattened 8-bit RGB + alpha composite; no layers, masks, profile or metadata. ≤ 16 MP, ≤ 30,000 px side. |
| PDF | `application/pdf` | `src/pdfExport.ts` | One page with one JPEG image XObject; ≤ 16 MP, ≤ 30,000 px side. |
| SVG | `image/svg+xml` | `src/svgDocumentExport.ts` | Layered: shapes/paths as vectors, text as `<text>`, groups as `<g>`, pixel layers and layers with effects SVG cannot express as embedded cropped PNGs. Layers that change the pixels below them (adjustment layers, clipping, unsupported blend modes) force everything up to the topmost such layer into one flattened base image. |

`encodeImage` rejects a browser that silently falls back to another MIME type.
JPEG and WebP accept a target size of 1 KB–64 MB (`MIN_/MAX_EXPORT_TARGET_BYTES`);
`encodeImageForTarget` binary-searches quality and reports `targetMet` rather
than shrinking dimensions. An export-only colour-profile conversion
(`convertCanvasProfile`) may be applied; the document is unchanged. Named
artboards export their own rectangle.

### Other outputs

| Output | Filename / type | Module | Shape |
| --- | --- | --- | --- |
| History batch export | ZIP (store) of rendered history states + `<stem>-manifest.json` | `src/batch.ts` | `BatchManifest { application: 'pixelforge-photo-editor', format, quality, colorProfile, documentMetadata, snapshotCount, documentName, generatedAt, metadata, entries: [{ file, historyIndex, width, height, bytes }] }`; encoded output capped at 256 MiB (`MAX_BATCH_EXPORT_BYTES`). |
| Multi-input image batch | ZIP + `pixelforge-batch-manifest.json` | `src/imageBatch.ts` | `BatchImageManifest { application, kind: 'multi-input-image-export', format, quality, sourceCount, exportedCount, failedCount, generatedAt, metadata, entries, failures, action? }`. |
| Saved selection | `<name>.pixelselection` (`application/json`) | `src/savedSelections.ts` | `SavedSelectionBook { version: 1, selections: [...] }` (≤ 32). Colour-mask selections cannot be saved this way; they stay in the project. |
| Tool presets | `pixelforge-tool-presets.json` | `src/toolPresets.ts` | `{ format: 'pixelforge-tool-presets', version: 1, presets: ToolPreset[] }`. |
| Copy SVG | clipboard text | `src/svgExport.ts` | Standalone SVG of one path/rectangle/ellipse/polygon layer. |
| Copy CSS | clipboard text | `src/cssExport.ts` | CSS rule for one text or vector layer. |

`src/download.ts` maps extensions to MIME types (`pixelforge` →
`application/zip`, `pixelselection` → `application/json`, `css` →
`text/css`, …) and sanitises suggested filenames.

## Cloud project payload

Owner: `src/cloud.ts`. Opt-in only, for signed-in users. Contracts:
[`cloud-conflict-contract.md`](./cloud-conflict-contract.md),
[`cheaply-auth-optional.md`](./cheaply-auth-optional.md).

Base URL `https://marketplace.cheaply.fr/marketplace/api/photoeditor`. All
requests use `credentials: 'include'` (the Marketplace session cookie),
`cache: 'no-store'` and a 30 s timeout. POST bodies are JSON sent as
`Content-Type: text/plain`.

| Call | Request | Validated response |
| --- | --- | --- |
| Session | `GET ?action=session` | `{ authenticated: false }` or `{ authenticated: true, user: { id, name } }` |
| List | `GET` | `{ projects: [{ id, name, updatedAt, generation, bytes }] }`, ≤ 30 entries, `bytes` ≤ 64 MiB |
| Open | `GET ?id=<id>` | `{ id, generation, document }`; `document` goes through `validateDraft` |
| Save | `POST { action: 'save', id, generation, document }` | `{ id, generation }` |
| Delete | `POST { action: 'delete', id, generation }` | `{ deleted: boolean }` |

`id`, `generation` and `owner` are opaque strings of 1–160 characters with no
control characters. A new project uses a fresh `crypto.randomUUID()` and
generation `'0'`. HTTP `409` becomes `CloudConflictError`.

The uploaded `document` is `cloudDocumentValue()`: the persisted history
window chosen with flattened accounting, tiled assets flattened to PNG data
URLs, then `stripPrivateMetadata` removes `metadata` (File Info) and all audio
annotations (clips and markers). Assets travel inline as data URLs inside the
JSON. The returned `{ id, generation }` plus the member id become the local
`Draft.cloud` link.

## Browser storage keys

All values are best-effort preferences: reads tolerate missing, malformed or
blocked storage, and editing works without them. None contains image data.

### `localStorage`

| Key | Owner | Value |
| --- | --- | --- |
| `pixelforge:last-draft` | `src/drafts.ts`, `src/HomePage.tsx` | Last opened draft UUID |
| `pixelforge:guest-avatar` | `src/AccountMenu.tsx` | Random UUID seeding the signed-out avatar |
| `cheaply.analytics.consent.v1` | `src/Analytics.tsx` | `granted` \| `denied` |
| `pixelforge.brush-presets.v1` | `src/brushPresetLibrary.ts` | User brush presets (settings only) |
| `pixelforge.tool-presets.v1` | `src/toolPresets.ts` | Tool preset library |
| `pixelforge.type-presets` | `src/typePresets.ts` | Character/paragraph presets (`TYPE_PRESETS_VERSION = 1`) |
| `pixelforge.fonts.favourites.v1`, `pixelforge.fonts.recent.v1` | `src/fontLibrary.ts`, `src/useFontLibrary.ts` | Font family name lists |
| `pixelforge.actions.v1` | `app/page.tsx`, `src/actions.ts` | Recorded Action sets (`ACTIONS_VERSION = 1`; ≤ 32 sets, ≤ 64 steps) |
| `pixelforge.menu-preferences` | `src/menuPreferences.ts` | `{ version: 1, showDisabled, … }` |
| `pixelforge.screen-mode.v1` | `src/screenModes.ts` | Screen mode id |
| `pixelforge.sidebar-open-panels` | `src/sidebarPanels.ts` | Open sidebar panels |
| `pixelforge.sidebar-collapsed-sections` | `src/sidebarSections.ts` | Collapsed sidebar sections |
| `pixelforge.tool-family-choices` | `src/toolFamilyChoices.ts` | Last tool chosen per flyout family |
| `pixelforge.toolbar-preferences` | `app/page.tsx`, `src/toolbarPreferences.ts` | Toolbar preference envelope (`TOOLBAR_PREFERENCES_VERSION = 1`) |
| `pixelforge.toolbar-columns`, `pixelforge.toolbar-density`, `pixelforge.toolbar-hidden-categories`, `pixelforge.toolbar-category-order` | `app/page.tsx` | Individual toolbar settings, written alongside the envelope |
| `pixelforge.tool-shortcuts`, `pixelforge.command-shortcuts` | `app/page.tsx`, `src/toolShortcuts.ts`, `src/commandShortcuts.ts` | Custom shortcut maps (version 1) |
| `pixelforge.last-filter` | `app/page.tsx`, `src/lastFilter.ts` | Last applied filter type |

### `sessionStorage`

| Key | Value |
| --- | --- |
| `pixelforge:pending-draft:<draftId>` | Write-ahead draft snapshot (≤ 4 MiB); see above |

### Other browser stores

| Store | Name |
| --- | --- |
| IndexedDB | `pixelforge-documents` (drafts), `pixelforge-layer-cache` (render cache) |
| Cache Storage | `pixelforge-shell-v3` (app shell), `pixelforge-fonts-v1` (font files) |
| Web Locks | `pixelforge:draft-open:<draftId>` (shared) |

Names such as `pixelforge.composite-cache` or `pixelforge.draft-preview` are
`performance.mark` names for diagnostics, not storage keys.

## `/release.json` and readiness probes

Written at build time by `scripts/write-release.mjs` into `dist/`:

```json
{
  "application": "pixelforge-photo-editor",
  "version": "0.1.512",
  "channel": "release",
  "commit": "<40 lowercase hex characters>",
  "builtAt": "2026-01-01T00:00:00.000Z"
}
```

| Field | Rule (`scripts/release-version.mjs`) |
| --- | --- |
| `version` | main deploy: `<major>.<minor>.<GITHUB_RUN_NUMBER>`; PR: `<package version>-pr.<n>+<sha7>`; other CI: `<package version>-ci.<run>+<sha7>`; local: `<package version>-dev+<sha7>` |
| `channel` | `release` \| `pr` \| `ci` \| `dev` |
| `commit` | Full SHA (`GITHUB_SHA`, else `git rev-parse HEAD`); the build fails without one |
| `builtAt` | ISO 8601 build time |

`/api/readyz.json` is `{ "ready": true, ...release }`; Firebase rewrites
`/health` and `/api/readyz` to it. The service worker never caches either
file. The same version and commit are baked into the bundle
(`__PIXELFORGE_BUILD_VERSION__`, `__PIXELFORGE_BUILD_COMMIT__`), and
`src/releaseStatus.ts` compares them with the live files. See
[`operations.md`](./operations.md).

## Versioning and migration rules

### Rules

1. **Fail closed on the unknown.** `validateDraft` accepts only `version` 1 or
   2 and throws `Unsupported project version` otherwise. Unknown storage
   formats, manifest kinds and bundle versions are rejected, never guessed.
2. **Add fields as optional.** New `Frame`, `Layer` and `Settings` fields are
   optional; readers treat a missing field as the legacy default. This keeps
   drafts written by older builds readable without a version bump, and lets
   older builds read newer drafts as long as they do not depend on new fields.
3. **Normalise at the persistence boundary.** `validateDraft` fills defaults
   so the UI and renderer always see complete records.
4. **Migrate on read, rewrite on save.** Old records are converted in memory;
   the next successful save writes the current format.
5. **Bump a version only for a breaking change**, and register a migration
   for the old one (`DRAFT_MIGRATIONS` in `src/drafts.ts`). Avoid IndexedDB
   schema bumps: they block tabs running older builds.

### Draft document migrations (`src/drafts.ts`)

| From | Migration |
| --- | --- |
| `version: 1` | `DRAFT_MIGRATIONS[1]`: each history entry (a flat `Shot { url, w, h }`) becomes a frame with one `raster` layer named `Background` (72 ppi `imageSize`); identical URLs share one asset; the old global brightness/contrast/saturation/blur/filter settings move into the layer's `adjustments`; the result has `version: 2` and `migrated: true`. |
| `version: 2` without newer fields | `validateDraft` normalisation: `effectiveAdjustments` (Levels, colour balance, curves and other adjustment fields), `effectiveBrushPressureSettings`, default `mixerBrush` / `historyBrush` / `artHistoryBrush`, `effectiveImageSize` (72 ppi), `normalizeLayerSelection` (`selectedLayerIds`), `effectiveTextLayer` (text defaults such as horizontal orientation), `normalizeDocumentMetadata`, `normalizeAudioClips`. |
| Unsupported RAW photo metadata | Rejected (`Saved document is not supported`) if `adjustments.photoAdjustments` is invalid. |

### Storage-format migrations

| Source | Handling |
| --- | --- |
| IndexedDB format 1 (inline `Draft`) | Read, validated, rewritten as format 3/4 on next save. |
| IndexedDB format 2 (chunked bundle) | Checksum verified, decoded, validated; next save writes format 3/4 and deletes the chunks in the same transaction. |
| IndexedDB format 3 ↔ 4 | Chosen per save by whether any asset is tiled. Drafts without tiled assets stay format 3 so builds that only know format 3 can still read them; such builds do not recognise a format 4 pointer and fail closed. |
| `sessionStorage` snapshot without `token` | Still read (pre-token implementation); cleared by revision comparison instead of token. |
| Project file v1/v2 JSON | Read via `validateDraft` (only for `.json` names or `application/json` files, or when passed as a string). |
| Project file v3 ZIP | Current. `document.json` is a version 2 `Draft`, so all `Draft` migrations apply. |
| Cloud documents | `validateDraft` on open; versions 1 and 2 accepted. |

### Other versioned envelopes

| Envelope | Constant | Value |
| --- | --- | --- |
| Draft document | `CURRENT_DRAFT_VERSION` | 2 |
| Project bundle | `PORTABLE_BUNDLE_VERSION` | 3 |
| Draft storage manifest | `DRAFT_MANIFEST_FORMAT` / `DRAFT_TILED_MANIFEST_FORMAT` | 3 / 4 |
| Legacy draft bundle | `DRAFT_BUNDLE_VERSION` | 1 |
| Rich text runs | `RICH_TEXT_VERSION` | 1 |
| Saved selection book | `SavedSelectionBook.version` | 1 |
| Actions | `ACTIONS_VERSION` | 1 |
| Spot Healing / Patch / Content-Aware Fill, Move, Scale | `SPOT_HEALING_VERSION`, `PATCH_TOOL_VERSION`, `CONTENT_AWARE_VERSION`, `CONTENT_AWARE_MOVE_VERSION`, `CONTENT_AWARE_SCALE_VERSION` | 1 |
| Generate Image / Prompt to Edit | `GENERATE_IMAGE_VERSION`, `PROMPT_TO_EDIT_VERSION` | 1 |
| Preferences | `TOOLBAR_PREFERENCES_VERSION`, `TOOL_SHORTCUTS_VERSION`, `COMMAND_SHORTCUTS_VERSION`, `MENU_PREFERENCES_VERSION`, `TOOL_FAMILY_CHOICES_VERSION`, `TYPE_PRESETS_VERSION` | 1 |
| Layer filter cache key | `LAYER_FILTER_CACHE_KEY_VERSION` | 1 |
| Tiled render protocol | `TILED_RENDER_PROTOCOL_VERSION` | 1 |
| Font assets | `FONT_ASSET_VERSION` (generated) | content hash, appended as `?v=` to font URLs |
| Service worker caches | `CACHE_NAME` / `FONT_CACHE_NAME` in `public/sw.js` | `pixelforge-shell-v3` / `pixelforge-fonts-v1` |

When you change a persisted shape, update the validator, add a pure test for
old and new inputs (see [`testing.md`](./testing.md)), and update this file
and the matching contract.
