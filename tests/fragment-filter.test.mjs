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
    type: 'fragment',
    amount: 100,
    radius: 1,
    ...patch,
  });

test('Fragment averages four offset copies with an exact impulse footprint and detached source', () => {
  const source = rgba(5, 5, (x, y) => [
    x === 2 && y === 2 ? 255 : 0,
    0,
    0,
    255,
  ]);
  const retained = source.slice();
  const output = applyFilterEffectsPixels(source, 5, 5, effect());
  for (let y = 0; y < 5; y += 1)
    for (let x = 0; x < 5; x += 1) {
      const red = (x === 1 || x === 3) && (y === 1 || y === 3) ? 64 : 0;
      assert.deepEqual(pixel(output, 5, x, y), [red, 0, 0, 255]);
    }
  assert.deepEqual(output, applyFilterEffectsPixels(source, 5, 5, effect()));
  assert.deepEqual(source, retained);
  assert.notEqual(output, source);
});

test('Fragment offset changes the copy geometry and amount blends the immutable source', () => {
  const source = rgba(7, 7, (x, y) => [
    x === 3 && y === 3 ? 255 : 0,
    0,
    0,
    255,
  ]);
  const shifted = applyFilterEffectsPixels(source, 7, 7, effect({ radius: 2 }));
  assert.deepEqual(pixel(shifted, 7, 1, 1), [64, 0, 0, 255]);
  assert.deepEqual(pixel(shifted, 7, 2, 2), [0, 0, 0, 255]);
  const mixed = applyFilterEffectsPixels(source, 7, 7, effect({ amount: 50 }));
  assert.deepEqual(pixel(mixed, 7, 3, 3), [128, 0, 0, 255]);
  assert.deepEqual(pixel(mixed, 7, 2, 2), [32, 0, 0, 255]);
});

test('Fragment clamps edges and remains stable on one-dimensional and tiny images', () => {
  for (const [width, height] of [
    [3, 1],
    [1, 3],
  ]) {
    const source = rgba(width, height, (x, y) => [(x + y) * 100, 40, 80, 255]);
    const output = applyFilterEffectsPixels(source, width, height, effect());
    assert.deepEqual(
      Array.from(output).filter((_byte, index) => index % 4 === 0),
      [50, 100, 150],
    );
    const far = applyFilterEffectsPixels(
      source,
      width,
      height,
      effect({ radius: 64 }),
    );
    assert.deepEqual(
      Array.from(far).filter((_byte, index) => index % 4 === 0),
      [100, 100, 100],
    );
  }
  const tiny = rgba(1, 1, () => [20, 50, 90, 85]);
  assert.deepEqual(
    applyFilterEffectsPixels(tiny, 1, 1, effect({ radius: 64 })),
    tiny,
  );
  const flat = rgba(8, 5, () => [28, 90, 160, 255]);
  assert.deepEqual(
    applyFilterEffectsPixels(flat, 8, 5, effect({ radius: 3 })),
    flat,
  );
});

test('Fragment excludes hidden RGB, weights partial alpha and retains destination alpha', () => {
  const source = rgba(3, 3, () => [10, 20, 30, 128]);
  source.set([255, 0, 0, 255], 0);
  source.set([0, 0, 255, 85], 8);
  source.set([255, 0, 255, 0], 24);
  source.set([0, 255, 0, 0], 32);
  const output = applyFilterEffectsPixels(source, 3, 3, effect());
  assert.deepEqual(pixel(output, 3, 1, 1), [191, 0, 64, 128]);
  for (let index = 0; index < source.length; index += 4) {
    assert.equal(output[index + 3], source[index + 3]);
    if (!source[index + 3])
      assert.deepEqual(
        Array.from(output.slice(index, index + 4)),
        Array.from(source.slice(index, index + 4)),
      );
  }
  const transparent = rgba(4, 4, () => [255, 0, 255, 0]);
  assert.deepEqual(
    applyFilterEffectsPixels(transparent, 4, 4, effect()),
    transparent,
  );
});

test('Fragment leaves a visible destination unchanged when all four copies are transparent', () => {
  const source = rgba(3, 3, (x, y) =>
    x === 1 && y === 1 ? [40, 70, 110, 180] : [255, 0, 255, 0],
  );
  assert.deepEqual(applyFilterEffectsPixels(source, 3, 3, effect()), source);
});

test('Fragment amount and offset identities return exact independent buffers', () => {
  const source = rgba(5, 3, (x, y) => [x * 40, y * 50, 90, x === 0 ? 0 : 128]);
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const settings = effect(controls);
    assert.equal(isNeutralFilterEffects(settings), true);
    const output = applyFilterEffectsPixels(source, 5, 3, settings);
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
});

test('Fragment metadata is normalized, validated and retained through a document round trip', () => {
  const settings = effect({
    amount: 300,
    radius: 98,
    centerX: -1,
    angle: Infinity,
  });
  assert.equal(settings.type, 'fragment');
  assert.equal(settings.amount, 100);
  assert.equal(settings.radius, 64);
  assert.equal(settings.centerX, 0);
  assert.equal(settings.angle, 0);
  assert.equal(validFilterEffects(settings), true);
  for (const invalid of [
    { radius: 1.5 },
    { radius: 65 },
    { amount: NaN },
    { amount: -1 },
    { seed: -1 },
  ])
    assert.equal(validFilterEffects({ ...settings, ...invalid }), false);
  const layer = {
    ...commonLayer('Fragment correction'),
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
    () =>
      validateFrame(
        {
          ...restored,
          layers: [
            {
              ...layer,
              adjustments: {
                ...neutral,
                filterEffects: { ...settings, radius: 65 },
              },
            },
          ],
        },
        {},
      ),
    /Invalid layer document/,
  );
});

test('Fragment rejects incompatible dimensions and RGBA buffer shape', () => {
  assert.throws(
    () => applyFilterEffectsPixels(new Uint8ClampedArray(4), 0, 1, effect()),
    RangeError,
  );
  assert.throws(
    () =>
      applyFilterEffectsPixels(new Uint8ClampedArray(4), 16001, 1, effect()),
    RangeError,
  );
  assert.throws(
    () =>
      applyFilterEffectsPixels(new Uint8ClampedArray(4), 4001, 4000, effect()),
    RangeError,
  );
  assert.throws(
    () => applyFilterEffectsPixels(new Uint8ClampedArray(3), 1, 1, effect()),
    RangeError,
  );
  assert.throws(
    () => applyFilterEffectsPixels(new Uint8Array(4), 1, 1, effect()),
    TypeError,
  );
});

test('Fragment command records and round-trips as a deterministic local action', () => {
  const time = new Date('2026-10-10T20:00:00Z');
  const source = createActionSet('Offset copies', 'fragment-action', time);
  const recipe = appendActionStep(
    source,
    'filter-fragment',
    'Fragment',
    undefined,
    'fragment-step',
    time,
  );
  assert.deepEqual(source.steps, []);
  assert.deepEqual(parseActionSets(serializeActionSets([recipe])), [recipe]);
});
