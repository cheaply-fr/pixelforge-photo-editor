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
    for (let x = 0; x < width; x += 1) data.set(fn(x, y), (y * width + x) * 4);
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const effect = (patch = {}) =>
  effectiveFilterEffects({ type: 'picture-frame', amount: 85, radius: 3, seed: 0, ...patch });

test('Picture Frame produces a deterministic inner border while retaining source bytes', () => {
  const source = rgba(9, 7, (x, y) => [x * 20, y * 25, 80, 255]);
  const retained = source.slice();
  const output = applyFilterEffectsPixels(source, 9, 7, effect());
  assert.notDeepEqual(output, source);
  assert.notDeepEqual(pixel(output, 9, 0, 0), pixel(source, 9, 0, 0));
  assert.deepEqual(pixel(output, 9, 4, 3), pixel(source, 9, 4, 3));
  assert.deepEqual(source, retained);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 7, effect()));
  assert.notEqual(output, source);
});

test('Picture Frame width and amount controls are visible in the result', () => {
  const source = rgba(11, 5, () => [180, 120, 60, 255]);
  const thin = applyFilterEffectsPixels(source, 11, 5, effect({ radius: 1 }));
  const thick = applyFilterEffectsPixels(source, 11, 5, effect({ radius: 4 }));
  const faint = applyFilterEffectsPixels(source, 11, 5, effect({ amount: 20 }));
  assert.notDeepEqual(thin, thick);
  assert.notDeepEqual(thin, faint);
  assert.deepEqual(applyFilterEffectsPixels(source, 11, 5, effect({ amount: 0 })), source);
});

test('Picture Frame seed changes colour deterministically without changing geometry', () => {
  const source = rgba(9, 7, () => [150, 150, 150, 255]);
  const first = applyFilterEffectsPixels(source, 9, 7, effect({ seed: 1 }));
  const second = applyFilterEffectsPixels(source, 9, 7, effect({ seed: 2 }));
  assert.notDeepEqual(pixel(first, 9, 0, 0), pixel(second, 9, 0, 0));
  assert.deepEqual(first, applyFilterEffectsPixels(source, 9, 7, effect({ seed: 1 })));
});

test('Picture Frame preserves alpha and hidden transparent RGB padding', () => {
  const source = rgba(6, 4, (x, y) =>
    x === 0 || y === 0 ? [255, 17, 99, 0] : [30 + x * 3, 50 + y * 5, 70, 120],
  );
  const output = applyFilterEffectsPixels(source, 6, 4, effect({ radius: 64 }));
  for (let index = 0; index < source.length; index += 4) {
    assert.equal(output[index + 3], source[index + 3]);
    if (source[index + 3] === 0) assert.deepEqual(Array.from(output.slice(index, index + 4)), Array.from(source.slice(index, index + 4)));
  }
});

test('Picture Frame is identity on fully transparent and one-pixel images', () => {
  const transparent = rgba(4, 3, () => [255, 0, 255, 0]);
  assert.deepEqual(applyFilterEffectsPixels(transparent, 4, 3, effect()), transparent);
  const one = rgba(1, 1, () => [80, 100, 120, 200]);
  const framed = applyFilterEffectsPixels(one, 1, 1, effect({ radius: 64 }));
  assert.equal(framed[3], 200);
  assert.notDeepEqual(framed, one);
});

test('Picture Frame keeps exact detached identity for neutral controls', () => {
  const source = rgba(8, 2, (x, y) => [x * 20, y * 100, 40, x === 0 ? 0 : 255]);
  for (const patch of [{ amount: 0 }, { radius: 0 }, { type: 'none' }]) {
    const settings = effectiveFilterEffects({ ...effect(), ...patch });
    assert.equal(isNeutralFilterEffects(settings), true);
    const output = applyFilterEffectsPixels(source, 8, 2, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
});

test('Picture Frame metadata clamps at persistence boundaries and rejects invalid records', () => {
  const settings = effect({ amount: 300, radius: 99, seed: 4294967296, centerX: -2 });
  assert.deepEqual(settings, { type: 'picture-frame', amount: 100, radius: 64, angle: 0, centerX: 0, centerY: 0.5, seed: 0 });
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [{ radius: 1.5 }, { radius: 65 }, { amount: NaN }, { amount: -1 }, { seed: -1 }])
    assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
});

test('Picture Frame metadata survives validated document round trips', () => {
  const settings = effect({ radius: 8, amount: 67, seed: 42 });
  const layer = {
    ...commonLayer('Picture Frame correction'),
    kind: 'adjustment',
    adjustments: { ...neutral, filterEffects: settings },
  };
  const frame = { w: 9, h: 7, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] };
  const restored = JSON.parse(JSON.stringify(frame));
  assert.doesNotThrow(() => validateFrame(restored, {}));
  assert.deepEqual(restored.layers[0].adjustments.filterEffects, settings);
  assert.throws(() => validateFrame({ ...restored, layers: [{ ...layer, adjustments: { ...neutral, filterEffects: { ...settings, radius: 65 } } }] }, {}), /Invalid layer document/);
});

test('Picture Frame rejects incompatible dimensions and RGBA buffers', () => {
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 0, 1, effect()), RangeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 16001, 1, effect()), RangeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 4001, 4000, effect()), RangeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(3), 1, 1, effect()), RangeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8Array(4), 1, 1, effect()), TypeError);
});

test('Picture Frame command is allow-listed and round-trips through Action recipes', () => {
  const now = new Date('2026-10-10T20:00:00Z');
  const source = createActionSet('Frame finish', 'picture-frame-action', now);
  const recipe = appendActionStep(source, 'filter-picture-frame', 'Picture Frame', undefined, 'frame-step', now);
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
