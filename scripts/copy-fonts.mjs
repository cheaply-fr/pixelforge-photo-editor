// Copy the self-hosted font library from the pinned npm packages into
// public/fonts/ (served at /fonts/), together with the licence texts and the
// per-family glyph metadata the Glyphs panel loads on demand. Runs before
// `vite build` and `vite`; public/fonts/ is generated and git-ignored.
// The committed registry (src/fontLibrary.generated.ts) must match the
// packages: if it does not, the build fails and asks for `npm run fonts:sync`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assetVersion, registryFromResolved, resolveLibrary } from './sync-font-library.mjs';
import { codepointRanges, familyCoverage, iconIndex } from './lib/font-meta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function oflBody(projectRoot) {
  // Reuse the canonical OFL 1.1 text shipped with a pinned OFL package.
  const text = readFileSync(path.join(projectRoot, 'node_modules', '@fontsource', 'lato', 'LICENSE'), 'utf8');
  const start = text.indexOf('This Font Software is licensed under the SIL Open Font License');
  if (start < 0) throw new Error('Could not locate the SIL OFL 1.1 text');
  return text.slice(start);
}

export async function copyFonts({ projectRoot = root, out = path.join(root, 'public', 'fonts'), force = false } = {}) {
  const generated = await import(pathToFileURL(path.join(projectRoot, 'src', 'fontLibrary.generated.ts')).href);
  const stamp = path.join(out, '.stamp');
  if (!force && existsSync(stamp) && readFileSync(stamp, 'utf8') === generated.FONT_ASSET_VERSION) return { skipped: true };
  const { resolved, ranges } = resolveLibrary(projectRoot);
  const registry = registryFromResolved(resolved, projectRoot, ranges);
  if (
    assetVersion(registry) !== generated.FONT_ASSET_VERSION ||
    JSON.stringify(registry) !== JSON.stringify(generated.GENERATED_FONT_LIBRARY) ||
    JSON.stringify(ranges) !== JSON.stringify(generated.FONT_UNICODE_RANGES)
  )
    throw new Error('src/fontLibrary.generated.ts is out of date with the font packages: run `npm run fonts:sync`.');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, 'licenses'), { recursive: true });
  mkdirSync(path.join(out, 'meta'), { recursive: true });
  let bytes = 0;
  const attributions = [];
  for (const item of resolved) {
    const { font, copies, licence } = item;
    for (const copy of copies) {
      const destination = path.join(out, copy.to);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(projectRoot, copy.from), destination);
      bytes += readFileSync(destination).length;
    }
    const licenceText = licence.from
      ? readFileSync(licence.from, 'utf8')
      : `${licence.attribution}\n\nCopyright (c) Erik Flowers.\n\n${oflBody(projectRoot)}`;
    writeFileSync(path.join(out, 'licenses', `${font.id}.txt`), licenceText);
    attributions.push(`${font.family} — ${font.licence} — ${font.source.package}@${font.source.version} — ${font.source.upstream}\n  ${font.attribution}`);
    const coverage = familyCoverage(projectRoot, copies);
    const meta = { family: font.family, ranges: codepointRanges([...coverage.keys()]) };
    if (font.category === 'icons') meta.icons = iconIndex(projectRoot, item);
    writeFileSync(path.join(out, 'meta', `${font.id}.json`), JSON.stringify(meta));
  }
  writeFileSync(
    path.join(out, 'licenses', 'ATTRIBUTIONS.txt'),
    `PixelForge font library (${resolved.length} families). Each family's full licence text is in this directory.\n\n${attributions.join('\n\n')}\n`,
  );
  writeFileSync(stamp, generated.FONT_ASSET_VERSION);
  return { skipped: false, families: resolved.length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await copyFonts({ force: process.argv.includes('--force') });
  if (result.skipped) console.log('Font library already up to date in public/fonts/.');
  else console.log(`Copied ${result.families} font families (${(result.bytes / 1048576).toFixed(2)} MiB) to public/fonts/.`);
}
