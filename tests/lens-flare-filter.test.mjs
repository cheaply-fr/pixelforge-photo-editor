import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { commonLayer, neutral, validateFrame } from '../src/document.ts';
import { appendActionStep, createActionSet, parseActionSets, serializeActionSets } from '../src/actions.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const effect = (patch = {}) =>
  effectiveFilterEffects({
    type: 'lens-flare',
    amount: 100,
    radius: 32,
    angle: 18,
    centerX: 0.47,
    centerY: 0.54,
    seed: 17,
    ...patch,
  });

test('Lens Flare is deterministic, visibly additive and source-safe', () => {
  const source = rgba(64, 40, () => [32, 48, 80, 255]);
  const retained = source.slice();
  const settings = effect();
  const first = applyFilterEffectsPixels(source, 64, 40, settings);
  const second = applyFilterEffectsPixels(source, 64, 40, settings);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
  assert.ok(first.some((value, index) => index % 4 !== 3 && value > source[index]));
});

test('Lens Flare seed, centre and angle change the bounded ghost field', () => {
  const source = rgba(80, 50, (x, y) => [x * 2, y * 3, (x * 7 + y * 11) % 255, 255]);
  const first = applyFilterEffectsPixels(source, 80, 50, effect({ seed: 4 }));
  const changed = applyFilterEffectsPixels(source, 80, 50, effect({ seed: 5, centerX: 0.2, angle: -64 }));
  assert.notDeepEqual(first, changed);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 80, 50, effect({ seed: 4 })));
});

test('Lens Flare amount/radius identities return detached buffers', () => {
  const source = rgba(5, 3, (x, y) => [x * 40, y * 50, 90, x === 0 ? 0 : 128]);
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const settings = effect(controls);
    assert.equal(isNeutralFilterEffects(settings), true);
    const output = applyFilterEffectsPixels(source, 5, 3, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  const tinyOutput = applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 }));
  assert.equal(tinyOutput.length, tiny.length);
  assert.equal(tinyOutput[3], 85);
  assert.deepEqual(tinyOutput, applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 })));
});

test('Lens Flare preserves alpha and transparent hidden RGB', () => {
  const source = rgba(7, 5, (x, y) =>
    x === 0 && y === 0
      ? [255, 0, 255, 0]
      : x === 1 && y === 1
        ? [40, 80, 120, 128]
        : [x * 31, y * 41, 20, 255],
  );
  const output = applyFilterEffectsPixels(source, 7, 5, effect({ seed: 91 }));
  assert.deepEqual(pixel(output, 7, 0, 0), [255, 0, 255, 0]);
  for (let offset = 0; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
  assert.equal(pixel(output, 7, 1, 1)[3], 128);
});

test('Lens Flare metadata normalizes, validates, persists and is action allow-listed', () => {
  const settings = effect({ amount: 300, radius: 98, centerX: -2, centerY: 2, angle: 999, seed: -1 });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.centerX, 0);
  assert.equal(settings.centerY, 1);
  assert.equal(settings.angle, 180);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  const layer = {
    ...commonLayer('Lens Flare correction'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = { w: 5, h: 3, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
  assert.throws(() => validateFrame({
    ...restored,
    layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, amount: -1 } } }],
  }), /Invalid layer document/);
  const now = new Date('2026-10-11T01:00:00Z');
  const action = appendActionStep(createActionSet('Lens Flare finish', 'lens-flare-action', now), 'filter-lens-flare', 'Lens Flare');
  const parsed = parseActionSets(serializeActionSets([action]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].steps[0].command, 'filter-lens-flare');
});

test('the optimised Lens Flare kernel matches the reference per-pixel formula byte for byte', async () => {
  // Reference: the original formula (every Gaussian term evaluated per pixel).
  const reference = (source, width, height, value) => {
    const e = effectiveFilterEffects(value);
    const output = new Uint8ClampedArray(source);
    const fill = e.flareFill === true, seed = e.seed >>> 0, strength = e.amount / 100;
    const hash = (v) => {
      let n = Math.imul((v | 0) ^ seed, 374761393);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
    };
    const hue = hash(17) * Math.PI * 2;
    const palette = (p) => [0.5 + 0.5 * Math.sin(hue + p), 0.5 + 0.5 * Math.sin(hue + p + (Math.PI * 2) / 3), 0.5 + 0.5 * Math.sin(hue + p + (Math.PI * 4) / 3)];
    const cx = Math.min(1, Math.max(0, e.centerX)) * Math.max(0, width - 1), cy = Math.min(1, Math.max(0, e.centerY)) * Math.max(0, height - 1);
    const r = (e.angle * Math.PI) / 180, ax = Math.cos(r), ay = Math.sin(r), nx = -ay, ny = ax;
    const spread = Math.max(6, (Math.max(1, Math.min(64, e.radius)) / 64) * Math.min(width, height) * 0.92);
    const ringWidth = Math.max(1.5, spread * 0.035), coreWidth = Math.max(1.5, spread * 0.075);
    const ghosts = [-0.84, -0.48, 0.28, 0.63].map((p, i) => ({ position: p * spread, radius: spread * (0.06 + hash(i + 31) * 0.08), intensity: 0.22 + hash(i + 61) * 0.18, colour: palette(i * 0.9 + 0.4) }));
    const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4, alpha = source[o + 3];
      if (!alpha && !fill) continue;
      const dx = x - cx, dy = y - cy, along = dx * ax + dy * ay, across = dx * nx + dy * ny, d = Math.hypot(dx, dy);
      const core = Math.exp(-((d / coreWidth) ** 2)) * 1.35;
      const ring = Math.exp(-((Math.abs(d - spread * 0.34) / ringWidth) ** 2)) * 0.5;
      const star = Math.exp(-((across / Math.max(1, spread * 0.012)) ** 2)) * Math.exp(-((along / Math.max(1, spread * 0.9)) ** 2)) * 0.22;
      const m = palette(0);
      let red = core * 1.05 + ring * m[0] + star, green = core * 0.92 + ring * m[1] + star * 0.88, blue = core * 0.7 + ring * m[2] + star * 0.72;
      for (const g of ghosts) {
        const glow = Math.exp(-((Math.hypot(along - g.position, across) / Math.max(1.5, g.radius)) ** 2)) * g.intensity;
        red += glow * g.colour[0]; green += glow * g.colour[1]; blue += glow * g.colour[2];
      }
      const flare = Math.min(1.8, Math.max(0, red + green + blue) / 2.2) * strength;
      if (flare <= 0) continue;
      if (!alpha) {
        const lr = Math.min(255, red * 180 * flare), lg = Math.min(255, green * 180 * flare), lb = Math.min(255, blue * 180 * flare);
        const c = Math.max(lr, lg, lb);
        if (c < 0.5) continue;
        output[o] = byte((lr * 255) / c); output[o + 1] = byte((lg * 255) / c); output[o + 2] = byte((lb * 255) / c); output[o + 3] = byte(c);
        continue;
      }
      output[o] = byte(source[o] + red * 180 * flare); output[o + 1] = byte(source[o + 1] + green * 180 * flare); output[o + 2] = byte(source[o + 2] + blue * 180 * flare); output[o + 3] = alpha;
    }
    return output;
  };
  const width = 211, height = 157;
  const source = rgba(width, height, (x, y) => [(x * 7) & 255, (y * 5) & 255, 90, (x + y) % 9 === 0 ? 0 : (x * 3 + y) & 255]);
  for (const patch of [{}, { flareFill: true }, { radius: 64, angle: 133, centerX: 0.95, centerY: 0.05, seed: 3 }, { radius: 4, amount: 40, flareFill: true }]) {
    const settings = effect(patch);
    assert.deepEqual(applyFilterEffectsPixels(source, width, height, settings), reference(source, width, height, settings), JSON.stringify(patch));
  }
});
