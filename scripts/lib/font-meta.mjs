// Shared helpers for the font-library build scripts: resolve the catalogue
// against the pinned npm packages, and build the per-family glyph metadata
// (coverage ranges and searchable icon names) served from /fonts/meta/.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { codepointRanges, parseCmap, parseGsubLigatures, readFontTables } from './font-tables.mjs';

export const ALLOWED_LICENCES = ['OFL-1.1', 'Apache-2.0', 'UFL-1.0', 'CC0-1.0'];
// Italics ship for the core text categories only, Latin subset only, to keep
// the deploy size bounded (docs/font-library-contract.md).
const ITALIC_CATEGORIES = new Set(['sans', 'serif']);
const stylesSubsets = (style, subsets) => (style === 'italic' ? subsets.filter((subset) => subset === 'latin') : subsets);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function attributionFromLicence(text, family) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const end = lines.findIndex((line) => /This Font Software is licensed|Apache License|UBUNTU FONT LICENCE/i.test(line));
  const head = lines.slice(0, end > 0 ? end : 3).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 120);
  return head ? `${family}: ${head}` : family;
}

/**
 * Resolve one catalogue entry into a runtime registry entry plus the list of
 * files to copy. Throws when a licence is not allowed or a file is missing.
 */
export function resolveCatalogEntry(entry, root, ranges) {
  const dir = path.join(root, 'node_modules', entry.pkg);
  const pkg = readJson(path.join(dir, 'package.json'));
  const copies = [];
  const rangeIndex = (value) => {
    if (!value) return -1;
    let index = ranges.indexOf(value);
    if (index < 0) index = ranges.push(value) - 1;
    return index;
  };
  const face = (from, file, weight, style, subset, range, format = 'woff2') => {
    const source = path.join(dir, from);
    if (!existsSync(source)) throw new Error(`${entry.pkg}: missing ${from}`);
    const bytes = readFileSync(source).length;
    copies.push({ from: path.relative(root, source).replaceAll('\\', '/'), to: file });
    return { f: path.posix.basename(file), w: weight, s: style, u: subset, r: range, b: bytes, ...(format === 'woff2' ? {} : { t: format }) };
  };

  if (entry.file) {
    // A single explicit file (Font Awesome, Weather Icons).
    const licence = entry.licence;
    if (!ALLOWED_LICENCES.includes(licence)) throw new Error(`${entry.family}: licence ${licence} is not allowed`);
    const format = entry.file.endsWith('.woff') ? 'woff' : 'woff2';
    const filename = `${entry.id}.${format}`;
    const faces = [face(entry.file, `${entry.id}/${filename}`, '100 900', 'normal', 'all', -1, format)];
    return {
      font: {
        family: entry.family,
        id: entry.id,
        category: entry.category,
        tags: entry.tags,
        licence,
        attribution: entry.attribution,
        source: { package: entry.pkg, version: pkg.version, upstream: entry.upstream },
        weights: [400],
        italic: false,
        faces,
        sample: entry.sample,
        iconSource: entry.icons,
      },
      copies,
      licence: { from: entry.licenceFile ? path.join(dir, entry.licenceFile) : null, family: entry.family, attribution: entry.attribution },
    };
  }

  const meta = readJson(path.join(dir, 'metadata.json'));
  const unicode = existsSync(path.join(dir, 'unicode.json')) ? readJson(path.join(dir, 'unicode.json')) : {};
  const licence = meta.license?.type;
  if (!ALLOWED_LICENCES.includes(licence)) throw new Error(`${meta.family}: licence ${licence} is not allowed`);
  const licenceText = readFileSync(path.join(dir, 'LICENSE'), 'utf8');
  const variable = entry.pkg.startsWith('@fontsource-variable/') && meta.variable?.wght;
  const id = meta.id;
  const faces = [];
  let weights;
  let italic = false;
  let axes;
  if (entry.category === 'icons' || entry.category === 'symbols') {
    // One regular weight; the descriptor covers every weight so bold text
    // layers never synthesise fake bold glyphs.
    const subsets =
      entry.symbolSubsets === 'all'
        ? Object.keys(unicode)
        : (entry.symbolSubsets ?? meta.subsets).filter((subset) => meta.subsets.includes(subset) || unicode[subset]);
    const single = entry.single || entry.icons || subsets.length === 1;
    for (const subset of subsets) {
      const part = subset.replace(/^\[(\d+)\]$/, '$1');
      const name = `${id}-${part}-400-normal.woff2`;
      faces.push(face(`files/${name}`, `${id}/${name}`, '100 900', 'normal', single ? 'all' : part, single ? -1 : rangeIndex(unicode[subset])));
    }
    weights = [400];
  } else {
    const subsets = ['latin', 'latin-ext', ...(entry.extra ?? [])].filter((subset) => meta.subsets.includes(subset));
    italic = entry.italic ?? (ITALIC_CATEGORIES.has(entry.category) && meta.styles.includes('italic'));
    const styles = italic ? ['normal', 'italic'] : ['normal'];
    if (variable) {
      const min = Number(meta.variable.wght.min);
      const max = Number(meta.variable.wght.max);
      axes = [{ tag: 'wght', min, max }];
      weights = [400, 700].filter((weight) => weight >= min && weight <= max);
      if (!weights.length) weights = [Math.min(max, Math.max(min, 400))];
      for (const style of styles)
        for (const subset of stylesSubsets(style, subsets)) {
          const name = `${id}-${subset}-wght-${style}.woff2`;
          faces.push(face(`files/${name}`, `${id}/${name}`, `${min} ${max}`, style, subset, rangeIndex(unicode[subset])));
        }
    } else {
      weights = [400, 700].filter((weight) => meta.weights.includes(weight));
      if (!weights.length)
        weights = [meta.weights.reduce((best, weight) => (Math.abs(weight - 400) < Math.abs(best - 400) ? weight : best))];
      for (const style of styles)
        for (const weight of weights)
          for (const subset of stylesSubsets(style, subsets)) {
            const name = `${id}-${subset}-${weight}-${style}.woff2`;
            if (!existsSync(path.join(dir, 'files', name)) && style === 'italic') continue;
            faces.push(face(`files/${name}`, `${id}/${name}`, String(weight), style, subset, rangeIndex(unicode[subset])));
          }
    }
  }
  return {
    font: {
      family: meta.family,
      id,
      category: entry.category,
      tags: entry.tags ?? [],
      licence,
      attribution: attributionFromLicence(licenceText, meta.family),
      source: { package: entry.pkg, version: pkg.version, upstream: meta.source ?? `https://fontsource.org/fonts/${id}` },
      ...(axes ? { axes } : {}),
      weights,
      italic,
      faces,
      ...(entry.sample ? { sample: entry.sample } : {}),
      ...(entry.icons ? { iconSource: entry.icons } : {}),
    },
    copies,
    licence: { from: path.join(dir, 'LICENSE'), family: meta.family },
  };
}

/** Union of the cmap coverage of every face file of a family. */
export function familyCoverage(root, copies) {
  const codepoints = new Map();
  for (const copy of copies) {
    const tables = readFontTables(readFileSync(path.join(root, copy.from)));
    for (const [cp, glyph] of parseCmap(tables.get('cmap'))) if (!codepoints.has(cp)) codepoints.set(cp, glyph);
  }
  return codepoints;
}

const isPrivateUse = (cp) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000;

function words(name) {
  return name.replace(/[_-]+/g, ' ').trim();
}

/** Build the searchable icon list for a named icon font. */
export function iconIndex(root, resolved) {
  const { font, copies } = resolved;
  const source = font.iconSource;
  const fontBytes = readFileSync(path.join(root, copies[0].from));
  const tables = readFontTables(fontBytes);
  const cmap = parseCmap(tables.get('cmap'));
  const icons = [];
  if (source === 'gsub-ligatures') {
    const ligatures = parseGsubLigatures(tables.get('GSUB'));
    const glyphToChar = new Map();
    const glyphToPua = new Map();
    for (const [cp, glyph] of cmap) {
      if (isPrivateUse(cp)) {
        if (!glyphToPua.has(glyph)) glyphToPua.set(glyph, cp);
      } else if (!glyphToChar.has(glyph) || /[a-z0-9_]/.test(String.fromCodePoint(cp))) {
        // Ligature names are lowercase; the font maps capitals to the same glyphs.
        if (!/[a-z0-9_]/.test(String.fromCodePoint(glyphToChar.get(glyph) ?? 0x41))) glyphToChar.set(glyph, cp);
      }
    }
    const seen = new Set();
    for (const ligature of ligatures) {
      const pua = glyphToPua.get(ligature.glyph);
      if (pua === undefined) continue;
      const chars = ligature.components.map((glyph) => glyphToChar.get(glyph));
      if (chars.some((cp) => cp === undefined)) continue;
      const name = String.fromCodePoint(...chars);
      if (!/^[a-z0-9_]+$/.test(name) || seen.has(name)) continue;
      seen.add(name);
      icons.push([name, pua, words(name)]);
    }
  } else if (source.startsWith('font-awesome:')) {
    const style = source.split(':')[1];
    const metaFile = path.join(root, 'node_modules', font.source.package, 'metadata', 'icon-families.json');
    const families = JSON.parse(readFileSync(metaFile, 'utf8'));
    for (const [name, icon] of Object.entries(families)) {
      const free = icon.familyStylesByLicense?.free ?? [];
      if (!free.some((item) => item.family === 'classic' && item.style === style)) continue;
      const cp = Number.parseInt(icon.unicode, 16);
      if (!cmap.has(cp)) continue;
      const terms = [icon.label, ...(icon.search?.terms ?? []), ...(icon.aliases?.names ?? [])].filter((term) => typeof term === 'string');
      icons.push([name, cp, [...new Set(terms.map((term) => term.toLowerCase()))].join(' ').slice(0, 300)]);
    }
  } else if (source === 'weather-css') {
    const css = readFileSync(path.join(root, 'node_modules', font.source.package, 'css', 'weather-icons.css'), 'utf8');
    const seen = new Set();
    for (const match of css.matchAll(/\.wi-([a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-f]+)"/gi)) {
      const [, name, hex] = match;
      const cp = Number.parseInt(hex, 16);
      if (!cmap.has(cp) || seen.has(name)) continue;
      seen.add(name);
      icons.push([name, cp, words(name)]);
    }
  } else throw new Error(`Unknown icon source ${source}`);
  icons.sort((a, b) => a[0].localeCompare(b[0]));
  return icons;
}

export { codepointRanges };
