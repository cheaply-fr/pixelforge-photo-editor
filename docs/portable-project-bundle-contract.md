# Portable editable project bundle v3

PixelForge v3 uses a bounded ZIP **store** archive for editable project exchange. The archive is self-contained and can be read without a compression runtime:

```
manifest.json
document.json
assets/<stable-id>.png
```

`manifest.json` declares `kind: "pixelforge-project"`, `version: 3`, the document checksum and byte length, and a sorted asset table. Every asset entry includes its stable UUID, exact archive path, SHA-256 checksum, encoded byte length, and PNG dimensions. The archive byte length is also recorded. `document.json` retains the v2 editable document shape (`version`, name, settings, full undo history, masks, vectors, layers, groups, selections and metadata); only its `assets`, `cloud`, and `localRevision` fields are moved or removed at this boundary. Source URLs are reconstructed as PNG data URLs when imported.

The writer accepts a validated v1 or v2 JSON project. v1's single-image history is migrated by the existing `validateDraft` migration before assets are emitted, so old project files remain importable. Older versions saved **Download project file** as plain JSON under the same `.pixelforge` name, and browsers report no (or a generic) MIME type for that extension, so the reader decides by content, not by name or type: bytes starting with the ZIP signature `PK` are read as a v3 bundle, and bytes starting with `{` (after an optional UTF-8 byte order mark and whitespace) as a v1/v2 JSON project, still within the 64 MiB JSON limit and through the same validator. New v3 files always use the v2 editable document model internally and preserve every history frame and editable property.

The reader fails closed before returning a document. It limits the archive to 1 GiB, 4,098 entries (manifest, document and at most 4,096 assets), 64 MiB per JSON file, 80 MiB per PNG, 16,000 × 16,000 pixels and 16 megapixels per image. It requires one ZIP disk, matching central/local names, no ZIP64, no comments, no data descriptors, UTF-8 names, method 0 (store), and no encryption. Absolute paths, empty or `.`/`..` path segments, control characters, duplicate names, unexpected entries, missing assets, malformed PNG headers, dimension mismatches, CRC errors and SHA-256 mismatches are rejected. The document is passed through the normal v2 validator after asset reconstruction.

The store method is intentional: browser-produced PNG bytes remain unchanged, and imports do not execute or trust archive paths. A portable file is an editable interchange copy; local IndexedDB revision pointers and cloud ownership links are storage metadata and never leave the browser. Cloud save and deployment are separate flows.
