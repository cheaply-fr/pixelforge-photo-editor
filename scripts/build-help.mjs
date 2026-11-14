// Builds the PixelForge Help Center (/help) from Markdown articles in help/.
//
//   help/categories.json     ordered categories
//   help/articles/*.md       one article per file, with front matter
//   help/img/*               screenshots (npm run help:shots → help/shots/*.shots.ts)
//   help/assets/*            page CSS and script
//
// Output goes to dist/help/ as static pages that Firebase Hosting serves at
// clean URLs (/help, /help/<slug>, /help/category/<id>, /help/tool/<tool>).
// The pages work without the editor bundle and without JavaScript; the script
// only adds search, the mobile menu and the "On this page" highlight.
// Authoring rules: docs/knowledge-base.md.

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Rocket, FileImage, Layers, Lasso, Brush, Bandage, Type, PenTool, SlidersHorizontal, Sparkles, Crop, Workflow, Gauge, LifeBuoy, Search, ArrowRight, Menu, ChevronRight, ChevronLeft, BookOpen, Lightbulb, Info, TriangleAlert,
} from 'lucide-react';

const ICONS = { Rocket, FileImage, Layers, Lasso, Brush, Bandage, Type, PenTool, SlidersHorizontal, Sparkles, Crop, Workflow, Gauge, LifeBuoy, Search, ArrowRight, Menu, ChevronRight, ChevronLeft, BookOpen, Lightbulb, Info, TriangleAlert };

export const SITE = 'https://photoeditor.cheaply.fr';
const REQUIRED = ['title', 'summary', 'category'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CALLOUTS = { NOTE: 'Note', TIP: 'Tip', WARNING: 'Warning', IMPORTANT: 'Important' };
const CATEGORY_ICONS = {
  rocket: 'Rocket', file: 'FileImage', layers: 'Layers', lasso: 'Lasso', brush: 'Brush', bandage: 'Bandage',
  type: 'Type', pen: 'PenTool', sliders: 'SlidersHorizontal', sparkles: 'Sparkles', crop: 'Crop',
  workflow: 'Workflow', gauge: 'Gauge', lifebuoy: 'LifeBuoy',
};

export function icon(name, size = 20) {
  const component = ICONS[name];
  if (!component) throw new Error(`Unknown icon ${name}`);
  return renderToStaticMarkup(createElement(component, { size, 'aria-hidden': 'true', focusable: 'false' }));
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remove HTML tags, repeating until none are left, and drop any stray angle brackets. */
export function stripTags(html, replacement = '') {
  let text = String(html);
  for (let previous; previous !== text; ) {
    previous = text;
    text = text.replace(/<[^<>]*>/g, replacement);
  }
  return text.replace(/[<>]/g, replacement);
}

export function slugify(text) {
  return stripTags(text)
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse a `---` front matter block of `key: value` lines; `[a, b]` is a list. */
export function parseFrontMatter(source, file = 'article') {
  const text = source.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new Error(`${file}: missing front matter`);
  const data = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const pair = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`${file}: bad front matter line "${line}"`);
    let value = pair[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((item) => unquote(item.trim())).filter(Boolean);
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = Number(value);
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else {
      value = unquote(value);
    }
    data[pair[1]] = value;
  }
  return { data, body: text.slice(match[0].length) };
}

/** A front matter value as a list of strings. */
export function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === '' ? [] : [String(value)];
}

function unquote(value) {
  return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
}

/** Width and height of a PNG or JPEG file, or undefined. */
export function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return undefined;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

/** Read categories, articles and screenshot names from a help source folder. */
export async function loadHelp(root = 'help') {
  const categories = JSON.parse(await readFile(join(root, 'categories.json'), 'utf8'));
  const files = (await readdir(join(root, 'articles'))).filter((name) => name.endsWith('.md')).sort();
  const articles = [];
  for (const file of files) {
    const source = await readFile(join(root, 'articles', file), 'utf8');
    const { data, body } = parseFrontMatter(source, file);
    articles.push({ ...data, slug: basename(file, '.md'), file, body });
  }
  const images = existsSync(join(root, 'img')) ? (await readdir(join(root, 'img'))).filter((name) => /\.(png|jpe?g|svg|webp)$/i.test(name)) : [];
  return { root, categories, articles, images };
}

/** Internal help links an article body uses, as bare slugs (anchors removed). */
export function articleLinks(body) {
  const links = [];
  for (const match of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#|img\/)/.test(href) || href.startsWith('/editor')) continue;
    const slug = href.replace(/^\/help\/?/, '').replace(/#.*$/, '');
    if (slug) links.push(slug);
  }
  return links;
}

export function articleImages(body) {
  return [...body.matchAll(/!\[([^\]]*)\]\(img\/([^)\s]+)/g)].map((match) => ({ alt: match[1], name: match[2] }));
}

/** Every problem that would make the Help Center wrong or broken. */
export function validateHelp({ categories, articles, images }) {
  const errors = [];
  const categoryIds = new Set(categories.map((category) => category.id));
  const slugs = new Set();
  const imageSet = new Set(images);
  for (const article of articles) {
    const where = article.file;
    for (const field of REQUIRED) if (!article[field]) errors.push(`${where}: missing "${field}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(article.slug)) errors.push(`${where}: file name must be kebab-case`);
    if (slugs.has(article.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(article.slug);
    if (article.category && !categoryIds.has(article.category)) errors.push(`${where}: unknown category "${article.category}"`);
    if (article.level && !LEVELS.includes(article.level)) errors.push(`${where}: level must be one of ${LEVELS.join(', ')}`);
    if (article.summary && article.summary.length > 220) errors.push(`${where}: summary over 220 characters`);
    if (/^#\s/m.test(article.body)) errors.push(`${where}: do not use "# " headings; the title comes from front matter`);
    if (/photoshop parity|identical to photoshop|same as photoshop/i.test(article.body)) errors.push(`${where}: do not claim Photoshop parity`);
    for (const image of articleImages(article.body)) {
      if (!image.alt.trim()) errors.push(`${where}: image img/${image.name} needs alt text`);
      if (!imageSet.has(image.name)) errors.push(`${where}: missing screenshot img/${image.name}`);
    }
  }
  for (const article of articles) {
    for (const slug of articleLinks(article.body)) {
      if (!slugs.has(slug) && !slug.startsWith('category/')) errors.push(`${article.file}: broken link to "${slug}"`);
      if (slug.startsWith('category/') && !categoryIds.has(slug.slice(9))) errors.push(`${article.file}: broken category link "${slug}"`);
    }
    for (const slug of asList(article.related)) {
      if (!slugs.has(slug)) errors.push(`${article.file}: related article "${slug}" does not exist`);
    }
  }
  for (const category of categories) {
    if (!CATEGORY_ICONS[category.icon]) errors.push(`categories.json: unknown icon "${category.icon}"`);
    if (!articles.some((article) => article.category === category.id)) errors.push(`categories.json: category "${category.id}" has no articles`);
  }
  return errors;
}

/** Palette tool ids, read from the `PaletteToolId` union in src/toolPalette.ts. */
export function paletteToolIds(source) {
  const union = /export type PaletteToolId =([\s\S]*?);/.exec(source);
  if (!union) throw new Error('PaletteToolId not found in src/toolPalette.ts');
  return [...union[1].matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

/** Tool id → article slug, from each article's `tools` front matter. */
export function toolArticles(articles) {
  const map = {};
  for (const article of sortArticles(articles)) {
    for (const tool of asList(article.tools)) map[tool] ??= article.slug;
  }
  return map;
}

export function sortArticles(articles) {
  return [...articles].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));
}

/** Render an article's Markdown body; returns HTML, its h2/h3 outline and plain text. */
export function renderMarkdown(body, { imageSizes = {} } = {}) {
  const headings = [];
  const used = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const base = slugify(inner) || 'section';
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        if (depth === 2 || depth === 3) headings.push({ id, depth, text: stripTags(inner) });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      paragraph({ tokens }) {
        const meaningful = tokens.filter((token) => !(token.type === 'text' && !token.text.trim()));
        if (meaningful.length === 1 && meaningful[0].type === 'image') {
          const image = meaningful[0];
          const caption = image.title ? `<figcaption>${escapeHtml(image.title)}</figcaption>` : '';
          return `<figure>${imageTag(image.href, image.text, imageSizes)}${caption}</figure>\n`;
        }
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      image({ href, text }) {
        return imageTag(href, text, imageSizes);
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        if (/^https?:/.test(href)) return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener">${inner}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
        if (/^(#|mailto:|\/editor)/.test(href)) return `<a href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
        return `<a href="/help/${escapeHtml(href.replace(/^\/help\/?/, ''))}"${titleAttr}>${inner}</a>`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const callout = /^<p>\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/.exec(inner);
        if (!callout) return `<blockquote>${inner}</blockquote>\n`;
        const kind = callout[1];
        const iconName = { NOTE: 'Info', TIP: 'Lightbulb', WARNING: 'TriangleAlert', IMPORTANT: 'Info' }[kind];
        const content = '<p>' + inner.slice(callout[0].length);
        return `<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${icon(iconName, 18)}${CALLOUTS[kind]}</p>${content.replace(/^<p><\/p>\n?/, '')}</aside>\n`;
      },
      table(token) {
        const header = token.header.map((cell) => `<th${cell.align ? ` style="text-align:${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</th>`).join('');
        const rows = token.rows.map((row) => `<tr>${row.map((cell) => `<td${cell.align ? ` style="text-align:${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`).join('\n');
        return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(body, { async: false });
  if (typeof html !== 'string') throw new Error('Markdown rendering must be synchronous');
  const text = stripTags(html, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  return { html, headings, text };
}

function imageTag(href, alt, imageSizes) {
  const name = href.replace(/^img\//, '');
  const size = imageSizes[name];
  const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
  const src = href.startsWith('img/') ? `/help/${href}` : href;
  return `<a class="zoomable" href="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${dims} loading="lazy" decoding="async"></a>`;
}

/** The client search index: one record per article. */
export function searchRecord(article, rendered, category) {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: category?.title || article.category,
    keywords: asList(article.keywords),
    headings: rendered.headings.map(({ id, text }) => ({ id, text })),
    text: rendered.text.slice(0, 4000),
  };
}

function layout({ title, description, canonical, body, version, nav = '', pageClass = '' }) {
  const fullTitle = title === 'Help Center' ? 'PixelForge Help Center' : `${title} · PixelForge Help`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="theme-color" content="#17181d">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/help/assets/help.css?v=${escapeHtml(version)}">
<script src="/help/assets/help.js?v=${escapeHtml(version)}" defer></script>
</head>
<body class="${pageClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="kb-header">
  <button class="kb-menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="kb-nav">${icon('Menu', 20)}</button>
  <a class="kb-brand" href="/help"><img src="/pixel-logo.svg" alt="" width="28" height="28"><span>PixelForge <strong>Help</strong></span></a>
  <div class="kb-search" role="search">
    ${icon('Search', 18)}
    <input id="kb-search-input" type="search" placeholder="Search help" aria-label="Search help articles" autocomplete="off" aria-controls="kb-search-results" aria-expanded="false">
    <kbd class="kb-search-key" aria-hidden="true">/</kbd>
    <div id="kb-search-results" class="kb-search-results" role="listbox" hidden></div>
  </div>
  <a class="kb-open-editor" href="/editor">Open editor ${icon('ArrowRight', 16)}</a>
</header>
<div class="kb-shell">
${nav}
<main id="main" class="kb-main" tabindex="-1">
${body}
</main>
</div>
<footer class="kb-footer">
  <p>PixelForge by Cheaply · Help Center for version ${escapeHtml(version)}</p>
  <p><a href="/">Home</a> · <a href="/editor">Editor</a> · <a href="/help/report-a-problem">Report a problem</a> · <a href="/help/privacy-and-your-data">Privacy and your data</a></p>
</footer>
</body>
</html>
`;
}

function navigation(categories, byCategory, current) {
  const groups = categories.map((category) => {
    const items = byCategory.get(category.id) || [];
    const open = items.some((article) => article.slug === current) || current === `category/${category.id}`;
    const links = items
      .map((article) => `<li><a href="/help/${article.slug}"${article.slug === current ? ' aria-current="page"' : ''}>${escapeHtml(article.title)}</a></li>`)
      .join('');
    return `<details${open ? ' open' : ''}><summary>${icon(CATEGORY_ICONS[category.icon], 16)}<span>${escapeHtml(category.title)}</span></summary><ul>${links}</ul></details>`;
  });
  return `<nav id="kb-nav" class="kb-nav" aria-label="Help topics"><a class="kb-nav-home${current === '' ? ' is-current' : ''}" href="/help">${icon('BookOpen', 16)}<span>All topics</span></a>${groups.join('')}</nav>`;
}

function articleCard(article) {
  return `<li><a href="/help/${article.slug}"><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(article.summary)}</span></a></li>`;
}

/** Build every Help Center page into outDir/help. */
export async function buildHelp({ root = 'help', outDir = 'dist', version = 'dev', builtAt = new Date(), partial = false } = {}) {
  const help = await loadHelp(root);
  let errors = validateHelp(help);
  if (partial) {
    // While a section is being written: tolerate links to articles and categories that do not exist yet.
    const pending = errors.filter((error) => /broken (category )?link|related article|has no articles/.test(error));
    if (pending.length) console.warn(`Partial build: ignoring ${pending.length} link(s) to unwritten articles`);
    errors = errors.filter((error) => !pending.includes(error));
    help.categories = help.categories.filter((category) => help.articles.some((article) => article.category === category.id));
  }
  if (errors.length) throw new Error(`Help Center has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  const out = join(outDir, 'help');
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'img'), { recursive: true });
  await mkdir(join(out, 'assets'), { recursive: true });
  await mkdir(join(out, 'category'), { recursive: true });
  await mkdir(join(out, 'tool'), { recursive: true });

  const imageSizes = {};
  for (const name of help.images) {
    const buffer = readFileSync(join(root, 'img', name));
    const size = imageSize(buffer);
    if (size) imageSizes[name] = size;
    await copyFile(join(root, 'img', name), join(out, 'img', name));
  }
  for (const name of await readdir(join(root, 'assets'))) await copyFile(join(root, 'assets', name), join(out, 'assets', name));

  const categories = help.categories;
  const byCategory = new Map(categories.map((category) => [category.id, []]));
  for (const article of sortArticles(help.articles)) byCategory.get(article.category).push(article);
  const bySlug = new Map(help.articles.map((article) => [article.slug, article]));

  const records = [];
  const urls = ['/help'];
  for (const category of categories) {
    const list = byCategory.get(category.id);
    for (const [index, article] of list.entries()) {
      const rendered = renderMarkdown(article.body, { imageSizes });
      records.push(searchRecord(article, rendered, category));
      const previous = list[index - 1];
      const next = list[index + 1];
      const related = asList(article.related).map((slug) => bySlug.get(slug)).filter(Boolean);
      const toc = rendered.headings.length > 1
        ? `<aside class="kb-toc" aria-label="On this page"><p>On this page</p><ul>${rendered.headings.map((heading) => `<li class="depth-${heading.depth}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('')}</ul></aside>`
        : '';
      const meta = [
        article.level ? `<span class="kb-pill">${escapeHtml(article.level[0].toUpperCase() + article.level.slice(1))}</span>` : '',
        article.updated ? `<span>Updated ${escapeHtml(article.updated)}</span>` : '',
      ].filter(Boolean).join('');
      const body = `<div class="kb-article-grid">
<article class="kb-article">
<nav class="kb-breadcrumb" aria-label="Breadcrumb"><a href="/help">Help</a>${icon('ChevronRight', 14)}<a href="/help/category/${category.id}">${escapeHtml(category.title)}</a></nav>
<h1>${escapeHtml(article.title)}</h1>
<p class="kb-lead">${escapeHtml(article.summary)}</p>
${meta ? `<p class="kb-meta">${meta}</p>` : ''}
<div class="kb-prose">
${rendered.html}
</div>
${related.length ? `<section class="kb-related" aria-labelledby="related-title"><h2 id="related-title">Related articles</h2><ul class="kb-cards">${related.map(articleCard).join('')}</ul></section>` : ''}
<nav class="kb-pager" aria-label="More in ${escapeHtml(category.title)}">
${previous ? `<a class="prev" href="/help/${previous.slug}">${icon('ChevronLeft', 16)}<span><small>Previous</small>${escapeHtml(previous.title)}</span></a>` : '<span></span>'}
${next ? `<a class="next" href="/help/${next.slug}"><span><small>Next</small>${escapeHtml(next.title)}</span>${icon('ChevronRight', 16)}</a>` : '<span></span>'}
</nav>
<p class="kb-still-stuck">Still stuck? See <a href="/help/troubleshooting">Troubleshooting</a> or <a href="/help/report-a-problem">report a problem</a>.</p>
</article>
${toc}
</div>`;
      urls.push(`/help/${article.slug}`);
      await writeFile(
        join(out, `${article.slug}.html`),
        layout({ title: article.title, description: article.summary, canonical: `/help/${article.slug}`, body, version, nav: navigation(categories, byCategory, article.slug) }),
      );
    }
  }

  for (const category of categories) {
    const list = byCategory.get(category.id);
    const body = `<div class="kb-category">
<nav class="kb-breadcrumb" aria-label="Breadcrumb"><a href="/help">Help</a></nav>
<h1><span class="kb-cat-icon">${icon(CATEGORY_ICONS[category.icon], 26)}</span>${escapeHtml(category.title)}</h1>
<p class="kb-lead">${escapeHtml(category.summary)}</p>
<ul class="kb-cards kb-cards-wide">${list.map(articleCard).join('')}</ul>
</div>`;
    urls.push(`/help/category/${category.id}`);
    await writeFile(
      join(out, 'category', `${category.id}.html`),
      layout({ title: category.title, description: category.summary, canonical: `/help/category/${category.id}`, body, version, nav: navigation(categories, byCategory, `category/${category.id}`) }),
    );
  }

  const featured = sortArticles(help.articles.filter((article) => article.featured));
  const total = help.articles.length;
  const home = `<section class="kb-hero">
<h1>How can we help?</h1>
<p>Guides for every tool and feature in PixelForge, the free photo editor that runs in your browser. ${total} articles with step-by-step instructions and screenshots.</p>
<label class="kb-hero-search">${icon('Search', 22)}<span class="visually-hidden">Search help</span><input type="search" data-kb-search placeholder="Search for a tool, feature or problem" autocomplete="off"></label>
</section>
${featured.length ? `<section aria-labelledby="start-title"><h2 id="start-title">Start here</h2><ul class="kb-cards">${featured.map(articleCard).join('')}</ul></section>` : ''}
<section aria-labelledby="topics-title"><h2 id="topics-title">Browse by topic</h2>
<ul class="kb-topics">${categories.map((category) => {
    const list = byCategory.get(category.id);
    return `<li><a class="kb-topic" href="/help/category/${category.id}"><span class="kb-cat-icon">${icon(CATEGORY_ICONS[category.icon], 22)}</span><strong>${escapeHtml(category.title)}</strong><span>${escapeHtml(category.summary)}</span><small>${list.length} article${list.length === 1 ? '' : 's'}</small></a></li>`;
  }).join('')}</ul></section>`;
  // help.html serves the clean /help URL (Firebase cleanUrls and vite preview); help/index.html serves /help/.
  const homePage = layout({ title: 'Help Center', description: 'Step-by-step guides with screenshots for every PixelForge tool and feature.', canonical: '/help', body: home, version, nav: navigation(categories, byCategory, ''), pageClass: 'kb-home' });
  await writeFile(join(out, 'index.html'), homePage);
  await writeFile(join(outDir, 'help.html'), homePage);

  // /help/tool/<id> sends the editor's contextual Help link to the right article.
  const tools = toolArticles(help.articles);
  const palette = existsSync(join('src', 'toolPalette.ts')) ? paletteToolIds(await readFile(join('src', 'toolPalette.ts'), 'utf8')) : [];
  // Every palette tool gets a page so the editor's contextual link never 404s;
  // tests/help-center.test.mjs requires an article for each one.
  const targets = { ...Object.fromEntries(palette.map((tool) => [tool, `/help?q=${encodeURIComponent(tool.replace(/-/g, ' '))}`])), ...Object.fromEntries(Object.entries(tools).map(([tool, slug]) => [tool, `/help/${slug}`])) };
  for (const [tool, target] of Object.entries(targets)) {
    await writeFile(join(out, 'tool', `${tool}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PixelForge Help</title><meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${SITE}${target}"><meta name="robots" content="noindex"></head><body><p><a href="${target}">Open the help article</a></p></body></html>\n`);
  }

  await writeFile(join(out, 'search-index.json'), JSON.stringify({ version, articles: records }));
  await writeFile(join(out, 'tools.json'), JSON.stringify(tools));
  const lastmod = builtAt.toISOString().slice(0, 10);
  await writeFile(join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/editor', ...urls].map((url) => `  <url><loc>${SITE}${url}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  return { articles: total, categories: categories.length, images: help.images.length, tools: Object.keys(tools).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let version = 'dev';
  try {
    version = JSON.parse(await readFile(join('dist', 'release.json'), 'utf8')).version;
  } catch {
    version = JSON.parse(await readFile('package.json', 'utf8')).version;
  }
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const result = await buildHelp({ version, partial: args.includes('--partial'), outDir: outAt > -1 ? args[outAt + 1] : 'dist' });
  console.log(`Help Center: ${result.articles} articles in ${result.categories} categories, ${result.images} screenshots, ${result.tools} tool links`);
}

