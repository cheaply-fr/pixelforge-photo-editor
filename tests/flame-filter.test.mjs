import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';
import { commonLayer, neutral, validateFrame } from '../src/document.ts';
import {
  appendActionStep,
  createActionSet,
  parseActionSets,
  serializeActionSets,
} from '../src/actions.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const effect = (patch = {}) =>
  effectiveFilterEffects({
    type: 'flame',
    amount: 100,
    radius: 16,
    centerX: 0.5,
    centerY: 0.65,
    seed: 17,
    ...patch,
  });

test('Flame is deterministic, visibly warm and source-safe', () => {
  const source = rgba(31, 19, (x, y) => [
    x * 7,
    y * 11,
    (x * 13 + y * 5) % 255,
    255,
  ]);
  const retained = source.slice();
  const first = applyFilterEffectsPixels(source, 31, 19, effect());
  const second = applyFilterEffectsPixels(source, 31, 19, effect());
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
  const warmPixels = [];
  for (let offset = 0; offset < first.length; offset += 4) {
    assert.equal(first[offset + 3], 255);
    if (
      first[offset] > first[offset + 1] &&
      first[offset + 1] > first[offset + 2]
    )
      warmPixels.push(offset);
  }
  assert.ok(warmPixels.length > 10);
});

test('Flame seed, detail and origin change the bounded plume field', () => {
  const source = rgba(25, 17, () => [80, 90, 100, 255]);
  const seeded = applyFilterEffectsPixels(source, 25, 17, effect({ seed: 4 }));
  const changedSeed = applyFilterEffectsPixels(
    source,
    25,
    17,
    effect({ seed: 5 }),
  );
  const changedDetail = applyFilterEffectsPixels(
    source,
    25,
    17,
    effect({ radius: 4 }),
  );
  const changedOrigin = applyFilterEffectsPixels(
    source,
    25,
    17,
    effect({ centerX: 0.2, centerY: 0.35 }),
  );
  assert.notDeepEqual(seeded, changedSeed);
  assert.notDeepEqual(seeded, changedDetail);
  assert.notDeepEqual(seeded, changedOrigin);
  assert.deepEqual(
    seeded,
    applyFilterEffectsPixels(source, 25, 17, effect({ seed: 4 })),
  );
});

test('Flame identities and tiny dimensions return detached safe buffers', () => {
  const source = rgba(5, 3, (x, y) => [x * 40, y * 50, 90, x === 0 ? 0 : 128]);
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const settings = effect(controls);
    assert.equal(isNeutralFilterEffects(settings), true);
    const output = applyFilterEffectsPixels(source, 5, 3, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  const tinyOutput = applyFilterEffectsPixels(
    tiny,
    1,
    1,
    effect({ radius: 64 }),
  );
  assert.equal(tinyOutput.length, tiny.length);
  assert.equal(tinyOutput[3], 85);
  assert.deepEqual(
    tinyOutput,
    applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 })),
  );
});

test('Flame preserves alpha and transparent hidden RGB while staying in bounds', () => {
  const source = rgba(7, 7, (x, y) =>
    x === 0 && y === 0
      ? [255, 0, 255, 0]
      : x === 1 && y === 1
        ? [40, 80, 120, 128]
        : [x * 30, y * 20, 20, 255],
  );
  const output = applyFilterEffectsPixels(source, 7, 7, effect({ seed: 91 }));
  assert.deepEqual(pixel(output, 7, 0, 0), [255, 0, 255, 0]);
  assert.equal(pixel(output, 7, 1, 1)[3], 128);
  for (let offset = 0; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
});

test('Flame metadata normalizes, validates and survives document round trip', () => {
  const settings = effect({
    amount: 300,
    radius: 98,
    centerX: -2,
    centerY: 3,
    seed: -1,
  });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.centerX, 0);
  assert.equal(settings.centerY, 1);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [
    { amount: -1 },
    { radius: 65 },
    { centerX: 2 },
    { seed: -1 },
  ])
    assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
  const layer = {
    ...commonLayer('Flame correction'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = {
    w: 7,
    h: 7,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
});

test('Flame command is allow-listed for deterministic Action round trips', () => {
  const time = new Date('2026-10-11T00:00:00Z');
  const source = createActionSet('Flame finish', 'flame-action', time);
  const recipe = appendActionStep(
    source,
    'filter-flame',
    'Flame',
    undefined,
    'flame-step',
    time,
  );
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
