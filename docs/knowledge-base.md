# Help Center (knowledge base)

The Help Center is the user-facing documentation at
[photoeditor.cheaply.fr/help](https://photoeditor.cheaply.fr/help). It is built
from Markdown in `help/` into static pages under `dist/help/` by
`scripts/build-help.mjs`, which runs as part of `npm run build`. The editor links
to it from **Help** in the menu bar and from the contextual Help link in the
properties sidebar (`/help/tool/<tool-id>`).

Technical contracts for developers stay in `docs/*-contract.md`; the Help
Center explains features to people using the editor.

## Layout

| Path | What it holds |
|---|---|
| `help/categories.json` | Ordered categories: `id`, `title`, `icon`, `summary`. |
| `help/articles/<slug>.md` | One article per file. The file name is the URL: `/help/<slug>`. |
| `help/img/<name>.jpg` | Screenshots, captured by the shot specs. Never edit by hand. |
| `help/shots/*.shots.ts` | Playwright specs that drive the editor and save screenshots. |
| `help/shots/helpers.ts` | `openEditor`, `openSample`, `menu`, `selectTool`, `openPanel`, `highlight`, `shoot`, `dragOnCanvas`, `clickCanvas`. |
| `help/assets/` | `help.css` and `help.js` (search, mobile menu, contents highlight, screenshot zoom). |
| `scripts/build-help.mjs` | Validation and the static page generator. |
| `tests/help-center.test.mjs` | Pure checks over the real content (links, images, tool coverage). |
| `tests/browser/help-center.spec.ts` | Desktop and mobile browser checks of the built pages and the editor links. |

## Generated pages

- `/help`: home with search, "Start here" (articles with `featured: true`) and topic cards.
- `/help/category/<id>`: every article in a category.
- `/help/<slug>`: an article with breadcrumb, contents, related articles and previous/next links.
- `/help/tool/<tool-id>`: a redirect to the first article (by `order`) whose `tools` list names that tool.
- `/help/search-index.json`, `/help/tools.json` and `/sitemap.xml`.

The build fails if an article is invalid (see *Validation*), so a broken Help
Center can never deploy.

## Writing an article

```markdown
---
title: Stroke a selection
summary: Draw an outline along the edge of a selection with Edit > Stroke Selection.
category: selections
order: 40
level: beginner
keywords: [outline, border, edge, stroke]
tools: [select]
related: [make-a-selection, fill-a-selection]
updated: 2026-11-14
---

Intro paragraph: what it does and when you would use it.

![Stroke Selection dialog with a 12 px orange stroke](img/stroke-selection-dialog.jpg "The Stroke Selection dialog")

## Stroke a selection

1. Make a selection.
2. Choose **Edit > Stroke Selection…**.
3. …

## Options

| Option | What it does |
|---|---|
| Width | … |

> [!TIP]
> A short practical tip.
```

Front matter fields:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Sentence case. Task titles start with a verb ("Stroke a selection"). |
| `summary` | yes | One sentence, at most 220 characters. Shown in cards, search and the meta description. |
| `category` | yes | An `id` from `categories.json`. |
| `order` | no | Position in the category (lower first). Use steps of 10. |
| `level` | no | `beginner`, `intermediate` or `advanced`. |
| `keywords` | no | Words people search for that are not in the title, e.g. other apps' names for the feature. |
| `tools` | no | Palette tool ids (`src/toolPalette.ts`) this article documents. Every palette tool must be covered by some article. |
| `related` | no | Slugs of related articles. |
| `featured` | no | `true` to list under "Start here" on the home page. |
| `updated` | no | `YYYY-MM-DD` of the last content review. |

Markdown extras:

- Images must be `img/<name>.jpg` with alt text. An image alone in a paragraph
  becomes a figure; its title (`"…"`) becomes the caption.
- Callouts: a blockquote starting with `[!NOTE]`, `[!TIP]`, `[!WARNING]` or `[!IMPORTANT]`.
- Keys: `<kbd>Ctrl</kbd>+<kbd>Z</kbd>`. Write Windows/Linux keys; add "(<kbd>⌘</kbd> on Mac)" where it matters.
- Links to other articles use the bare slug: `[Layers panel](layers-panel)`, or
  `category/<id>` for a category. Links to the editor use `/editor`.
- Menu paths in bold with `>`: **Filter > Render > Light Rays…**.
- Do not use `# ` headings; the page title comes from front matter. Use `##` and `###`.

## Style

- Write for someone using the editor, not for developers. Explain what a feature
  does, when to use it and how, with numbered steps.
- Use the exact labels shown in the editor (check them on the live site).
- Every statement must be true of the live editor. Verify it by trying it, or in
  the source and the matching `docs/*-contract.md`. Do not document planned work.
- PixelForge offers bounded local approximations of some professional features.
  Say what they do; never claim parity with another product.
- Be honest about limits (sizes, formats, browser storage). Link to
  [Large documents](https://photoeditor.cheaply.fr/help/large-documents) or
  [Troubleshooting](https://photoeditor.cheaply.fr/help/troubleshooting) instead of repeating them.
- Use British/International spelling consistently with the existing articles ("colour", "customise")
  but keep UI labels exactly as written in the app (for example "Color Balance…").

## Screenshots

Screenshots come from shot specs so they can be re-captured whenever the UI changes:

```ts
import { test } from '@playwright/test';
import { menu, openEditor, openSample, shoot } from './helpers';

test('stroke-selection-dialog', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  // … make a selection, open the dialog …
  await shoot(page, 'stroke-selection-dialog', page.getByRole('dialog'));
});

test('stroke-selection-mobile @mobile', async ({ page }) => { /* phone viewport */ });
```

- One test per screenshot; the test title starts with the image name.
- `shoot(page, name)` saves the viewport; `shoot(page, name, locator)` crops to an element plus padding.
- `highlight(locator)` draws an orange ring to point at a control.
- Images are generated in the page by `openSample` (landscape, portrait or city).
  Never use personal photos, never sign in.
- Desktop shots are 1440×900; tag a test `@mobile` for a Pixel 7 viewport.

```bash
npm run help:shots                       # all shots, against production
npm run help:shots -- -g stroke-selection   # matching shots only
HELP_SHOTS_BASE_URL=http://127.0.0.1:4173 npm run help:shots   # against a local preview
```

Look at every image you capture before committing it.

## Validation

`npm run help:build` (and `npm run build`) fails when:

- front matter is missing a required field, has an unknown category or level, or a summary over 220 characters;
- a slug is not kebab-case or is duplicated;
- an image is missing, or has no alt text;
- an internal link, category link or `related` slug does not exist;
- a category has no articles, or uses an unknown icon;
- an article uses a `# ` heading or claims parity with Photoshop.

`tests/help-center.test.mjs` also checks that every palette tool has an article
and that every editor Help link resolves.

## Release

Help pages deploy with the editor on every merge to `main`. After deploying,
check `/help` and one article on the live site. Re-capture screenshots
(`npm run help:shots`) whenever a change alters the UI they show.
