import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  neutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fn(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  return data;
};
const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

const fixture = () => rgba(9, 5, (x, y) => [x * 22, y * 38, (x + y) * 12, x === 0 && y === 0 ? 0 : 255]);

test('Filter effect metadata is bounded and legacy/empty values normalize safely', () => {
  const value = effectiveFilterEffects({ type: 'mosaic', amount: 200, radius: -4, centerX: 4, seed: -1 });
  assert.equal(value.type, 'mosaic');
  assert.deepEqual({ amount: value.amount, radius: value.radius, centerX: value.centerX, seed: value.seed }, { amount: 100, radius: 0, centerX: 1, seed: 0xffffffff });
  assert.equal(effectiveFilterEffects(undefined).type, 'none');
  assert.equal(isNeutralFilterEffects(neutralFilterEffects), true);
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, radius: 1.5 }), false);
});

test('field blur is deterministic, source-safe and alpha-safe', () => {
  const source = fixture();
  const original = source.slice();
  const first = applyFilterEffectsPixels(source, 9, 5, { type: 'field-blur', amount: 100, radius: 2 });
  const second = applyFilterEffectsPixels(source, 9, 5, { type: 'field-blur', amount: 100, radius: 2 });
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 9, 0, 0).slice(0, 3), pixel(source, 9, 0, 0).slice(0, 3));
  assert.notDeepEqual(pixel(first, 9, 1, 0), pixel(source, 9, 1, 0));
});

test('box and Gaussian blur are deterministic editable effects with bounded metadata', () => {
  const normalized = effectiveFilterEffects({
    type: 'gaussian-blur',
    amount: 140,
    radius: 99,
  });
  assert.deepEqual(
    {
      type: normalized.type,
      amount: normalized.amount,
      radius: normalized.radius,
    },
    { type: 'gaussian-blur', amount: 100, radius: 64 },
  );
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(
    validFilterEffects({ ...normalized, type: 'box-blur', radius: 1.5 }),
    false,
  );

  const source = rgba(9, 1, (x) => {
    if (x === 0) return [77, 66, 55, 0];
    return [x === 4 ? 255 : 0, 0, 0, 255];
  });
  const original = source.slice();
  const box = applyFilterEffectsPixels(source, 9, 1, {
    type: 'box-blur',
    amount: 100,
    radius: 2,
  });
  const gaussian = applyFilterEffectsPixels(source, 9, 1, {
    type: 'gaussian-blur',
    amount: 100,
    radius: 2,
  });
  assert.deepEqual(source, original);
  assert.deepEqual(box, applyFilterEffectsPixels(source, 9, 1, {
    type: 'box-blur',
    amount: 100,
    radius: 2,
  }));
  assert.deepEqual(gaussian, applyFilterEffectsPixels(source, 9, 1, {
    type: 'gaussian-blur',
    amount: 100,
    radius: 2,
  }));
  assert.notDeepEqual(box, gaussian);
  assert.ok(box[(4 * 4) + 0] < 255);
  assert.ok(gaussian[(3 * 4) + 0] > 0);
  assert.equal(pixel(gaussian, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(gaussian, 9, 0, 0).slice(0, 3), [77, 66, 55]);
  for (let x = 1; x < 9; x += 1)
    assert.equal(pixel(gaussian, 9, x, 0)[3], 255);
});

test('motion blur is a deterministic directional effect with source-safe alpha handling', () => {
  const source = rgba(11, 3, (x, y) => {
    if (x === 5 && y === 1) return [255, 20, 10, 255];
    if (x === 0) return [17, 28, 39, 0];
    return [0, 0, 0, 255];
  });
  const original = source.slice();
  const effect = { type: 'motion-blur', amount: 100, radius: 2, angle: 0 };
  const first = applyFilterEffectsPixels(source, 11, 3, effect);
  const second = applyFilterEffectsPixels(source, 11, 3, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 11, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 11, 0, 0).slice(0, 3), [17, 28, 39]);
  assert.ok(pixel(first, 11, 5, 1)[0] < 255);
  assert.ok(pixel(first, 11, 4, 1)[0] > 0);
  assert.equal(pixel(first, 11, 5, 1)[3], 255);
});

test('radial blur is a deterministic spin effect with editable centre and alpha safety', () => {
  const source = rgba(15, 15, (x, y) => {
    if (x === 0 && y === 0) return [31, 42, 53, 0];
    return [(x * 19 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 255];
  });
  const original = source.slice();
  const effect = {
    type: 'radial-blur',
    amount: 100,
    radius: 48,
    centerX: 0.5,
    centerY: 0.5,
  };
  const first = applyFilterEffectsPixels(source, 15, 15, effect);
  const second = applyFilterEffectsPixels(source, 15, 15, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 15, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 15, 0, 0).slice(0, 3), [31, 42, 53]);
  assert.notDeepEqual(pixel(first, 15, 2, 2), pixel(source, 15, 2, 2));
  assert.equal(pixel(first, 15, 7, 7)[3], 255);
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
});

test('radial blur normalizes bounds, preserves its exact centre and follows centre changes', () => {
  const value = effectiveFilterEffects({
    type: 'radial-blur',
    radius: 500,
    amount: 130,
    centerX: -2,
    centerY: 9,
  });
  assert.deepEqual(
    { type: value.type, radius: value.radius, amount: value.amount, centerX: value.centerX, centerY: value.centerY },
    { type: 'radial-blur', radius: 64, amount: 100, centerX: 0, centerY: 1 },
  );
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, centerX: -0.01 }), false);
  assert.equal(validFilterEffects({ ...value, radius: 1.2 }), false);

  const source = rgba(13, 13, (x, y) => [(x * 37 + y * 7) % 256, x * 13, y * 17, 255]);
  const effect = { type: 'radial-blur', radius: 50, amount: 100, centerX: 0.5, centerY: 0.5 };
  const centred = applyFilterEffectsPixels(source, 13, 13, effect);
  assert.deepEqual(pixel(centred, 13, 6, 6), pixel(source, 13, 6, 6));
  assert.notDeepEqual(
    centred,
    applyFilterEffectsPixels(source, 13, 13, { ...effect, centerX: 0.1, centerY: 0.2 }),
  );
});

test('radial blur preserves constant colour and excludes hidden transparent colours', () => {
  const source = rgba(7, 7, (x, y) => {
    if (x === 0 || y === 0) return [0, 255, 0, 0];
    return [120, 60, 30, (x + y) % 2 ? 127 : 255];
  });
  const result = applyFilterEffectsPixels(source, 7, 7, {
    type: 'radial-blur', amount: 100, radius: 64, centerX: 0, centerY: 0,
  });
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const value = pixel(result, 7, x, y);
      assert.equal(value[3], pixel(source, 7, x, y)[3]);
      assert.deepEqual(value.slice(0, 3), x === 0 || y === 0 ? [0, 255, 0] : [120, 60, 30]);
    }
  }
});

test('radial blur identity controls and tiny canvases always return a fresh safe buffer', () => {
  const source = new Uint8ClampedArray([12, 34, 56, 127]);
  for (const effect of [
    { type: 'radial-blur', amount: 100, radius: 64, centerX: 0, centerY: 1 },
    { type: 'radial-blur', amount: 0, radius: 64 },
    { type: 'radial-blur', amount: 100, radius: 0 },
  ]) {
    const result = applyFilterEffectsPixels(source, 1, 1, effect);
    assert.notEqual(result, source);
    assert.deepEqual(result, source);
  }
  const sourceLine = rgba(1, 9, (_x, y) => [y * 27, 50, 100, 255]);
  const resultLine = applyFilterEffectsPixels(sourceLine, 1, 9, {
    type: 'radial-blur', amount: 100, radius: 64, centerX: 1, centerY: 0,
  });
  assert.equal(resultLine.length, sourceLine.length);
  for (let y = 0; y < 9; y += 1) assert.equal(pixel(resultLine, 1, 0, y)[3], 255);
});

test('blur identity and tiny-canvas boundaries preserve source and alpha', () => {
  const source = new Uint8ClampedArray([12, 34, 56, 127]);
  for (const type of ['box-blur', 'gaussian-blur']) {
    assert.deepEqual(
      applyFilterEffectsPixels(source, 1, 1, { type, amount: 100, radius: 64 }),
      source,
    );
    assert.deepEqual(
      applyFilterEffectsPixels(source, 1, 1, { type, amount: 100, radius: 0 }),
      source,
    );
  }
  assert.deepEqual(
    applyFilterEffectsPixels(source, 1, 1, {
      type: 'gaussian-blur',
      amount: 0,
      radius: 64,
    }),
    source,
  );
});

test('tilt shift keeps the focus band sharper than distant pixels', () => {
  const source = rgba(15, 15, (x, y) => [(x * 17 + y * 3) % 256, (x * 5 + y * 21) % 256, (x * 11 + y * 13) % 256, 255]);
  const result = applyFilterEffectsPixels(source, 15, 15, { type: 'tilt-shift', amount: 100, radius: 2, centerY: 0.5 });
  const centreDifference = pixel(result, 15, 7, 7).reduce((sum, v, i) => sum + Math.abs(v - pixel(source, 15, 7, 7)[i]), 0);
  const edgeDifference = pixel(result, 15, 7, 0).reduce((sum, v, i) => sum + Math.abs(v - pixel(source, 15, 7, 0)[i]), 0);
  assert.ok(edgeDifference > centreDifference);
});

test('ripple uses bounded bilinear sampling with editable centre and alpha-safe edges', () => {
  const source = rgba(11, 7, (x, y) => {
    if (x === 0 && y === 0) return [19, 29, 39, 0];
    return [(x * 31 + y * 7) % 256, (y * 43 + x * 5) % 256, (x + y) * 11, 255];
  });
  const original = source.slice();
  const effect = { type: 'ripple', amount: 100, radius: 5, centerX: 0.35, centerY: 0.65 };
  const result = applyFilterEffectsPixels(source, 11, 7, effect);
  assert.deepEqual(source, original);
  assert.equal(pixel(result, 11, 0, 0)[3], 0);
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 11; x += 1) {
      assert.equal(pixel(result, 11, x, y)[3], pixel(source, 11, x, y)[3]);
    }
  }
  assert.notDeepEqual(result, source);
  assert.notDeepEqual(
    result,
    applyFilterEffectsPixels(source, 11, 7, { ...effect, centerX: 0.8, centerY: 0.2 }),
  );
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
});

test('mosaic and halftone operate by bounded cells without touching alpha', () => {
  const source = rgba(8, 4, (x, y) => [x < 4 ? 250 : 10, y * 50, x * 20, 120 + x * 10]);
  const mosaic = applyFilterEffectsPixels(source, 8, 4, { type: 'mosaic', amount: 100, radius: 4 });
  const half = applyFilterEffectsPixels(source, 8, 4, { type: 'color-halftone', amount: 100, radius: 4 });
  assert.deepEqual(pixel(mosaic, 8, 0, 0).slice(3), pixel(source, 8, 0, 0).slice(3));
  assert.deepEqual(pixel(half, 8, 7, 3).slice(3), pixel(source, 8, 7, 3).slice(3));
  assert.equal(new Set([pixel(mosaic, 8, 0, 0).slice(0, 3).join(','), pixel(mosaic, 8, 3, 3).slice(0, 3).join(',')]).size, 1);
  assert.notDeepEqual(half, source);
});

test('ripple and twirl are stable remaps and retain transparent pixels', () => {
  const source = fixture();
  for (const type of ['ripple', 'twirl']) {
    const effect = { type, amount: 85, radius: 3, angle: 80, centerX: 0.5, centerY: 0.5 };
    const result = applyFilterEffectsPixels(source, 9, 5, effect);
    assert.deepEqual(result, applyFilterEffectsPixels(source, 9, 5, effect));
    assert.deepEqual(pixel(result, 9, 0, 0), pixel(source, 9, 0, 0));
    assert.equal(result.some((value, index) => value !== source[index]), true);
  }
});

test('spherize is a bounded radial remap with editable centre and alpha-safe edges', () => {
  const source = rgba(13, 9, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [(x * 31 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 255];
  });
  const original = source.slice();
  const effect = {
    type: 'spherize',
    amount: 100,
    radius: 48,
    centerX: 0.5,
    centerY: 0.5,
  };
  const first = applyFilterEffectsPixels(source, 13, 9, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 13, 9, effect));
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 13, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 13, 0, 0).slice(0, 3), [241, 17, 233]);
  assert.deepEqual(pixel(first, 13, 6, 4), pixel(source, 13, 6, 4));
  assert.notDeepEqual(pixel(first, 13, 4, 4), pixel(source, 13, 4, 4));
  const normalized = effectiveFilterEffects({ ...effect, amount: 140, radius: 99, centerX: -2, centerY: 9 });
  assert.deepEqual(
    { type: normalized.type, amount: normalized.amount, radius: normalized.radius, centerX: normalized.centerX, centerY: normalized.centerY },
    { type: 'spherize', amount: 100, radius: 64, centerX: 0, centerY: 1 },
  );
  assert.equal(validFilterEffects(normalized), true);
  assert.deepEqual(
    applyFilterEffectsPixels(source, 13, 9, { ...effect, amount: 0 }),
    source,
  );
});

test('pinch is a bounded radial remap with editable centre and alpha-safe edges', () => {
  const source = rgba(13, 9, (x, y) => {
    if (x === 0 && y === 0) return [19, 29, 39, 0];
    return [(x * 31 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 255];
  });
  const original = source.slice();
  const effect = {
    type: 'pinch',
    amount: 100,
    radius: 64,
    centerX: 0.5,
    centerY: 0.5,
  };
  const first = applyFilterEffectsPixels(source, 13, 9, effect);
  const second = applyFilterEffectsPixels(source, 13, 9, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 13, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 13, 0, 0).slice(0, 3), [19, 29, 39]);
  // The exact centre remains stable while an adjacent covered pixel samples
  // from the pulled-in neighbourhood.
  assert.deepEqual(pixel(first, 13, 6, 4), pixel(source, 13, 6, 4));
  assert.notDeepEqual(pixel(first, 13, 4, 4), pixel(source, 13, 4, 4));
  assert.deepEqual(
    applyFilterEffectsPixels(source, 13, 9, { ...effect, amount: 0 }),
    source,
  );
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
});

test('pinch uses deterministic alpha-safe bilinear sampling for subpixel maps', () => {
  const source = rgba(2, 2, (x, y) => {
    if (x === 0 && y === 0) return [250, 5, 240, 0];
    if (x === 1 && y === 0) return [0, 255, 0, 255];
    if (x === 0 && y === 1) return [10, 20, 30, 255];
    return [40, 50, 60, 255];
  });
  const effect = { type: 'pinch', amount: 100, radius: 64, centerX: 0.5, centerY: 0.5 };
  const result = applyFilterEffectsPixels(source, 2, 2, effect);
  assert.deepEqual(result, applyFilterEffectsPixels(source, 2, 2, effect));
  // The nearest-neighbour map rounds this point back to (0, 1). Bilinear
  // sampling now exposes the fractional pull while retaining destination alpha.
  assert.notDeepEqual(pixel(result, 2, 0, 1), pixel(source, 2, 0, 1));
  assert.equal(pixel(result, 2, 0, 1)[3], 255);
  // Transparent hidden magenta at (0, 0) must not bleed into the visible mix.
  assert.ok(pixel(result, 2, 0, 1)[0] < 80);
  assert.ok(pixel(result, 2, 0, 1)[2] < 100);
  // A transparent destination keeps its original hidden RGB untouched.
  assert.deepEqual(pixel(result, 2, 0, 0), [250, 5, 240, 0]);
});

test('wave is a deterministic directional remap with wavelength and alpha-safe edges', () => {
  const source = rgba(13, 9, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [(x * 31 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, (x + y) % 3 ? 255 : 127];
  });
  const original = source.slice();
  const effect = {
    type: 'wave',
    amount: 100,
    radius: 5,
    angle: 0,
    centerX: 0.5,
    centerY: 0.5,
  };
  const first = applyFilterEffectsPixels(source, 13, 9, effect);
  const second = applyFilterEffectsPixels(source, 13, 9, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 13, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 13, 0, 0).slice(0, 3), [241, 17, 233]);
  assert.notDeepEqual(pixel(first, 13, 3, 2), pixel(source, 13, 3, 2));
  for (let y = 0; y < 9; y += 1)
    for (let x = 0; x < 13; x += 1)
      assert.equal(pixel(first, 13, x, y)[3], pixel(source, 13, x, y)[3]);
  assert.notDeepEqual(
    first,
    applyFilterEffectsPixels(source, 13, 9, { ...effect, angle: 90 }),
  );
  assert.deepEqual(
    applyFilterEffectsPixels(source, 13, 9, { ...effect, amount: 0 }),
    source,
  );
  assert.deepEqual(
    applyFilterEffectsPixels(source, 13, 9, { ...effect, radius: 0 }),
    source,
  );
  const normalized = effectiveFilterEffects({ ...effect, amount: 140, radius: 99, angle: 220 });
  assert.deepEqual(
    { type: normalized.type, amount: normalized.amount, radius: normalized.radius, angle: normalized.angle },
    { type: 'wave', amount: 100, radius: 64, angle: 180 },
  );
  assert.equal(validFilterEffects(normalized), true);
});

test('invalid buffer dimensions fail closed', () => {
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(3), 1, 1, { type: 'mosaic', amount: 1, radius: 2 }), /length/);
});

test('Average Blur blends visible pixels toward one alpha-weighted global colour', () => {
  const source = rgba(3, 1, (x) => x === 0 ? [200, 10, 20, 255] : x === 1 ? [20, 100, 40, 255] : [0, 0, 0, 0]);
  const original = source.slice();
  const result = applyFilterEffectsPixels(source, 3, 1, {
    type: 'average-blur', amount: 100, radius: 6,
  });
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(result, 3, 0, 0), [110, 55, 30, 255]);
  assert.deepEqual(pixel(result, 3, 1, 0), [110, 55, 30, 255]);
  assert.deepEqual(pixel(result, 3, 2, 0), [0, 0, 0, 0]);
  assert.equal(validFilterEffects(effectiveFilterEffects({ type: 'average-blur', amount: 85, radius: 6 })), true);
});

test('Blur More is a stronger deterministic box blur with safe metadata', () => {
  const source = rgba(9, 1, (x) => {
    if (x === 0) return [41, 52, 63, 0];
    return [x === 4 ? 255 : 0, 0, 0, 255];
  });
  const original = source.slice();
  const result = applyFilterEffectsPixels(source, 9, 1, {
    type: 'blur-more',
    amount: 100,
    radius: 2,
  });
  assert.deepEqual(source, original);
  assert.equal(pixel(result, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(result, 9, 0, 0).slice(0, 3), [41, 52, 63]);
  assert.ok(pixel(result, 9, 2, 0)[0] > 0);
  assert.ok(pixel(result, 9, 4, 0)[0] < 255);
  assert.equal(validFilterEffects(effectiveFilterEffects({ type: 'blur-more', amount: 85, radius: 6 })), true);
  assert.deepEqual(result, applyFilterEffectsPixels(source, 9, 1, { type: 'blur-more', amount: 100, radius: 2 }));
});

test('lens blur uses a bounded local approximation with explicit source and alpha safety', () => {
  const source = fixture();
  const original = source.slice();
  const effect = effectiveFilterEffects({ type: 'lens-blur', amount: 100, radius: 3 });
  assert.equal(effect.type, 'lens-blur');
  assert.equal(validFilterEffects(effect), true);
  const output = applyFilterEffectsPixels(source, 9, 5, effect);
  assert.deepEqual(source, original);
  assert.notDeepEqual(output, source);
  assert.equal(pixel(output, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 9, 0, 0).slice(0, 3), [0, 0, 0]);
});
