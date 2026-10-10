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
  REPLAYABLE_ACTION_COMMANDS,
} from '../src/actions.ts';

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
    type: 'fibers',
    amount: 85,
    radius: 10,
    seed: 17,
    fibers: { variance: 50 },
    ...patch,
  });

test('Fibers is deterministic, changes visible pixels and leaves source untouched', () => {
  const source = rgba(19, 11, (x, y) => [x * 13, y * 21, (x * 31 + y * 7) % 255, 255]);
  const retained = source.slice();
  const settings = effect();
  const first = applyFilterEffectsPixels(source, 19, 11, settings);
  const second = applyFilterEffectsPixels(source, 19, 11, settings);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
});

test('Fibers seed, scale and variance change the bounded filament field', () => {
  const source = rgba(24, 13, () => [120, 160, 200, 255]);
  const first = applyFilterEffectsPixels(source, 24, 13, effect({ seed: 4, radius: 6, fibers: { variance: 10 } }));
  const second = applyFilterEffectsPixels(source, 24, 13, effect({ seed: 5, radius: 22, fibers: { variance: 64 } }));
  assert.notDeepEqual(first, second);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 24, 13, effect({ seed: 4, radius: 6, fibers: { variance: 10 } })));
});

test('Fibers amount/radius identities return detached buffers and preserve tiny alpha', () => {
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
  assert.deepEqual(output, applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 })));
});

test('Fibers preserves alpha and hidden RGB in transparent pixels', () => {
  const source = rgba(4, 4, (x, y) =>
    x === 0 && y === 0
      ? [255, 0, 255, 0]
      : x === 1 && y === 1
        ? [40, 80, 120, 128]
        : [x * 50, y * 60, 20, 255],
  );
  const output = applyFilterEffectsPixels(source, 4, 4, effect({ seed: 91 }));
  assert.deepEqual(pixel(output, 4, 0, 0), [255, 0, 255, 0]);
  assert.equal(pixel(output, 4, 1, 1)[3], 128);
  for (let offset = 0; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
});

test('Fibers metadata normalizes, validates and survives document round trip', () => {
  const settings = effect({ amount: 300, radius: 98, seed: -1, fibers: { variance: 100 } });
  assert.deepEqual(settings.fibers, { variance: 64 });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [
    { amount: -1 },
    { radius: 65 },
    { seed: -1 },
    { fibers: { variance: 0 } },
    { fibers: { variance: 65 } },
  ]) assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
  const layer = {
    ...commonLayer('Fibers render'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = { w: 5, h: 3, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
  assert.throws(() => validateFrame({
    ...restored,
    layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, fibers: { variance: 0 } } } }],
  }, {}), /Invalid layer document/);
});

test('Fibers command is allow-listed for deterministic Action round trips', () => {
  assert.equal(REPLAYABLE_ACTION_COMMANDS.has('filter-fibers'), true);
  const time = new Date('2026-10-11T20:00:00Z');
  const source = createActionSet('Fibers finish', 'fibers-action', time);
  const recipe = appendActionStep(source, 'filter-fibers', 'Fibers', undefined, 'fibers-step', time);
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
