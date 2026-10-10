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
    type: 'clouds',
    amount: 100,
    radius: 8,
    seed: 17,
    ...patch,
  });

test('Clouds is deterministic and leaves the source buffer unchanged', () => {
  const source = rgba(21, 13, (x, y) => [
    x * 11,
    y * 17,
    (x * 7 + y * 29) % 255,
    255,
  ]);
  const retained = source.slice();
  const first = applyFilterEffectsPixels(source, 21, 13, effect());
  const second = applyFilterEffectsPixels(source, 21, 13, effect());
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
});

test('Clouds seed and scale change the deterministic noise field', () => {
  const source = rgba(32, 16, () => [80, 120, 170, 255]);
  const first = applyFilterEffectsPixels(
    source,
    32,
    16,
    effect({ seed: 4, radius: 4 }),
  );
  const second = applyFilterEffectsPixels(
    source,
    32,
    16,
    effect({ seed: 5, radius: 4 }),
  );
  const coarse = applyFilterEffectsPixels(
    source,
    32,
    16,
    effect({ seed: 4, radius: 14 }),
  );
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(first, coarse);
  assert.deepEqual(
    first,
    applyFilterEffectsPixels(source, 32, 16, effect({ seed: 4, radius: 4 })),
  );
});

test('Clouds amount and radius identities return detached safe buffers', () => {
  const source = rgba(5, 3, (x, y) => [x * 40, y * 50, 90, x === 0 ? 0 : 128]);
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const settings = effect(controls);
    assert.equal(isNeutralFilterEffects(settings), true);
    const output = applyFilterEffectsPixels(source, 5, 3, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  const output = applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 }));
  assert.equal(output.length, tiny.length);
  assert.equal(output[3], 85);
  assert.deepEqual(
    output,
    applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 })),
  );
});

test('Clouds preserves alpha and transparent hidden RGB', () => {
  const source = rgba(7, 7, (x, y) =>
    x === 0 && y === 0
      ? [255, 0, 255, 0]
      : x === 1 && y === 1
        ? [40, 80, 120, 128]
        : [x * 30, y * 30, 12, 255],
  );
  const output = applyFilterEffectsPixels(source, 7, 7, effect({ seed: 91 }));
  assert.deepEqual(pixel(output, 7, 0, 0), [255, 0, 255, 0]);
  assert.equal(pixel(output, 7, 1, 1)[3], 128);
  for (let offset = 0; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
});

test('Clouds metadata is bounded, round-trips and rejects malformed values', () => {
  const settings = effect({ amount: 300, radius: 98, seed: -1 });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  const layer = {
    ...commonLayer('Clouds correction'),
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
  assert.equal(validFilterEffects({ ...settings, seed: 1.5 }), false);
});

test('Clouds command is allow-listed for deterministic Action round trips', () => {
  const time = new Date('2026-10-11T20:00:00Z');
  const source = createActionSet('Cloud finish', 'clouds-action', time);
  const recipe = appendActionStep(
    source,
    'filter-clouds',
    'Clouds',
    undefined,
    'clouds-step',
    time,
  );
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
