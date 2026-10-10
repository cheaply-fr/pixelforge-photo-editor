# Rendering and sync contract

PixelForge is a local-first editor. Canvas edits render asynchronously on the
client with Canvas2D and publish the newest completed frame; stale renders are
dropped. Anonymous images and edits stay in the browser, and drafts autosave
to IndexedDB with a revision check for multi-tab conflicts.

Authenticated cloud projects use explicit request/response saves and opens.
They are whole-project JSON operations with generation-based conflict handling,
not a pixel stream. The editor therefore remains usable offline and does not
upload anonymous work in the background.

Progressive large-image rendering is a separate performance milestone. When
worker capability is available, the committed visible adapter uses a worker,
OffscreenCanvas and bounded tiles internally for the explicit local effect
allow-list (Blur More, Box/Gaussian, Lens, Motion, Shape, Smart, Surface and
Fragment), but the worker still publishes a full-frame result; it does not stream partial pixels
or remove every full-frame allocation.
For eligible blur renders the worker/document path also sends one validated
`tiled-telemetry` envelope before the owned result. It contains only effect,
tile geometry, byte-budget and cache counters, and is exposed as local render
status diagnostics; superseded or cancelled request telemetry is dropped.
Unsupported effects and interactive overrides remain on the full-frame or
main-thread paths. If realtime collaboration becomes a product requirement, it
must be an explicit opt-in for authenticated projects, send version or
validated operation deltas through a durable session service, queue offline
operations in IndexedDB, and preserve conflict recovery. Anonymous editing
must remain fully local.
