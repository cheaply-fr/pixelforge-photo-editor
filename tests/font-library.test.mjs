import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_FONT_LICENCES,
  ALL_FONT_FAMILIES,
  FONT_ASSET_VERSION,
  FONT_CATEGORIES,
  FONT_LIBRARY,
  SYSTEM_FONTS,
  fontFaceRegistrations,
  fontFamilyKind,
  fontFileUrl,
  fontMetaUrl,
  isFontFamilyName,
  isSelectableFontFamily,
  libraryFont,
  missingFontFamilies,
  parseStoredFamilies,
  pushRecentFamily,
  searchFonts,
  toggleFavouriteFamily,
  virtualWindow,
  MAX_RECENT_FONTS,
} from '../src/fontLibrary.ts';
import { FONT_CATALOG } from '../scripts/font-catalog.mjs';
import { iconIndex, resolveCatalogEntry } from '../scripts/lib/font-meta.mjs';
import { codepointRanges, parseCmap, readFontTables } from '../scripts/lib/font-tables.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const ranges = [];
const resolved = FONT_CATALOG.map((entry) => resolveCatalogEntry(entry, root, ranges));

test('the library is a broad catalogue across every category, with icon and symbol fonts', () => {
  assert.ok(FONT_LIBRARY.length >= 100, `${FONT_LIBRARY.length} families`);
  for (const category of FONT_CATEGORIES)
    assert.ok(FONT_LIBRARY.some((font) => font.category === category), `category ${category} is populated`);
  const icons = FONT_LIBRARY.filter((font) => font.category === 'icons');
  const symbols = FONT_LIBRARY.filter((font) => font.category === 'symbols');
  assert.ok(icons.length >= 6 && symbols.length >= 5);
  for (const family of ['Material Symbols Outlined', 'Font Awesome Free Solid', 'Font Awesome Brands', 'Weather Icons', 'Noto Sans Symbols 2', 'Noto Sans Math', 'Noto Emoji', 'Noto Music'])
    assert.ok(libraryFont(family), `${family} is bundled`);
});

test('registry entries are unique, licensed, attributed and pinned to exact package versions', () => {
  const families = new Set();
  const ids = new Set();
  for (const font of FONT_LIBRARY) {
    assert.ok(!families.has(font.family.toLowerCase()), `duplicate family ${font.family}`);
    assert.ok(!ids.has(font.id), `duplicate id ${font.id}`);
    families.add(font.family.toLowerCase());
    ids.add(font.id);
    assert.ok(!SYSTEM_FONTS.includes(font.family), `${font.family} shadows a system font`);
    assert.ok(ALLOWED_FONT_LICENCES.includes(font.licence), `${font.family}: ${font.licence}`);
    assert.ok(font.attribution.length > 3, `${font.family} has an attribution`);
    assert.match(font.source.upstream, /^https:\/\//);
    assert.equal(pkg.devDependencies[font.source.package], font.source.version, `${font.source.package} pinned exactly`);
    const installed = JSON.parse(readFileSync(path.join(root, 'node_modules', font.source.package, 'package.json'), 'utf8'));
    assert.equal(installed.version, font.source.version);
    assert.ok(isFontFamilyName(font.family));
    assert.ok(font.faces.length >= 1 && font.weights.length >= 1);
    assert.equal(font.licenceFile, `licenses/${font.id}.txt`);
  }
  for (const font of FONT_LIBRARY.filter((item) => item.source.package.startsWith('@fortawesome/')))
    assert.match(font.icons?.attribution ?? '', /CC BY 4\.0/);
});

test('the committed registry matches the pinned packages and every face file exists', () => {
  assert.equal(resolved.length, FONT_LIBRARY.length);
  for (const [index, item] of resolved.entries()) {
    const font = FONT_LIBRARY[index];
    assert.equal(item.font.family, font.family);
    assert.equal(item.copies.length, font.faces.length);
    for (const [faceIndex, copy] of item.copies.entries()) {
      const face = font.faces[faceIndex];
      assert.equal(copy.to, face.file);
      const source = path.join(root, copy.from);
      assert.ok(existsSync(source), `${copy.from} exists`);
      assert.equal(statSync(source).size, face.bytes, `${face.file} size matches`);
      assert.ok(face.file.endsWith(face.format === 'woff2' ? '.woff2' : '.woff'));
    }
    if (item.licence.from) assert.ok(existsSync(item.licence.from), `${font.family} licence text exists`);
  }
  // Italics are Latin-only and limited to sans/serif, keeping the deploy bounded.
  for (const font of FONT_LIBRARY)
    for (const face of font.faces) if (face.style === 'italic') assert.equal(face.subset, 'latin', `${face.file}`);
  const total = FONT_LIBRARY.reduce((sum, font) => sum + font.faces.reduce((n, face) => n + face.bytes, 0), 0);
  assert.ok(total < 14 * 1024 * 1024, `library is ${(total / 1048576).toFixed(2)} MiB`);
});

test('face registrations are versioned, same-origin and use unicode-range subsets only for split fonts', () => {
  const roboto = libraryFont('Roboto');
  const faces = fontFaceRegistrations(roboto);
  assert.ok(faces.length >= 4);
  for (const face of faces) {
    assert.match(face.url, new RegExp(`^/fonts/roboto/roboto-[a-z-]+-wght-(normal|italic)\\.woff2\\?v=${FONT_ASSET_VERSION}$`));
    assert.match(face.descriptors.unicodeRange ?? '', /^U\+/);
    assert.equal(face.descriptors.weight, '100 900');
  }
  const material = fontFaceRegistrations(libraryFont('Material Symbols Outlined'));
  assert.equal(material.length, 1);
  assert.equal(material[0].descriptors.unicodeRange, undefined, 'icon fonts load as one file covering their private-use glyphs');
  const weather = fontFaceRegistrations(libraryFont('Weather Icons'));
  assert.match(weather[0].source, /format\("woff"\)/);
  assert.equal(fontFileUrl('licenses/x.txt'), `/fonts/licenses/x.txt?v=${FONT_ASSET_VERSION}`);
  assert.equal(fontMetaUrl(libraryFont('Inter')), `/fonts/meta/inter.json?v=${FONT_ASSET_VERSION}`);
});

test('icon metadata is searchable by name and tags', async () => {
  const { searchGlyphs } = await import('../src/glyphIndex.ts');
  const indexFor = (family) => {
    const index = FONT_LIBRARY.findIndex((font) => font.family === family);
    return { family, ranges: [], icons: iconIndex(root, resolved[index]) };
  };
  const material = indexFor('Material Symbols Outlined');
  assert.equal(material.icons.length, libraryFont('Material Symbols Outlined').icons.count);
  const home = searchGlyphs(material, { query: 'home' });
  assert.equal(home.items[0].name, 'home');
  assert.ok(home.items[0].cp >= 0xe000 && home.items[0].cp <= 0xf8ff);
  const solid = indexFor('Font Awesome Free Solid');
  const heart = searchGlyphs(solid, { query: 'heart' });
  assert.equal(heart.items[0].name, 'heart');
  assert.ok(searchGlyphs(solid, { query: 'love' }).items.some((item) => item.name === 'heart'), 'tags are searchable');
  const brands = indexFor('Font Awesome Brands');
  assert.ok(searchGlyphs(brands, { query: 'github' }).total >= 1);
  const weather = indexFor('Weather Icons');
  assert.ok(searchGlyphs(weather, { query: 'rain' }).total >= 5);
  // Every indexed codepoint is really in the font's character map.
  const solidFont = resolved[FONT_LIBRARY.findIndex((font) => font.family === 'Font Awesome Free Solid')];
  const cmap = parseCmap(readFontTables(readFileSync(path.join(root, solidFont.copies[0].from))).get('cmap'));
  for (const [, cp] of solid.icons) assert.ok(cmap.has(cp));
});

test('font tables reader parses WOFF2 and WOFF character maps', () => {
  const inter = resolved[FONT_LIBRARY.findIndex((font) => font.family === 'Inter')];
  const latin = inter.copies.find((copy) => copy.to.includes('-latin-wght-normal'));
  const cmap = parseCmap(readFontTables(readFileSync(path.join(root, latin.from))).get('cmap'));
  for (const char of 'AZaz09') assert.ok(cmap.has(char.codePointAt(0)));
  const weather = resolved[FONT_LIBRARY.findIndex((font) => font.family === 'Weather Icons')];
  const woff = parseCmap(readFontTables(readFileSync(path.join(root, weather.copies[0].from))).get('cmap'));
  assert.ok(woff.has(0xf00d));
  assert.deepEqual(codepointRanges([3, 1, 2, 7, 9, 8]), [[1, 3], [7, 9]]);
});

test('picker search, category, favourites and recents filter the family list', () => {
  const garamond = searchFonts({ query: 'garamond' }).map((item) => item.family);
  assert.ok(garamond.includes('EB Garamond') && garamond.includes('Cormorant Garamond'));
  assert.ok(searchFonts({ query: 'emoji' }).some((item) => item.family === 'Noto Emoji'));
  assert.ok(searchFonts({ query: 'weather' }).some((item) => item.family === 'Weather Icons'));
  const mono = searchFonts({ category: 'monospace' });
  assert.ok(mono.length >= 8 && mono.every((item) => item.category === 'monospace'));
  assert.ok(searchFonts({ category: 'handwriting', query: 'script' }).length >= 5);
  assert.deepEqual(searchFonts({ category: 'favourites', favourites: ['Lobster', 'Arial', 'Nope'] }).map((item) => item.family).sort(), ['Arial', 'Lobster']);
  assert.deepEqual(searchFonts({ category: 'recent', recent: ['Lora', 'Unknown', 'Arial'] }).map((item) => item.family), ['Lora', 'Arial']);
  assert.equal(searchFonts().length, ALL_FONT_FAMILIES.length);
  assert.ok(searchFonts({ query: 'café' }).length === 0);
  assert.ok(searchFonts({ query: 'ÉB garamond' }).some((item) => item.family === 'EB Garamond'), 'accent-insensitive');
});

test('stored favourites and recents are bounded and malformed values are dropped', () => {
  assert.deepEqual(parseStoredFamilies('["Lora","Lora","bad\\"name",3,"Inter"]', 10), ['Lora', 'Inter']);
  assert.deepEqual(parseStoredFamilies('not json', 10), []);
  assert.deepEqual(parseStoredFamilies({}, 10), []);
  let recent = [];
  for (let i = 0; i < 20; i += 1) recent = pushRecentFamily(recent, `Font ${i}`);
  assert.equal(recent.length, MAX_RECENT_FONTS);
  assert.equal(recent[0], 'Font 19');
  assert.deepEqual(pushRecentFamily(['A', 'B', 'C'], 'C'), ['C', 'A', 'B']);
  assert.deepEqual(toggleFavouriteFamily(toggleFavouriteFamily([], 'Lora'), 'Lora'), []);
});

test('the picker virtual window renders only visible rows plus overscan', () => {
  assert.deepEqual(virtualWindow(150, 0, 288, 48, 3), { start: 0, end: 9 });
  assert.deepEqual(virtualWindow(150, 4800, 288, 48, 3), { start: 97, end: 109 });
  assert.deepEqual(virtualWindow(5, 1000, 288, 48, 3), { start: 5, end: 5 });
  assert.deepEqual(virtualWindow(0, 0, 288, 48), { start: 0, end: 0 });
});

test('portable family names: unknown fonts stay valid in documents, pickers accept only known fonts', async () => {
  const { commonLayer, validateFrame } = await import('../src/document.ts');
  assert.ok(isFontFamilyName('Open Sans'));
  assert.ok(isFontFamilyName("Font d'Été 2"));
  for (const bad of ['', ' Lora', 'A"B', 'x;y', 'line\nbreak', 'a'.repeat(81), 42]) assert.equal(isFontFamilyName(bad), false);
  assert.equal(fontFamilyKind('Arial'), 'system');
  assert.equal(fontFamilyKind('lobster'), 'library', 'case-insensitive lookup');
  assert.equal(fontFamilyKind('Comic Sans'), 'unknown');
  assert.equal(isSelectableFontFamily('Comic Sans'), false);
  assert.equal(isSelectableFontFamily('Pacifico'), true);
  assert.deepEqual(missingFontFamilies(['Arial', 'Some Studio Font', 'Lora', 'Some Studio Font']), ['Some Studio Font']);
  const layer = {
    ...commonLayer('Text'),
    kind: 'text', text: 'Hi', color: '#ffffff', fontSize: 40, fontFamily: 'Some Studio Font', bold: false,
    boxWidth: 200, textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, orientation: 'horizontal',
  };
  const frame = { w: 64, h: 64, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] };
  assert.doesNotThrow(() => validateFrame({ ...frame, layers: [{ ...layer, fontFamily: 'Arial' }] }, {}));
  assert.doesNotThrow(() => validateFrame(frame, {}), 'unknown family is kept for portability');
  assert.throws(() => validateFrame({ ...frame, layers: [{ ...layer, fontFamily: 'Bad"Family' }] }, {}));
});

test('pinned font packages and the hosting CSP stay same-origin', () => {
  const firebase = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const csp = firebase.hosting.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy').value;
  assert.match(csp, /font-src 'self';/);
  assert.doesNotMatch(csp, /fonts\.googleapis|fonts\.gstatic|font-src[^;]*https?:/);
  const fontsRule = firebase.hosting.headers.find((rule) => rule.source === '/fonts/**');
  assert.match(fontsRule.headers[0].value, /immutable/);
  for (const name of new Set(FONT_LIBRARY.map((font) => font.source.package))) assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/);
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\/public\/fonts\/$/m);
  assert.match(pkg.scripts.build, /^node scripts\/copy-fonts\.mjs && vite build/);
});
