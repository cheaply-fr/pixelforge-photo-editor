import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFontLoader, ensureTextLayerFonts, frameFontRequests } from '../src/fontLoader.ts';
import { libraryFont } from '../src/fontLibrary.ts';
import { codepointLabel, glyphBlocks, parseGlyphMeta, parseUnicodeRange, restrictGlyphMeta, searchGlyphs, unicodeBlockOf } from '../src/glyphIndex.ts';
import { planGlyphInsert, registerTextCaretAdapter, currentTextCaretAdapter } from '../src/glyphInsert.ts';

/** Fake FontFaceSet whose loads resolve when the test releases them. */
function fakeFonts() {
  const faces = [];
  const loads = [];
  class FakeFontFace {
    constructor(family, source, descriptors) {
      Object.assign(this, { family, source, descriptors });
      faces.push(this);
    }
  }
  const fontSet = {
    add: () => undefined,
    load(font, text) {
      let resolve;
      let reject;
      const promise = new Promise((ok, fail) => {
        resolve = ok;
        reject = fail;
      });
      loads.push({ font, text, resolve, reject });
      return promise;
    },
  };
  return { faces, loads, fontSet, FontFace: FakeFontFace };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('nothing is registered or fetched until a family is requested', async () => {
  const fake = fakeFonts();
  const loader = createFontLoader({ fontSet: fake.fontSet, FontFace: fake.FontFace });
  assert.equal(fake.faces.length, 0);
  assert.equal(loader.state('Lobster'), 'idle');
  assert.equal(await loader.ensure('Arial'), 'system');
  assert.equal(await loader.ensure('Comic Sans'), 'unknown');
  assert.equal(fake.faces.length, 0);
  const pending = loader.ensure('Lobster', { text: 'Hi', weight: 700 });
  await tick();
  assert.equal(fake.faces.length, libraryFont('Lobster').faces.length, 'only the requested family registers');
  assert.ok(fake.faces.every((face) => face.family === 'Lobster'));
  assert.ok(fake.faces.every((face) => /^url\(\/fonts\/lobster\/.+\.woff2\?v=\w+\) format\("woff2"\)$/.test(face.source)));
  assert.equal(fake.loads.length, 1);
  assert.equal(fake.loads[0].font, '700 16px "Lobster"');
  assert.equal(fake.loads[0].text, 'Hi');
  assert.equal(loader.state('Lobster'), 'loading');
  fake.loads[0].resolve([{}]);
  assert.equal(await pending, 'loaded');
  assert.equal(loader.state('Lobster'), 'loaded');
  assert.equal(loader.revision(), 1);
  // A repeat request is answered from the completed set without a new load.
  assert.equal(await loader.ensure('Lobster', { text: 'Hi', weight: 700 }), 'loaded');
  assert.equal(fake.loads.length, 1);
  // Registering is once per family even for new weights/text.
  void loader.ensure('Lobster', { text: 'ąę' });
  await tick();
  assert.equal(fake.faces.length, libraryFont('Lobster').faces.length);
});

test('the scheduler dedupes, bounds concurrency and lets explicit choices overtake previews', async () => {
  const fake = fakeFonts();
  const loader = createFontLoader({ fontSet: fake.fontSet, FontFace: fake.FontFace, concurrency: 2 });
  const order = [];
  const families = ['Lora', 'Inter', 'Pacifico', 'Rye'];
  const previews = families.map((family) => loader.ensure(family, { priority: 'low' }).then((state) => order.push([family, state])));
  const dup = loader.ensure('Lora', { priority: 'low' });
  await tick();
  assert.equal(fake.loads.length, 2, 'two loads in flight at most');
  const chosen = loader.ensure('Bangers', { priority: 'high' });
  fake.loads[0].resolve([{}]);
  await tick();
  assert.equal(fake.loads.length, 3);
  assert.match(fake.loads[2].font, /"Bangers"/, 'high priority runs before queued previews');
  assert.equal(await dup, 'loaded', 'duplicate request shares the first load');
  fake.loads[1].resolve([{}]);
  fake.loads[2].resolve([{}]);
  assert.equal(await chosen, 'loaded');
  await tick();
  for (const load of fake.loads.slice(3)) load.resolve([{}]);
  await Promise.all(previews);
  assert.equal(order.length, 4);
  assert.ok(order.every(([, state]) => state === 'loaded'));
});

test('failed and timed-out loads fall back, and a late arrival is reported as loaded', async () => {
  const fake = fakeFonts();
  const loader = createFontLoader({ fontSet: fake.fontSet, FontFace: fake.FontFace, timeoutMs: 5 });
  const events = [];
  loader.subscribe((family, state) => events.push(`${family}:${state}`));
  const failing = loader.ensure('Anton');
  await tick();
  fake.loads[0].reject(new Error('NetworkError'));
  assert.equal(await failing, 'failed');
  const slow = loader.ensure('Ultra');
  assert.equal(await slow, 'failed', 'timeout renders with the fallback');
  fake.loads[1].resolve([{}]);
  await tick();
  assert.equal(loader.state('Ultra'), 'loaded');
  assert.ok(events.includes('Ultra:failed') && events.at(-1) === 'Ultra:loaded');
  // Without a FontFaceSet (workers without fonts, node) library fonts fail closed.
  const none = createFontLoader();
  assert.equal(await none.ensure('Lora'), 'failed');
});

test('text layers wait only for library fonts, with their weight and text', async () => {
  const fake = fakeFonts();
  const loader = createFontLoader({ fontSet: fake.fontSet, FontFace: fake.FontFace });
  const frame = {
    layers: [
      { kind: 'raster' },
      { kind: 'text', fontFamily: 'Arial', bold: false, text: 'system' },
      { kind: 'text', fontFamily: 'Unknown Studio', bold: false, text: 'kept' },
      { kind: 'text', fontFamily: 'Lora', bold: true, text: 'Héllo' },
      { kind: 'text', fontFamily: 'Lora', bold: true, text: ' world' },
    ],
  };
  const requests = frameFontRequests(frame);
  assert.equal(requests.length, 4);
  const done = ensureTextLayerFonts(requests, loader);
  await tick();
  assert.equal(fake.loads.length, 1, 'one load per library family and weight');
  assert.equal(fake.loads[0].font, '700 16px "Lora"');
  assert.equal(fake.loads[0].text, 'Hélo wrd', 'distinct characters select the subsets');
  fake.loads[0].resolve([{}]);
  assert.equal(await done, true);
  assert.equal(await ensureTextLayerFonts([{ fontFamily: 'Georgia' }], loader), true);
});

test('glyph metadata parsing rejects malformed data and indexes Unicode blocks', () => {
  assert.equal(parseGlyphMeta(null), undefined);
  assert.equal(parseGlyphMeta({ family: 'X', ranges: [[5, 2]] }), undefined);
  assert.equal(parseGlyphMeta({ family: 'X', ranges: [[0, 0x110000]] }), undefined);
  assert.equal(parseGlyphMeta({ family: 'X', ranges: [], icons: [['a', -1, '']] }), undefined);
  const meta = parseGlyphMeta({ family: 'Sym', ranges: [[0x20, 0x41], [0x2190, 0x2193], [0x2605, 0x2606], [0x1f600, 0x1f601]] });
  assert.equal(unicodeBlockOf(0x2605), 'Miscellaneous Symbols');
  assert.equal(unicodeBlockOf(0x1f600), 'Emoticons');
  assert.equal(unicodeBlockOf(0x10ffff), 'Other');
  assert.deepEqual(glyphBlocks(meta).map((block) => block.name), ['Basic Latin', 'Arrows', 'Miscellaneous Symbols', 'Emoticons']);
  assert.equal(glyphBlocks(meta)[0].count, 0x41 - 0x21 + 1, 'space is not an insertable glyph');
  assert.deepEqual(searchGlyphs(meta, { query: 'U+2605' }).items.map((item) => item.char), ['★']);
  assert.deepEqual(searchGlyphs(meta, { query: '2606' }).items.map((item) => item.cp), [0x2606]);
  assert.deepEqual(searchGlyphs(meta, { query: '★' }).items.map((item) => item.cp), [0x2605]);
  assert.equal(searchGlyphs(meta, { query: 'arrows' }).total, 4);
  assert.equal(searchGlyphs(meta, { block: 'Emoticons' }).total, 2);
  assert.equal(searchGlyphs(meta, { limit: 3 }).items.length, 3);
  assert.equal(codepointLabel(0x41), 'U+0041');
  const named = parseGlyphMeta({ family: 'Icons', ranges: [], icons: [['home_work', 0xe001, 'home work'], ['house', 0xe002, 'home building'], ['home', 0xe003, 'home']] });
  assert.deepEqual(searchGlyphs(named, { query: 'home' }).items.map((item) => item.name), ['home', 'home_work', 'house']);
  assert.deepEqual(searchGlyphs(named, { query: 'building' }).items.map((item) => item.name), ['house']);
  assert.deepEqual(parseUnicodeRange('U+0000-00FF, U+0131,bogus,U+2605'), [[0, 0xff], [0x131, 0x131], [0x2605, 0x2605]]);
  const restricted = restrictGlyphMeta(meta, ['U+2600-26FF', 'U+1F600']);
  assert.deepEqual(restricted.ranges, [[0x2605, 0x2606], [0x1f600, 0x1f600]], 'only glyphs a shipped face renders');
  assert.equal(restrictGlyphMeta(meta, undefined), meta);
});

test('glyph insertion goes to the caret, the matching active layer, or a new layer', () => {
  const frame = {
    active: 'a',
    layers: [
      { id: 'a', kind: 'text', fontFamily: 'Material Symbols Outlined', text: '' },
      { id: 'b', kind: 'text', fontFamily: 'Lora', text: 'Hi' },
      { id: 'c', kind: 'raster' },
    ],
  };
  assert.deepEqual(planGlyphInsert(frame, '', 'Material Symbols Outlined', undefined), { kind: 'append', layerId: 'a', text: '' });
  assert.deepEqual(planGlyphInsert(frame, '★', 'Noto Sans Symbols 2', undefined), { kind: 'new-layer', text: '★', fontFamily: 'Noto Sans Symbols 2' });
  assert.equal(planGlyphInsert({ ...frame, active: 'c' }, 'x', 'Lora', undefined).kind, 'new-layer');
  const locked = { ...frame, layers: [{ ...frame.layers[0], locked: true }] };
  assert.equal(planGlyphInsert(locked, '', 'Material Symbols Outlined', undefined).kind, 'new-layer');
  const full = { ...frame, layers: [{ ...frame.layers[0], text: 'x'.repeat(10000) }] };
  assert.equal(planGlyphInsert(full, '', 'Material Symbols Outlined', undefined).kind, 'new-layer');
  const inserted = [];
  const unregister = registerTextCaretAdapter({ insertTextAtCaret: (text) => inserted.push(text), layerId: () => 'a' });
  assert.equal(currentTextCaretAdapter() !== undefined, true);
  assert.deepEqual(planGlyphInsert(frame, '', 'Material Symbols Outlined'), { kind: 'caret' });
  assert.equal(planGlyphInsert({ ...frame, active: 'b' }, 'é', 'Lora').kind, 'append', 'caret on another layer is not used');
  unregister();
  assert.equal(currentTextCaretAdapter(), undefined);
});

test('the service worker caches library fonts on first use in a dedicated cache', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = new Map();
  const opened = [];
  const stored = new Map();
  let network = 0;
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: { location: { origin: 'https://photoeditor.cheaply.fr' }, addEventListener: (type, handler) => handlers.set(type, handler) },
    caches: {
      open: (name) => {
        opened.push(name);
        return Promise.resolve({
          match: (request) => Promise.resolve(stored.get(request.url)),
          put: (request, response) => {
            stored.set(request.url, response);
            return Promise.resolve();
          },
        });
      },
      match: () => Promise.resolve(undefined),
    },
    fetch: () => {
      network += 1;
      return Promise.resolve({ ok: true, clone() { return { ok: true, cached: true }; } });
    },
  });
  const fetchHandler = handlers.get('fetch');
  const url = 'https://photoeditor.cheaply.fr/fonts/lora/lora-latin-wght-normal.woff2?v=abc';
  const respond = () =>
    new Promise((resolve) => fetchHandler({ request: { method: 'GET', mode: 'cors', url }, respondWith: (value) => resolve(value) }));
  await respond();
  await tick();
  assert.equal(network, 1);
  assert.ok(stored.has(url));
  const second = await respond();
  assert.equal(network, 1, 'second use is served offline from the font cache');
  assert.equal(second.cached, true);
  assert.ok(opened.every((name) => name === 'pixelforge-fonts-v1'));
});
