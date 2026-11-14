import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('PWA metadata exposes an installable PixelForge shell', async () => {
  const [html, manifestText, sw, main] = await Promise.all([
    read('index.html'),
    read('public/manifest.webmanifest'),
    read('public/sw.js'),
    read('src/main.tsx'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/pixelforge-192\.png"\s*\/>/);
  assert.equal(manifest.name, 'PixelForge — Free Online Photo Editor');
  assert.equal(manifest.short_name, 'PixelForge');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
    [
      { src: '/icons/pixelforge-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/pixelforge-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  );
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`public${icon.src}`, root));
    assert.ok(bytes.subarray(0, pngSignature.length).equals(pngSignature), `${icon.src} is a PNG`);
  }
  assert.match(sw, /const CACHE_NAME = 'pixelforge-shell-v3'/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /caches\.match\('\/index\.html'\)/);
  assert.match(sw, /new URL\(request\.url\)\.origin !== self\.location\.origin/);
  assert.match(main, /import\.meta\.env\.PROD/);
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js'/);
});

test('release and readiness probes bypass offline caches including cache-busting queries', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = new Map();
  let cacheReads = 0;
  let networkReads = 0;
  runInNewContext(await read('public/sw.js'), {
    URL,
    self: {
      location: { origin: 'https://photoeditor.cheaply.fr' },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: { match: () => { cacheReads += 1; return Promise.resolve(undefined); } },
    fetch: () => { networkReads += 1; return Promise.resolve({ ok: false }); },
  });
  const fetchHandler = handlers.get('fetch');
  for (const path of ['/release.json?status=1', '/api/readyz.json?status=2']) {
    let intercepted = false;
    fetchHandler({
      request: { method: 'GET', mode: 'cors', url: `https://photoeditor.cheaply.fr${path}` },
      respondWith: () => { intercepted = true; },
    });
    assert.equal(intercepted, false, `${path} goes directly to browser network fetch`);
  }
  assert.equal(cacheReads, 0);
  assert.equal(networkReads, 0);

  let assetResponse;
  fetchHandler({
    request: { method: 'GET', mode: 'cors', url: 'https://photoeditor.cheaply.fr/assets/editor-hash.js' },
    respondWith: (response) => { assetResponse = response; },
  });
  await Promise.resolve(assetResponse);
  assert.equal(cacheReads, 1, 'ordinary immutable assets retain offline caching');
  assert.equal(networkReads, 1);
});

test('Help Center pages are cached under their own URL and never replace the editor shell', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = new Map();
  const puts = [];
  runInNewContext(await read('public/sw.js'), {
    URL,
    self: {
      location: { origin: 'https://photoeditor.cheaply.fr' },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: {
      match: () => Promise.resolve(undefined),
      open: () => Promise.resolve({ put: (key) => { puts.push(typeof key === 'string' ? key : key.url); return Promise.resolve(); } }),
    },
    fetch: () => Promise.resolve({ ok: true, clone() { return this; } }),
  });
  const fetchHandler = handlers.get('fetch');
  const navigate = async (path) => {
    let response;
    const request = { method: 'GET', mode: 'navigate', url: `https://photoeditor.cheaply.fr${path}` };
    fetchHandler({ request, respondWith: (value) => { response = value; } });
    await Promise.resolve(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  await navigate('/help/layers-panel');
  assert.deepEqual(puts, ['https://photoeditor.cheaply.fr/help/layers-panel']);
  await navigate('/editor');
  assert.equal(puts.at(-1), '/index.html', 'the editor shell is still cached for offline use');
});
