# New document contract

`File → New…` opens a dialog for a document of any allowed size. The existing
`New white document` (Ctrl+N) and `New transparent document` commands are
unchanged and still create an instant 1200×800 document.

- **Size:** whole pixels, 1–16,000 per side and at most 16 megapixels, the
  same limits as Canvas Size. Fields accept digits only; invalid values show a
  specific message and disable Create.
- **Presets:** Default 1200×800, HD 1920×1080, 4K UHD 3840×2160, Square
  2048×2048, Social portrait 1080×1350, Poster 2:3 2646×4096 and A4 at 300 ppi
  2480×3508. Editing a size selects Custom; Swap exchanges width and height.
- **Background contents:** White, Black, Background colour (the current
  background swatch) or Transparent.
- **Name:** 1–160 characters, used as the document name.

Creating a document goes through the same path as the other new-document
commands: a new draft ID, fresh history, the document fitted to the window,
and local persistence across reload.

Evidence: `src/newDocument.ts` with `tests/new-document.test.mjs` (parsing,
limits including 16000×1001 rejected for 16 MP, preset validity, background
fills, summary); `tests/browser/new-document.spec.ts` on desktop and mobile
(preset 2646×4096 black poster with name and reload, custom size with swap and
transparency, invalid-size messages and Escape cancel, background-colour fill
and the unchanged instant command, and non-overlapping layout).
