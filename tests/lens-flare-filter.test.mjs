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
