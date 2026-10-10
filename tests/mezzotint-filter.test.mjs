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
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const effect = (patch = {}) =>
  effectiveFilterEffects({
    type: 'mezzotint',
    amount: 100,
    radius: 7,
    seed: 17,
    mezzotint: { grain: 'medium' },
    ...patch,
  });

test('Mezzotint is deterministic, monochrome at full strength and source-safe', () => {
  const source = rgba(17, 9, (x, y) => [x * 13, y * 24, (x * 31 + y * 9) % 255, 255]);
  const retained = source.slice();
  const settings = effect();
  const first = applyFilterEffectsPixels(source, 17, 9, settings);
  const second = applyFilterEffectsPixels(source, 17, 9, settings);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.notEqual(first, source);
  assert.deepEqual(source, retained);
  for (let offset = 0; offset < first.length; offset += 4) {
    assert.equal(first[offset], first[offset + 1]);
    assert.equal(first[offset + 1], first[offset + 2]);
    assert.equal(first[offset + 3], 255);
  }
});

test('Mezzotint seed and grain mode change the bounded grain field', () => {
  const source = rgba(21, 13, (x, y) => [x * 11, y * 17, (x * 7 + y * 29) % 255, 255]);
  const fine = applyFilterEffectsPixels(source, 21, 13, effect({ seed: 4, mezzotint: { grain: 'fine' } }));
  const coarse = applyFilterEffectsPixels(source, 21, 13, effect({ seed: 5, mezzotint: { grain: 'coarse' } }));
  assert.notDeepEqual(fine, coarse);
  assert.deepEqual(fine, applyFilterEffectsPixels(source, 21, 13, effect({ seed: 4, mezzotint: { grain: 'fine' } })));
});

test('Mezzotint amount/radius identities and tiny dimensions return detached buffers', () => {
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

test('Mezzotint preserves alpha and transparent hidden RGB while staying in bounds', () => {
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

test('Mezzotint metadata normalizes, validates and survives document round trip', () => {
  const settings = effect({
    amount: 300,
    radius: 98,
    seed: -1,
    mezzotint: { grain: 'invalid' },
  });
  assert.deepEqual(settings.mezzotint, { grain: 'medium' });
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.seed, 0xffffffff);
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [
    { amount: -1 },
    { radius: 65 },
    { seed: -1 },
    { mezzotint: { grain: 'posterize' } },
  ])
    assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
  const layer = {
    ...commonLayer('Mezzotint correction'),
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
      layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, mezzotint: { grain: 'posterize' } } } }],
    }, {}),
    /Invalid layer document/,
  );
});

test('Mezzotint command is allow-listed for deterministic Action round trips', () => {
  const time = new Date('2026-10-10T20:00:00Z');
  const source = createActionSet('Mezzotint finish', 'mezzotint-action', time);
  const recipe = appendActionStep(
    source,
    'filter-mezzotint',
    'Mezzotint',
    undefined,
    'mezzotint-step',
    time,
  );
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
