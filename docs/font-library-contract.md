# Font library contract

PixelForge ships a self-hosted, open-licensed font library of **146
families** (135 text families plus 6 icon fonts and 5 symbol fonts) next to
the four system families (`Arial`, `Georgia`, `Courier New`, `Verdana`).
Every file is same-origin under `/fonts/`, so the hosting CSP keeps
`font-src 'self'` unchanged. No font provider, CDN or upload is involved.
Fonts load only when something needs them.

## Catalogue

| Category | Families | Files on disk |
| --- | --- | --- |
| Sans serif | 29 (Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans 3, Noto Sans, Ubuntu, IBM Plex Sans, Atkinson Hyperlegible, …) | 3.49 MiB |
| Serif | 19 (Merriweather, Playfair Display, Lora, PT Serif, EB Garamond, Cormorant Garamond, Source Serif 4, Fraunces, Cinzel, Ultra, …) | 2.52 MiB |
| Slab serif | 7 (Roboto Slab, Arvo, Zilla Slab, Josefin Slab, Bitter, Crete Round, Alfa Slab One) | 0.31 MiB |
| Display | 18 (Bebas Neue, Anton, Abril Fatface, Lobster, Bangers, Bungee, Press Start 2P, Creepster, Special Elite, Orbitron, Monoton, …) | 0.54 MiB |
| Rounded | 6 (Fredoka, Comfortaa, Baloo 2, Varela Round, Nunito, Quicksand) | 0.31 MiB |
| Handwriting & script | 22 (Dancing Script, Pacifico, Caveat, Great Vibes, Indie Flower, Amatic SC, Permanent Marker, Rock Salt, …) | 1.04 MiB |
| Monospace | 12 (Roboto Mono, Source Code Pro, JetBrains Mono, Fira Code, IBM Plex Mono, Ubuntu Mono, Courier Prime, VT323, …) | 0.66 MiB |
| Condensed | 9 (Oswald, Barlow Condensed, Roboto Condensed, Fjalla One, Teko, Big Shoulders Display, …) | 0.47 MiB |
| Decorative | 13 (Cinzel Decorative, UnifrakturMaguntia, Pirata One, Bungee Shade, Rye, Nosifer, Codystar, …) | 0.48 MiB |
| Icons | Material Symbols Outlined / Rounded (4,301 named icons each), Font Awesome Free Solid (1,422), Regular (169), Brands (572), Weather Icons (177) | 0.95 MiB |
| Symbols & signs | Noto Sans Symbols, Noto Sans Symbols 2 (dingbats, arrows, chess, braille), Noto Sans Math, Noto Music, Noto Emoji (monochrome) | 1.25 MiB |

The authoritative list is `scripts/font-catalog.mjs` (input) and the
generated registry `src/fontLibrary.generated.ts`.

**Deploy size:** 412 font files, **12.02 MiB** added to the hosting deploy
(plus ~0.5 MiB of licence texts and glyph metadata). Nothing of that is in the
JavaScript bundle except the registry (~110 KB raw, ~18 KB gzip, shared by the
main and render-worker chunks). A user pays only for what they use: the
median Latin regular face is ~26 KB; the largest single icon/symbol files are
Material Symbols Rounded (365 KB), Outlined (316 KB) and Noto Emoji chunks.

Subsetting rules (enforced by `scripts/lib/font-meta.mjs` and the pure tests):

- Text families ship the Latin and Latin-Extended subsets; Cyrillic and Greek
  are added for a few multilingual families (Inter, Roboto, Open Sans, Noto
  Sans/Serif, PT Sans/Serif, Ubuntu, Montserrat) where cheap.
- Weights are 400 and 700 (or the nearest single weight). 51 families use
  the Fontsource *variable* `wght` file, which covers both weights in one file.
- Italics ship only for sans and serif families, Latin subset only.
- Icon and symbol fonts ship one regular face whose weight descriptor covers
  every weight, so bold text layers never synthesise fake-bold icons.

## Licences and sources

Only SIL OFL 1.1, Apache 2.0, Ubuntu Font Licence 1.0 and CC0 are accepted;
`scripts/sync-font-library.mjs` throws for anything else. Current mix: 135
OFL-1.1, 9 Apache-2.0 (Roboto Slab, Ultra, Luckiest Guy, Special Elite,
Satisfy, Homemade Apple, Yellowtail, Permanent Marker, Rock Salt), 2 UFL-1.0
(Ubuntu, Ubuntu Mono).

- Text, Material Symbols and Noto fonts come from pinned `@fontsource/*` and
  `@fontsource-variable/*` npm packages (exact versions in `package.json`
  `devDependencies`), which redistribute the Google Fonts files with their
  licences. Fontsource records Material Symbols as OFL-1.1 (Google also
  publishes it under Apache 2.0); the shipped licence is the package's.
- Font Awesome Free 7 comes from `@fortawesome/fontawesome-free`. The font
  files are SIL OFL 1.1; the icon designs are CC BY 4.0, so the Glyphs panel
  shows the attribution "Font Awesome Free by Fonticons, Inc. … icon
  designs: CC BY 4.0" whenever a Font Awesome font is browsed, and
  `licenses/ATTRIBUTIONS.txt` repeats it. Brand icons remain trademarks of
  their owners.
- Weather Icons comes from the `weather-icons` npm package. Its `license`
  field (MIT) covers the CSS; the font is SIL OFL 1.1 per the package README,
  so the build writes an explicit OFL licence file for it. It is the only
  WOFF (not WOFF2) file, because the package has no WOFF2 build.
- game-icons.net and other CC BY 3.0 / non-commercial or unclear-licence icon
  sets are deliberately not included.

At build time each family's full licence text is written to
`/fonts/licenses/<id>.txt`, plus `/fonts/licenses/ATTRIBUTIONS.txt` listing
family, licence, package@version, upstream and copyright line. The picker and
Glyphs panel link to the licence of the font being viewed.

## Build pipeline

- `npm run fonts:sync` resolves the catalogue against `node_modules`
  (available subsets, weights, styles, variable axes, licence, byte sizes)
  and regenerates the committed `src/fontLibrary.generated.ts`. Run it after
  changing the catalogue or bumping a font package.
- `scripts/copy-fonts.mjs` runs before `vite build` and `vite` (dev). It
  re-resolves the catalogue and **fails the build** if the committed registry
  no longer matches the packages, then copies the files to the generated,
  git-ignored `public/fonts/` together with licences and per-family glyph
  metadata (`/fonts/meta/<id>.json`: cmap coverage ranges, and for icon fonts
  `[name, codepoint, search terms]`). Metadata comes from a small
  dependency-free WOFF/WOFF2 table reader (`scripts/lib/font-tables.mjs`):
  `cmap` for coverage and GSUB ligatures for Material Symbols names; Font
  Awesome names/tags come from its `icon-families.json`, Weather Icons names
  from its CSS.
- All URLs carry `?v=<FONT_ASSET_VERSION>` (a hash of the registry), and
  `firebase.json` serves `/fonts/**` with an immutable one-year cache.

## Loading

`src/fontLoader.ts` owns a page-wide (and render-worker-wide) loader bound to
`document.fonts` / `self.fonts`:

1. Nothing is registered or fetched at page load.
2. The first request for a family registers its `FontFace`s (with
   `unicode-range` per subset) and calls `FontFaceSet.load(font, text)` with
   the distinct characters needed, so only matching subset files download.
3. Requests are deduplicated, run at most four at a time, and explicit
   choices (high priority) overtake picker previews (low priority). A load
   times out after 10 s and the text renders with the fallback; if the face
   still arrives, the loader reports it and the editor redraws.
4. `renderFrame` awaits `ensureTextLayerFonts` for every text layer before
   measuring or drawing, in both the main thread and the render worker, so
   on-screen renders and PNG/PSD/PDF/project-thumbnail exports use the loaded
   font. A render that had to fall back is not stored in the composite cache.

The service worker caches `/fonts/` responses on first use in a dedicated
`pixelforge-fonts-v1` cache, so a font (and the glyph metadata) used once
keeps working offline and survives shell-cache bumps.

## Fallback and portability

Text layers store only the family name. `validateFrame` accepts any bounded,
quote-free family name, so a project referencing a font this build does not
ship (or a future library change) stays openable and editable: it renders
with the browser fallback, the editor shows "Missing fonts: … Text stays
editable and renders with a fallback font.", the family select keeps the
value marked "(missing)", and Manage Missing Fonts lists it as
"Missing · fallback active". Tool settings, type-style presets and Update All
Text Layers still accept only system or library families. See also
[`font-fallback-contract.md`](./font-fallback-contract.md).

## Font picker

Every family control (Text tool, Layers panel, Update All Text Layers) is a
native `<select>` grouped by category — keyboard, touch and screen-reader
native, and backward compatible with existing projects and tests — plus an
**Aa** "Browse fonts" button opening the picker dialog:

- search across names, categories and tags (accent-insensitive);
- category filter, **Favourites** and **Recent** (stored per browser in
  `localStorage` under `pixelforge.fonts.favourites.v1` / `.recent.v1`; the
  editor works when storage is unavailable);
- a virtualised list (48 px rows, only visible rows plus overscan in the
  DOM); rows that stay visible for 300 ms fetch a low-priority preview face
  and then render their name (or sample glyphs for icon fonts) in that font;
- keyboard: ↓ from search focuses the list, ↑/↓/PageUp/PageDown/Home/End
  move, Enter chooses, **F** toggles favourite, Esc closes;
- a details strip with a live preview, licence link and load state.

## Glyphs, Icons & Symbols panel

Type → **Glyphs, Icons & Symbols…** (also a button in the Text tool panel)
opens a dialog that browses the current library font or any icon/symbol font:

- named icon fonts are searched by name and tags (exact name first, e.g.
  `home`, `heart`/`love`, `rain`);
- symbol and text fonts are browsed by Unicode block, and searched by block
  name, `U+2605`/`2605`, or the character itself; only glyphs a shipped face
  renders are listed; results are capped at 240 with a refine hint;
- clicking/tapping a glyph inserts it through `src/glyphInsert.ts`: the text
  tool's caret adapter (`registerTextCaretAdapter({ insertTextAtCaret })`,
  for the text-tool overhaul) when the active layer already uses that font;
  otherwise appended to the active text layer of the same family; otherwise a
  new text layer set in the glyph's font. Text layers are single-family, so an
  icon never renders in the wrong font;
- **Insert as: Shape** inserts the glyph and runs the existing Convert to
  Shape tracer (a bounded pixel-contour approximation, not font-outline
  fidelity; see [`convert-to-shape-contract.md`](./convert-to-shape-contract.md)).

## Tests

- `tests/font-library.test.mjs`: catalogue breadth per category; unique
  families/ids; allowed licences, attribution, exact pinned versions matching
  `node_modules`; the committed registry matches the packages and every face
  file exists with the recorded size; Latin-only italics and the size budget;
  face registrations (versioned URLs, unicode-range only for split fonts);
  icon names/tags searchable and present in the font cmap; WOFF/WOFF2 table
  reader; picker search/category/favourites/recent; stored-preference parsing;
  virtual window; portable family validation and missing-font detection;
  CSP/hosting/gitignore/build wiring.
- `tests/font-loader.test.mjs`: lazy registration, dedupe, concurrency and
  priority, failure/timeout/late arrival, text-layer font requests, glyph
  metadata parsing and Unicode-block search, unicode-range restriction,
  insertion adapter order, service-worker font cache.
- `tests/browser/font-library.spec.ts` (desktop + mobile): picker
  search/filter/favourite/recent/keyboard and live preview; no font files at
  page load and only the chosen family's files after choosing; canvas pixels
  change with the font and persist across reload; library font vs blocked
  (fallback) rendering pixel diff; unknown-font project import disclosure;
  Glyphs panel icon/symbol search and insertion into text layers; offline
  reuse after first use through the service worker.
