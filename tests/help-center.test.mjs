import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  articleLinks,
  buildHelp,
  imageSize,
  loadHelp,
  paletteToolIds,
  parseFrontMatter,
  renderMarkdown,
  slugify,
  toolArticles,
  validateHelp,
} from '../scripts/build-help.mjs';

// Help Center content and generator (docs/knowledge-base.md).

test('front matter parses strings, numbers, booleans and lists', () => {
  const { data, body } = parseFrontMatter('---\ntitle: "Layers: basics"\norder: 20\nfeatured: true\nkeywords: [stack, "z order"]\n---\nBody\n');
  assert.deepEqual(data, { title: 'Layers: basics', order: 20, featured: true, keywords: ['stack', 'z order'] });
  assert.equal(body, 'Body\n');
  assert.throws(() => parseFrontMatter('No front matter'), /missing front matter/);
  assert.throws(() => parseFrontMatter('---\nnot a pair\n---\n'), /bad front matter line/);
});

test('slugs are stable kebab-case anchors', () => {
  assert.equal(slugify('Fill & Stroke: <code>Edit</code> menu'), 'fill-stroke-edit-menu');
  assert.equal(slugify('Café crème'), 'cafe-creme');
});

test('Markdown renders figures, callouts, anchors, tables and help links', () => {
  const { html, headings, text } = renderMarkdown(
    [
      '## Options',
      '',
      '![Dialog](img/dialog.jpg "The dialog")',
      '',
      '> [!TIP]',
      '> Hold Shift.',
      '',
      '## Options',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'See [layers](layers-panel#masks), [the editor](/editor) and [web](https://example.com).',
    ].join('\n'),
    { imageSizes: { 'dialog.jpg': { width: 800, height: 600 } } },
  );
  assert.deepEqual(headings.map((h) => h.id), ['options', 'options-1']);
  assert.match(html, /<figure><a class="zoomable" href="\/help\/img\/dialog.jpg"><img src="\/help\/img\/dialog.jpg" alt="Dialog" width="800" height="600"/);
  assert.match(html, /<figcaption>The dialog<\/figcaption>/);
  assert.match(html, /<aside class="callout callout-tip">[\s\S]*Tip<\/p><p>Hold Shift.<\/p>/);
  assert.match(html, /<div class="table-wrap"><table>/);
  assert.match(html, /href="\/help\/layers-panel#masks"/);
  assert.match(html, /href="\/editor"/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener"/);
  assert.doesNotMatch(text, /</);
});

test('internal links exclude images, anchors and external URLs', () => {
  assert.deepEqual(
    articleLinks('[a](layers-panel) [b](/help/curves#points) [c](#x) [d](https://x.y) ![e](img/e.jpg) [f](/editor) [g](category/layers)'),
    ['layers-panel', 'curves', 'category/layers'],
  );
});

test('image sizes are read from PNG and JPEG headers', () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90]);
  assert.deepEqual(imageSize(jpeg), { width: 400, height: 300 });
});

test('validation reports every class of broken content', () => {
  const errors = validateHelp({
    categories: [{ id: 'a', title: 'A', icon: 'rocket', summary: '' }, { id: 'empty', title: 'E', icon: 'nope', summary: '' }],
    images: [],
    articles: [
      { slug: 'one', file: 'one.md', title: 'One', summary: 'S', category: 'a', body: '# Title\n![](img/x.jpg) [x](missing) same as Photoshop', related: ['nope'] },
      { slug: 'Bad_Slug', file: 'Bad_Slug.md', title: '', summary: 'S', category: 'zzz', level: 'expert', body: '' },
    ],
  });
  for (const pattern of [/missing "title"/, /kebab-case/, /unknown category "zzz"/, /level must be/, /"# " headings/, /Photoshop parity/, /needs alt text/, /missing screenshot/, /broken link to "missing"/, /related article "nope"/, /unknown icon "nope"/, /"empty" has no articles/]) {
    assert.ok(errors.some((error) => pattern.test(error)), `expected ${pattern}`);
  }
});

test('the real Help Center content is valid', async () => {
  const help = await loadHelp('help');
  assert.deepEqual(validateHelp(help), []);
  assert.ok(help.articles.length >= 100, `at least 100 articles (found ${help.articles.length})`);
});

test('every palette tool has a Help Center article', async () => {
  const help = await loadHelp('help');
  const covered = toolArticles(help.articles);
  const palette = paletteToolIds(await readFile('src/toolPalette.ts', 'utf8'));
  assert.ok(palette.length > 60);
  const missing = palette.filter((tool) => !covered[tool]);
  assert.deepEqual(missing, [], `tools without an article: ${missing.join(', ')}`);
  const unknown = Object.keys(covered).filter((tool) => !palette.includes(tool));
  assert.deepEqual(unknown, [], `articles name unknown tools: ${unknown.join(', ')}`);
});

test('every Help page the editor and footer link to exists', async () => {
  const help = await loadHelp('help');
  const slugs = new Set(help.articles.map((article) => article.slug));
  const page = await readFile('app/page.tsx', 'utf8');
  const linked = [...page.matchAll(/'\/help\/([a-z0-9-]+)'/g)].map((match) => match[1]);
  assert.ok(linked.length >= 4);
  for (const slug of [...linked, 'troubleshooting', 'report-a-problem', 'privacy-and-your-data']) {
    assert.ok(slugs.has(slug), `/help/${slug} is linked but has no article`);
  }
  for (const image of help.images) assert.match(image, /^[a-z0-9]+(-[a-z0-9]+)*\.(jpg|png)$/, `${image} is kebab-case`);
});

test('the build writes pages, search index, tool redirects and sitemap', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pixelforge-help-'));
  try {
    const result = await buildHelp({ outDir: out, version: '9.9.9', builtAt: new Date('2026-01-02T00:00:00Z') });
    const help = await loadHelp('help');
    assert.equal(result.articles, help.articles.length);
    assert.ok(existsSync(join(out, 'help.html')), '/help resolves through help.html');
    assert.ok(existsSync(join(out, 'help', 'index.html')));
    const index = JSON.parse(await readFile(join(out, 'help', 'search-index.json'), 'utf8'));
    assert.equal(index.version, '9.9.9');
    assert.equal(index.articles.length, help.articles.length);
    const article = help.articles[0];
    const html = await readFile(join(out, 'help', `${article.slug}.html`), 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="https://photoeditor.cheaply.fr/help/${article.slug}">`));
    assert.match(html, /Help Center for version 9\.9\.9/);
    const tools = await readdir(join(out, 'help', 'tool'));
    const palette = paletteToolIds(await readFile('src/toolPalette.ts', 'utf8'));
    assert.equal(tools.length, palette.length);
    const brush = await readFile(join(out, 'help', 'tool', 'brush.html'), 'utf8');
    assert.match(brush, /http-equiv="refresh" content="0; url=\/help\/[a-z0-9-]+"/);
    const sitemap = await readFile(join(out, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/photoeditor.cheaply.fr\/help<\/loc><lastmod>2026-01-02<\/lastmod>/);
    for (const category of help.categories) assert.ok(existsSync(join(out, 'help', 'category', `${category.id}.html`)));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
