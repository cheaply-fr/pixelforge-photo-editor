import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CLOUD_RENDER_SCALE,
  applyFilterEffectsPixels,
  defaultCloudScale,
  effectiveFilterEffects,
  validCloudRenderSettings,
  validFilterEffects,
} from '../src/filterEffects.ts';

const ORANGE = [224, 138, 48];
const NAVY = [8, 12, 40];
const render = (patch = {}) => ({ foreground: '#e08a30', background: '#080c28', scale: 64, fill: true, ...patch });
const effect = (patch = {}, cloud = {}) =>
  effectiveFilterEffects({ type: 'clouds', amount: 100, radius: 16, seed: 9, cloudRender: render(cloud), ...patch });
const transparent = (w, h) => new Uint8ClampedArray(w * h * 4);
const solid = (w, h, rgba) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return data;
};
const pixels = (data) => {
  const out = [];
  for (let i = 0; i < data.length; i += 4) out.push(Array.from(data.slice(i, i + 4)));
  return out;
};
/** Is the colour on the segment between the two endpoint colours? */
const between = ([r, g, b], a, c) => {
  const span = [0, 1, 2].map((i) => c[i] - a[i]);
  const t = ((r - a[0]) * span[0] + (g - a[1]) * span[1] + (b - a[2]) * span[2]) /
    (span[0] ** 2 + span[1] ** 2 + span[2] ** 2);
  if (t < -0.02 || t > 1.02) return false;
  return [r, g, b].every((value, i) => Math.abs(value - (a[i] + span[i] * t)) <= 2);
};

test('colour clouds fill an empty layer with a mix of the two colours', () => {
  const out = applyFilterEffectsPixels(transparent(64, 48), 64, 48, effect());
  const all = pixels(out);
  assert.ok(all.every((p) => p[3] === 255), 'every pixel becomes opaque');
  assert.ok(all.every((p) => between(p, NAVY, ORANGE)), 'colours stay between background and foreground');
  // Real texture, not a flat fill.
  assert.ok(new Set(all.map((p) => p.join())).size > 50);
});

test('without fill, transparent pixels stay untouched and opaque ones are coloured', () => {
  const source = transparent(16, 8);
  for (let x = 0; x < 8; x += 1) source.set([200, 200, 200, 255], x * 4);
  const out = applyFilterEffectsPixels(source, 16, 8, effect({}, { fill: false }));
  const all = pixels(out);
  for (let x = 0; x < 8; x += 1) {
    assert.equal(all[x][3], 255);
    assert.ok(between(all[x], NAVY, ORANGE), `pixel ${x}`);
  }
  for (let i = 8; i < all.length; i += 1) assert.deepEqual(all[i], [0, 0, 0, 0]);
});

test('amount mixes with existing pixels and sets partial coverage on empty ones', () => {
  const half = effect({ amount: 50 });
  const filled = pixels(applyFilterEffectsPixels(transparent(8, 8), 8, 8, half));
  assert.ok(filled.every((p) => p[3] === 128 || p[3] === 127));
  const grey = pixels(applyFilterEffectsPixels(solid(8, 8, [100, 100, 100, 255]), 8, 8, half));
  const full = pixels(applyFilterEffectsPixels(solid(8, 8, [100, 100, 100, 255]), 8, 8, effect()));
  grey.forEach((p, i) => {
    for (let c = 0; c < 3; c += 1) assert.ok(Math.abs(p[c] - (100 + full[i][c]) / 2) <= 1);
    assert.equal(p[3], 255);
  });
});

test('the same seed, scale and colours always render the same pixels', () => {
  const a = applyFilterEffectsPixels(transparent(40, 30), 40, 30, effect());
  const b = applyFilterEffectsPixels(transparent(40, 30), 40, 30, effect());
  assert.deepEqual(a, b);
  const otherSeed = applyFilterEffectsPixels(transparent(40, 30), 40, 30, effect({ seed: 10 }));
  assert.notDeepEqual(a, otherSeed);
  const swapped = applyFilterEffectsPixels(transparent(40, 30), 40, 30,
    effect({}, { foreground: '#080c28', background: '#e08a30' }));
  // Swapping the colours inverts the mix.
  pixels(a).forEach((p, i) => {
    const q = pixels(swapped)[i];
    for (let c = 0; c < 3; c += 1) assert.ok(Math.abs(p[c] + q[c] - (NAVY[c] + ORANGE[c])) <= 2);
  });
});

test('larger scales give smoother, larger features', () => {
  const roughness = (data, w, h) => {
    let total = 0;
    for (let y = 0; y < h; y += 1)
      for (let x = 1; x < w; x += 1) total += Math.abs(data[(y * w + x) * 4] - data[(y * w + x - 1) * 4]);
    return total / (h * (w - 1));
  };
  const small = applyFilterEffectsPixels(transparent(128, 64), 128, 64, effect({}, { scale: 4 }));
  const large = applyFilterEffectsPixels(transparent(128, 64), 128, 64, effect({}, { scale: 512 }));
  assert.ok(roughness(small, 128, 64) > roughness(large, 128, 64) * 3);
});

test('the source buffer is never modified', () => {
  const source = solid(6, 6, [10, 20, 30, 200]);
  const copy = new Uint8ClampedArray(source);
  applyFilterEffectsPixels(source, 6, 6, effect());
  assert.deepEqual(source, copy);
});

test('legacy clouds records without cloudRender render exactly as before', () => {
  const legacy = effectiveFilterEffects({ type: 'clouds', amount: 100, radius: 8, seed: 17 });
  assert.equal(legacy.cloudRender, undefined);
  const out = pixels(applyFilterEffectsPixels(transparent(8, 8), 8, 8, legacy));
  assert.ok(out.every((p) => p.join() === '0,0,0,0'), 'legacy mode leaves transparency alone');
  const grey = pixels(applyFilterEffectsPixels(solid(8, 8, [128, 128, 128, 255]), 8, 8, legacy));
  assert.ok(grey.every((p) => p[0] === p[1] && p[1] === p[2]), 'legacy mode stays grayscale');
});

test('cloud render settings are validated and dropped from other effect types', () => {
  assert.equal(validCloudRenderSettings(render()), true);
  for (const bad of [
    render({ foreground: 'orange' }),
    render({ background: '#12345' }),
    render({ scale: 1 }),
    render({ scale: MAX_CLOUD_RENDER_SCALE + 1 }),
    render({ scale: 10.5 }),
    render({ fill: 'yes' }),
    null,
    [],
  ])
    assert.equal(validCloudRenderSettings(bad), false, JSON.stringify(bad));
  assert.equal(validFilterEffects(effect()), true);
  assert.equal(
    validFilterEffects({ ...effectiveFilterEffects({ type: 'gaussian-blur', amount: 50, radius: 3 }), cloudRender: render() }),
    false,
  );
  // Malformed settings are removed during normalisation rather than trusted.
  assert.equal(effectiveFilterEffects({ type: 'clouds', amount: 50, radius: 8, cloudRender: render({ scale: 0 }) }).cloudRender, undefined);
  assert.equal(effectiveFilterEffects({ type: 'difference-clouds', amount: 50, radius: 8, cloudRender: render() }).cloudRender, undefined);
});

test('default cloud scale follows the layer size within bounds', () => {
  assert.equal(defaultCloudScale(2646, 4096), 662);
  assert.equal(defaultCloudScale(1200, 800), 200);
  assert.equal(defaultCloudScale(4, 4), 2);
  assert.equal(defaultCloudScale(100000, 100000), MAX_CLOUD_RENDER_SCALE);
  assert.equal(defaultCloudScale(0, 10), 256);
});

test('colour clouds span the full colour range even when the cloud size exceeds the image', () => {
  for (const scale of [8, 200, 2048]) {
    const out = applyFilterEffectsPixels(transparent(160, 120), 160, 120,
      effect({}, { foreground: '#ffffff', background: '#000000', scale }));
    let low = 255, high = 0;
    for (let i = 0; i < out.length; i += 4) { low = Math.min(low, out[i]); high = Math.max(high, out[i]); }
    assert.equal(low, 0, `scale ${scale} reaches the background colour`);
    assert.equal(high, 255, `scale ${scale} reaches the foreground colour`);
  }
});
