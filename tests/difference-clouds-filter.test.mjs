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
    for (let x = 0; x < width; x += 1)
      data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
const effect = (patch = {}) =>
  effectiveFilterEffects({
    type: 'difference-clouds',
    amount: 100,
    radius: 8,
    seed: 31,
    ...patch,
  });

test('Difference Clouds is deterministic, source-safe and visibly difference-blended', () => {
  const source = rgba(23, 13, (x, y) => [x * 9, y * 17, (x * 29 + y * 7) % 255, 255]);
  const retained = source.slice();
  const settings = effect();
  const first = applyFilterEffectsPixels(source, 23, 13, settings);
  const second = applyFilterEffectsPixels(source, 23, 13, settings);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
});

test('Difference Clouds seed and scale change the bounded cloud field', () => {
  const source = rgba(31, 17, (x, y) => [120, 80 + x * 2, 40 + y * 5, 255]);
  const seedA = applyFilterEffectsPixels(source, 31, 17, effect({ seed: 4, radius: 5 }));
  const seedB = applyFilterEffectsPixels(source, 31, 17, effect({ seed: 5, radius: 5 }));
  const larger = applyFilterEffectsPixels(source, 31, 17, effect({ seed: 4, radius: 17 }));
  assert.notDeepEqual(seedA, seedB);
  assert.notDeepEqual(seedA, larger);
  assert.deepEqual(seedA, applyFilterEffectsPixels(source, 31, 17, effect({ seed: 4, radius: 5 })));
});

test('Difference Clouds identities return detached buffers and preserve alpha padding', () => {
  const source = rgba(5, 3, (x, y) =>
    x === 0 && y === 0
      ? [255, 0, 255, 0]
      : x === 1 && y === 1
        ? [40, 80, 120, 128]
        : [x * 40, y * 50, 90, 255],
  );
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const output = applyFilterEffectsPixels(source, 5, 3, effect(controls));
    assert.equal(isNeutralFilterEffects(effect(controls)), true);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const output = applyFilterEffectsPixels(source, 5, 3, effect());
  assert.deepEqual(pixel(output, 5, 0, 0), [255, 0, 255, 0]);
  for (let offset = 0; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  const tinyOutput = applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 }));
  assert.equal(tinyOutput.length, tiny.length);
  assert.equal(tinyOutput[3], 85);
});

test('Difference Clouds metadata normalizes, validates and survives document round trip', () => {
  const settings = effect({ amount: 300, radius: 98, seed: -1 });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [{ amount: -1 }, { radius: 65 }, { radius: 1.5 }, { seed: -1 }])
    assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
  const layer = {
    ...commonLayer('Difference Clouds correction'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = {
    w: 5,
    h: 3,
    layers: [layer],
    active: layer.id,
    selectedLayerIds: [layer.id],
  };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
  assert.throws(
    () => validateFrame({
      ...restored,
      layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, radius: 65 } } }],
    }, {}),
    /Invalid layer document/,
  );
});

test('Difference Clouds command is allow-listed for deterministic Action round trips', () => {
  const time = new Date('2026-10-11T20:00:00Z');
  const source = createActionSet('Difference Clouds finish', 'difference-clouds-action', time);
  const recipe = appendActionStep(
    source,
    'filter-difference-clouds',
    'Difference Clouds',
    undefined,
    'difference-clouds-step',
    time,
  );
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});

