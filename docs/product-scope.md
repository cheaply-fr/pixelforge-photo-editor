# PixelForge product direction

User requirements, updated 2026-10-02. The demand research is in product-research.txt.

PixelForge is a free, publicly accessible photo editor. Authentication is optional and must reuse the existing Cheaply Marketplace customer session. Anonymous work must survive reloads and bookmarked document URLs. Signed-in users need a project library for reopening and continuing their work. Discarding a draft returns to a public home page that promotes real, available capabilities.

The long-term target is a professional image editor with Photoshop-class breadth. This is a staged engineering program, not a claim that the current single-canvas editor has professional parity. The original ten-feature research shortlist is now input to this broader authorized direction.

## Delivery order and acceptance

1. Reliable foundation: tested Google Cloud releases, anonymous editing, autosave, honest save/error states, recoverable project format, bookmarks, home page, discard action, existing-session sign-in, private project library.
2. Document engine: true editable raster, text and vector layers; order, visibility, locking, duplication, opacity and blend modes; groups; masks; undoable document commands; portable project import/export. Reload must preserve every editable property.
3. Precision editing: numeric resize/canvas size/crop and presets, free transform, rectangular/elliptical/lasso selections, magic wand, feather/invert selections, guides/snapping, eyedropper, configurable brushes, clone/heal, gradients, vector shapes and editable typography.
4. Nondestructive image work: adjustment layers, Levels, RGB/per-channel Curves and Color Balance, deterministic Sharpen/Add Noise, masks, filter previews, smart-object-style linked sources, before/after comparison. Advanced filter families and large images still need tiled rendering, workers and bounded undo memory.
5. Production workflows: local PNG/JPEG/WebP export with explicit quality, encoded-byte preview and bounded target-size search for JPEG/WebP are implemented; rendered exports omit source EXIF/GPS metadata and color profiles by construction; an installable/offline app shell caches the static editor after an online visit while keeping cloud calls online-only. Local history and multi-input batch image export are active with bounded inputs, per-file failure reporting, cancellation/progress, sanitized names and privacy manifests. HEIC/HEIF and TIFF imports are conditional on the browser decoder and explicitly flattened with metadata loss; PSD/PSB and camera RAW remain rejected with develop/flatten-first guidance. Metadata editing/privacy controls, layered PSD interoperability, lossless camera-format round trips and full offline cloud/project workflows remain planned. Keyboard focus and reduced-motion contracts are covered on desktop and mobile; pen support remains staged.
6. Advanced automation: deterministic local edge-connected background removal is active as a nondestructive mask workflow, and Mask Brush/Mask Eraser provide bounded local repair of false positives and holes while preserving source pixels. Semantic background removal, automatic hair/edge refinement, object cleanup and optional AI tools remain gated on licensing, quality, privacy and sustainable free-operation evidence.

## Release gates

No decorative controls presented as working tools. Every implemented feature (including each tool, menu command, dialog branch, filter effect, export option and persisted setting) ships with extensive tests: valid and boundary inputs, representative pixel/alpha or geometry assertions, undo/cancel behavior, malformed/error cases, keyboard and pointer/touch access, desktop and mobile browser acceptance, local reload/bookmark and project export/import round trips, and a documented performance or large-image check where applicable. Use versioned documents and migrations, private-project authorization tests, concurrent-save conflict protection, storage failure/recovery tests and desktop/mobile browser acceptance. CI must verify the deployed revision, not only build successfully. Cloud project storage must be owner-scoped, free to end users and separate from anonymous local storage. Do not silently upload existing local photos upon sign-in.

Current implementation status is recorded in the PR and deployment evidence; this document is a direction and acceptance contract, not a completion checklist.

Reference architecture: Adobe describes editable masks, adjustment layers and smart filters as complementary nondestructive mechanisms: https://helpx.adobe.com/photoshop/using/nondestructive-editing.html. PixelForge needs a structured document engine to provide equivalent behaviors.
