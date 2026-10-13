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

test('linear shear follows the signed inverse map and retains the centre row', () => {
  const source = rgba(9, 5, (x, y) => [x * 20, y * 30, 70, 255]);
  const original = source.slice();
  for (const angle of [90, -90]) {
    const effect = { type: 'shear', amount: 100, radius: 2, angle };
    const output = applyFilterEffectsPixels(source, 9, 5, effect);
    assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 5, effect));
    assert.deepEqual(pixel(output, 9, 4, 2), pixel(source, 9, 4, 2));
    assert.deepEqual(pixel(output, 9, 4, 0), pixel(source, 9, angle > 0 ? 6 : 2, 0));
    assert.deepEqual(pixel(output, 9, 4, 4), pixel(source, 9, angle > 0 ? 2 : 6, 4));
  }
  assert.deepEqual(source, original);
});

test('De-Interlace supports both field parity choices and interpolation', () => {
  const source = rgba(2, 5, (x, y) => [y * 40 + x, y * 20, 90, 255]);
  const first = applyFilterEffectsPixels(source, 2, 5, {
    type: 'deinterlace', amount: 100, radius: 1,
    deinterlace: { keep: 'first', method: 'interpolate' },
  });
  // Rows 0, 2 and 4 are retained; row 1 is reconstructed halfway between 0 and 2.
  assert.deepEqual(pixel(first, 2, 1, 0), pixel(source, 2, 1, 0));
  assert.deepEqual(pixel(first, 2, 1, 1), [41, 20, 90, 255]);
  assert.deepEqual(pixel(first, 2, 1, 2), pixel(source, 2, 1, 2));

  const second = applyFilterEffectsPixels(source, 2, 5, {
    type: 'deinterlace', amount: 100, radius: 1,
    deinterlace: { keep: 'second', method: 'interpolate' },
  });
  // Row 0 is reconstructed from the sole adjacent retained row and rows 1, 3 stay source-owned.
  assert.deepEqual(pixel(second, 2, 1, 0), pixel(source, 2, 1, 1));
  assert.deepEqual(pixel(second, 2, 1, 1), pixel(source, 2, 1, 1));
  assert.deepEqual(pixel(second, 2, 1, 3), pixel(source, 2, 1, 3));
});

test('De-Interlace duplication, amount blending, transparency and metadata validation are deterministic', () => {
  const source = rgba(1, 4, (_, y) => y === 0 ? [220, 10, 30, 255] : y === 1 ? [30, 220, 40, 255] : y === 2 ? [10, 20, 230, 255] : [40, 50, 60, 0]);
  const original = source.slice();
  const duplicate = applyFilterEffectsPixels(source, 1, 4, {
    type: 'deinterlace', amount: 100, radius: 1,
    deinterlace: { keep: 'first', method: 'duplicate' },
  });
  assert.deepEqual(pixel(duplicate, 1, 0, 1), pixel(source, 1, 0, 0));
  assert.deepEqual(pixel(duplicate, 1, 0, 3), pixel(source, 1, 0, 3));
  assert.deepEqual(source, original);
  const half = applyFilterEffectsPixels(source, 1, 4, {
    type: 'deinterlace', amount: 50, radius: 1,
    deinterlace: { keep: 'first', method: 'duplicate' },
  });
  assert.deepEqual(pixel(half, 1, 0, 1), [125, 115, 35, 255]);
  assert.deepEqual(pixel(half, 1, 0, 3), [40, 50, 60, 0]);
  assert.equal(validFilterEffects(effectiveFilterEffects({
    type: 'deinterlace', amount: 100, radius: 1,
    deinterlace: { keep: 'second', method: 'duplicate' },
  })), true);
  assert.equal(validFilterEffects({
    type: 'deinterlace', amount: 100, radius: 1,
    deinterlace: { keep: 'invalid', method: 'interpolate' },
  }), false);
});

test('Find Edges extracts deterministic Sobel luminance edges without mutating alpha or source pixels', () => {
  const source = rgba(5, 3, (x, y) => {
    if (x === 0 && y === 0) return [9, 8, 7, 0];
    return [x < 2 ? 20 : 220, y * 20, 80, 255];
  });
  const original = source.slice();
  const output = applyFilterEffectsPixels(source, 5, 3, {
    type: 'find-edges', amount: 100, radius: 0,
  });
  assert.deepEqual(source, original);
  assert.equal(output[3], 0);
  assert.equal(output[(1 * 5 + 1) * 4 + 3], 255);
  assert.ok(output[(1 * 5 + 2) * 4] > output[(1 * 5 + 0) * 4]);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 5, 3, {
    type: 'find-edges', amount: 100, radius: 0,
  }));
  assert.equal(validFilterEffects(effectiveFilterEffects({
    type: 'find-edges', amount: 100, radius: 99,
  })), true);
});

test('Unsharp Mask is deterministic, source-safe and preserves alpha/transparent RGB', () => {
  const source = rgba(7, 3, (x, y) => {
    if (x === 0 && y === 0) return [17, 23, 29, 0];
    return [x < 3 ? 32 : 210, y * 40 + 20, 90, x === 6 ? 128 : 255];
  });
  const original = source.slice();
  const output = applyFilterEffectsPixels(source, 7, 3, {
    type: 'unsharp-mask', amount: 100, radius: 3,
  });
  assert.deepEqual(source, original);
  assert.notDeepEqual(output, source);
  assert.equal(output[3], 0);
  assert.deepEqual(Array.from(output.slice(0, 3)), [17, 23, 29]);
  for (let offset = 3; offset < source.length; offset += 4)
    assert.equal(output[offset + 3], source[offset + 3]);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 7, 3, {
    type: 'unsharp-mask', amount: 100, radius: 3,
  }));
  assert.equal(validFilterEffects(effectiveFilterEffects({
    type: 'unsharp-mask', amount: 120, radius: 99,
  })), true);
});

test('linear shear interpolates fractional shifts and clamps image edges', () => {
  const source = rgba(9, 5, (x) => [x * 20, 0, 0, 255]);
  const output = applyFilterEffectsPixels(source, 9, 5, {
    type: 'shear', amount: 25, radius: 2, angle: 90,
  });
  assert.equal(pixel(output, 9, 4, 0)[0], 90);
  assert.equal(pixel(output, 9, 4, 4)[0], 70);
  assert.equal(pixel(output, 9, 8, 0)[0], 160);
});

test('linear shear preserves partial alpha and hidden RGB and excludes transparent samples', () => {
  const source = rgba(3, 3, (x) => x === 1 ? [255, 0, 255, 0] : [50, 100, 150, 128]);
  const output = applyFilterEffectsPixels(source, 3, 3, {
    type: 'shear', amount: 25, radius: 1, angle: 90,
  });
  for (let offset = 0; offset < source.length; offset += 4) {
    assert.equal(output[offset + 3], source[offset + 3]);
  }
  assert.deepEqual(Array.from(output.slice((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 3)), [255, 0, 255]);
});

test('linear shear identity controls and tiny images return detached safe buffers', () => {
  const source = fixture();
  for (const controls of [{ amount: 0 }, { radius: 0 }, { angle: 0 }]) {
    const output = applyFilterEffectsPixels(source, 9, 5, {
      type: 'shear', amount: 100, radius: 64, angle: 90, ...controls,
    });
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
  const tiny = rgba(1, 1, () => [24, 60, 90, 128]);
  assert.deepEqual(applyFilterEffectsPixels(tiny, 1, 1, {
    type: 'shear', amount: 100, radius: 64, angle: 90,
  }), tiny);
});

test('polar coordinates performs a deterministic bounded rectangular-to-polar remap', () => {
  const source = rgba(9, 5, (x, y) => [x * 20, y * 30, 70, 255]);
  const original = source.slice();
  const effect = { type: 'polar-coordinates', amount: 100, radius: 64 };
  const output = applyFilterEffectsPixels(source, 9, 5, effect);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 5, effect));
  assert.deepEqual(pixel(output, 9, 8, 2), pixel(source, 9, 4, 4));
  assert.deepEqual(pixel(output, 9, 0, 2), pixel(source, 9, 8, 4));
  assert.deepEqual(pixel(output, 9, 4, 2), pixel(source, 9, 4, 0));
  assert.deepEqual(source, original);
  assert.notEqual(output, source);
});

test('polar coordinates blends strength, clamps radial extent and preserves transparent pixels', () => {
  const source = rgba(7, 7, (x, y) => x === 0 && y === 0 ? [255, 0, 255, 0] : [x * 30, y * 30, 12, 255]);
  const identity = applyFilterEffectsPixels(source, 7, 7, {
    type: 'polar-coordinates', amount: 0, radius: 64,
  });
  assert.deepEqual(identity, source);
  const output = applyFilterEffectsPixels(source, 7, 7, {
    type: 'polar-coordinates', amount: 100, radius: 1,
  });
  assert.equal(pixel(output, 7, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 7, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'polar-coordinates', amount: 100, radius: 0 }), true);
});

test('zigzag performs a deterministic radial displacement with bounded falloff', () => {
  const source = rgba(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const original = source.slice();
  const effect = { type: 'zigzag', amount: 70, radius: 6, centerX: 0.5, centerY: 0.5 };
  const output = applyFilterEffectsPixels(source, 9, 9, effect);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 9, effect));
  assert.deepEqual(pixel(output, 9, 4, 4), pixel(source, 9, 4, 4));
  assert.notDeepEqual(pixel(output, 9, 6, 4), pixel(source, 9, 6, 4));
  assert.deepEqual(source, original);
});

test('zigzag identities and transparent source edges remain safe', () => {
  const source = rgba(5, 5, (x, y) => x === 0 && y === 0 ? [255, 0, 255, 0] : [x * 30, y * 30, 12, 255]);
  assert.deepEqual(applyFilterEffectsPixels(source, 5, 5, {
    type: 'zigzag', amount: 0, radius: 6,
  }), source);
  const output = applyFilterEffectsPixels(source, 5, 5, {
    type: 'zigzag', amount: 100, radius: 6,
  });
  assert.equal(pixel(output, 5, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 5, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'zigzag', amount: 100, radius: 0 }), true);
});

test('displace uses a deterministic rotated field and preserves source buffers', () => {
  const source = rgba(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const original = source.slice();
  const horizontal = applyFilterEffectsPixels(source, 9, 9, {
    type: 'displace', amount: 80, radius: 5, angle: 0,
  });
  const rotated = applyFilterEffectsPixels(source, 9, 9, {
    type: 'displace', amount: 80, radius: 5, angle: 90,
  });
  assert.deepEqual(horizontal, applyFilterEffectsPixels(source, 9, 9, {
    type: 'displace', amount: 80, radius: 5, angle: 0,
  }));
  assert.notDeepEqual(horizontal, rotated);
  assert.deepEqual(source, original);
  assert.notEqual(horizontal, source);
});

test('displace identity and transparent source edges remain safe', () => {
  const source = rgba(5, 5, (x, y) => x === 0 && y === 0 ? [255, 0, 255, 0] : [x * 30, y * 30, 12, 255]);
  assert.deepEqual(applyFilterEffectsPixels(source, 5, 5, {
    type: 'displace', amount: 0, radius: 6,
  }), source);
  const output = applyFilterEffectsPixels(source, 5, 5, {
    type: 'displace', amount: 100, radius: 6,
  });
  assert.equal(pixel(output, 5, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 5, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'displace', amount: 100, radius: 0 }), true);
});

test('pointillize creates deterministic stipple cells without mutating source', () => {
  const source = rgba(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const original = source.slice();
  const effect = { type: 'pointillize', amount: 85, radius: 4 };
  const output = applyFilterEffectsPixels(source, 9, 9, effect);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 9, effect));
  assert.notDeepEqual(pixel(output, 9, 1, 1), pixel(source, 9, 1, 1));
  assert.notDeepEqual(pixel(output, 9, 4, 4), pixel(source, 9, 4, 4));
  assert.deepEqual(source, original);
  assert.notEqual(output, source);
});

test('pointillize identities and transparent cells preserve hidden RGB', () => {
  const source = rgba(5, 5, (x, y) => x === 0 && y === 0 ? [255, 0, 255, 0] : [x * 30, y * 30, 12, 255]);
  assert.deepEqual(applyFilterEffectsPixels(source, 5, 5, {
    type: 'pointillize', amount: 0, radius: 6,
  }), source);
  const output = applyFilterEffectsPixels(source, 5, 5, {
    type: 'pointillize', amount: 100, radius: 6,
  });
  assert.equal(pixel(output, 5, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 5, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'pointillize', amount: 100, radius: 0 }), true);
});

test('facet creates deterministic triangular cells without mutating source', () => {
  const source = rgba(12, 8, (x, y) => [x * 17, y * 28, (x * 11 + y * 7) % 255, 255]);
  const original = source.slice();
  const effect = { type: 'facet', amount: 100, radius: 5, seed: 7 };
  const first = applyFilterEffectsPixels(source, 12, 8, effect);
  const second = applyFilterEffectsPixels(source, 12, 8, effect);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.deepEqual(source, original);
  assert.notEqual(first, source);
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
});

test('facet preserves transparent RGB and alpha boundaries', () => {
  const source = rgba(7, 7, (x, y) =>
    x === 0 && y === 0 ? [255, 0, 255, 0] : x === 1 && y === 1 ? [40, 80, 120, 128] : [x * 30, y * 30, 12, 255],
  );
  const output = applyFilterEffectsPixels(source, 7, 7, {
    type: 'facet', amount: 100, radius: 4, seed: 13,
  });
  assert.equal(pixel(output, 7, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 7, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(pixel(output, 7, 1, 1)[3], 128);
  assert.deepEqual(applyFilterEffectsPixels(source, 7, 7, {
    type: 'facet', amount: 0, radius: 4, seed: 13,
  }), source);
  assert.equal(isNeutralFilterEffects({ type: 'facet', amount: 100, radius: 0 }), true);
});

test('facet seed changes only the deterministic triangular layout', () => {
  const source = rgba(16, 10, (x, y) => [x * 13, y * 21, (x * 23 + y * 5) % 255, 255]);
  const first = applyFilterEffectsPixels(source, 16, 10, { type: 'facet', amount: 100, radius: 6, seed: 1 });
  const second = applyFilterEffectsPixels(source, 16, 10, { type: 'facet', amount: 100, radius: 6, seed: 2 });
  assert.notDeepEqual(first, second);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 16, 10, { type: 'facet', amount: 100, radius: 6, seed: 1 }));
});

test('lens correction is deterministic, centre-preserving and source-safe', () => {
  const source = rgba(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const original = source.slice();
  const effect = { type: 'lens-correction', amount: 75, radius: 64, centerX: 0.5, centerY: 0.5 };
  const output = applyFilterEffectsPixels(source, 9, 9, effect);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 9, 9, effect));
  assert.deepEqual(pixel(output, 9, 4, 4), pixel(source, 9, 4, 4));
  assert.notDeepEqual(pixel(output, 9, 8, 4), pixel(source, 9, 8, 4));
  assert.deepEqual(source, original);
  assert.notEqual(output, source);
});

test('lens correction identities and transparent source edges remain safe', () => {
  const source = rgba(5, 5, (x, y) => x === 0 && y === 0 ? [255, 0, 255, 0] : [x * 30, y * 30, 12, 255]);
  assert.deepEqual(applyFilterEffectsPixels(source, 5, 5, {
    type: 'lens-correction', amount: 0, radius: 64,
  }), source);
  const output = applyFilterEffectsPixels(source, 5, 5, {
    type: 'lens-correction', amount: 100, radius: 64,
  });
  assert.equal(pixel(output, 5, 0, 0)[3], 0);
  assert.deepEqual(pixel(output, 5, 0, 0).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'lens-correction', amount: 100, radius: 0 }), true);
});

test('lens correction supports inward and outward directions with a legacy inward default', () => {
  const source = rgba(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const settings = { type: 'lens-correction', amount: 75, radius: 64, centerX: 0.5, centerY: 0.5 };
  const inward = applyFilterEffectsPixels(source, 9, 9, { ...settings, lensDirection: 'inward' });
  const outward = applyFilterEffectsPixels(source, 9, 9, { ...settings, lensDirection: 'outward' });
  assert.notDeepEqual(inward, outward);
  assert.deepEqual(inward, applyFilterEffectsPixels(source, 9, 9, settings));
  assert.equal(effectiveFilterEffects(settings).lensDirection, 'inward');
  assert.equal(effectiveFilterEffects({ ...settings, lensDirection: 'outward' }).lensDirection, 'outward');
  assert.equal(validFilterEffects(effectiveFilterEffects({ ...settings, lensDirection: 'outward' })), true);
  assert.equal(validFilterEffects({ ...effectiveFilterEffects(settings), lensDirection: 'sideways' }), false);
});

test('Filter effect metadata is bounded and legacy/empty values normalize safely', () => {
  const value = effectiveFilterEffects({ type: 'mosaic', amount: 200, radius: -4, centerX: 4, seed: -1 });
  assert.equal(value.type, 'mosaic');
  assert.deepEqual({ amount: value.amount, radius: value.radius, centerX: value.centerX, seed: value.seed }, { amount: 100, radius: 0, centerX: 1, seed: 0xffffffff });
  assert.equal(effectiveFilterEffects(undefined).type, 'none');
  assert.equal(isNeutralFilterEffects(neutralFilterEffects), true);
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, radius: 1.5 }), false);
});

test('field blur pin metadata is bounded, detached and fail-closed', () => {
  const value = effectiveFilterEffects({
    type: 'field-blur', amount: 80, radius: 18,
    fieldPoints: [
      { x: -1, y: 2, radius: 99 },
      { x: 0.2, y: 0.8, radius: 12 },
      { x: 0.3, y: 0.7, radius: 13 },
      { x: 0.4, y: 0.6, radius: 14 },
      { x: 0.5, y: 0.5, radius: 15 },
      { x: 0.6, y: 0.4, radius: 16 },
      { x: 0.7, y: 0.3, radius: 17 },
      { x: 0.8, y: 0.2, radius: 18 },
      { x: 1, y: 0, radius: 19 },
    ],
  });
  assert.equal(value.fieldPoints?.length, 8);
  assert.deepEqual(value.fieldPoints?.[0], { x: 0, y: 1, radius: 64 });
  assert.equal(validFilterEffects(value), true);
  assert.equal(validFilterEffects({ ...value, fieldPoints: [] }), false);
  assert.equal(validFilterEffects({ ...value, fieldPoints: [{ x: 0.5, y: 0.5, radius: 1.5 }] }), false);
});

test('field blur interpolates authored pins, stays deterministic and is alpha-safe', () => {
  const source = fixture();
  const original = source.slice();
  const effect = {
    type: 'field-blur', amount: 100, radius: 18,
    fieldPoints: [{ x: 0, y: 0, radius: 0 }, { x: 1, y: 1, radius: 24 }],
  };
  const first = applyFilterEffectsPixels(source, 9, 5, effect);
  const second = applyFilterEffectsPixels(source, 9, 5, effect);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 9, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 9, 0, 0).slice(0, 3), pixel(source, 9, 0, 0).slice(0, 3));
  const zeroPins = applyFilterEffectsPixels(source, 9, 5, {
    ...effect,
    fieldPoints: effect.fieldPoints.map((point) => ({ ...point, radius: 0 })),
  });
  assert.deepEqual(zeroPins, source);
  assert.notDeepEqual(first, zeroPins);
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
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

test('spin blur is a distinct bounded radial gallery effect with editable centre', () => {
  const source = rgba(15, 15, (x, y) => {
    if (x === 0 && y === 0) return [31, 42, 53, 0];
    return [(x * 19 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 255];
  });
  const original = source.slice();
  const effect = { type: 'spin-blur', amount: 100, radius: 48, centerX: 0.5, centerY: 0.5 };
  const first = applyFilterEffectsPixels(source, 15, 15, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 15, 15, effect));
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 15, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 15, 0, 0).slice(0, 3), [31, 42, 53]);
  assert.notDeepEqual(pixel(first, 15, 2, 2), pixel(source, 15, 2, 2));
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, 15, 15, { ...effect, centerX: 0.1 }));
  assert.equal(validFilterEffects(effectiveFilterEffects({ ...effect, radius: 500 })), true);
  assert.equal(effectiveFilterEffects({ ...effect, radius: 500 }).radius, 64);
});

test('path blur follows a bounded deterministic curved path and preserves alpha/hidden RGB', () => {
  const source = rgba(13, 9, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [(x * 31 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, (x + y) % 3 ? 255 : 127];
  });
  const original = source.slice();
  const effect = { type: 'path-blur', amount: 100, radius: 7, angle: 35, centerX: 0.5, centerY: 0.5 };
  const first = applyFilterEffectsPixels(source, 13, 9, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 13, 9, effect));
  assert.deepEqual(source, original);
  assert.equal(pixel(first, 13, 0, 0)[3], 0);
  assert.deepEqual(pixel(first, 13, 0, 0).slice(0, 3), [241, 17, 233]);
  assert.notDeepEqual(pixel(first, 13, 3, 2), pixel(source, 13, 3, 2));
  for (let y = 0; y < 9; y += 1)
    for (let x = 0; x < 13; x += 1)
      assert.equal(pixel(first, 13, x, y)[3], pixel(source, 13, x, y)[3]);
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, 13, 9, { ...effect, angle: -35 }));
  assert.deepEqual(applyFilterEffectsPixels(source, 13, 9, { ...effect, amount: 0 }), source);
  assert.deepEqual(applyFilterEffectsPixels(source, 13, 9, { ...effect, radius: 0 }), source);
  const normalized = effectiveFilterEffects({ ...effect, angle: 220, radius: 99 });
  assert.deepEqual({ type: normalized.type, angle: normalized.angle, radius: normalized.radius }, { type: 'path-blur', angle: 180, radius: 64 });
  assert.equal(validFilterEffects(normalized), true);
});

test('Spin and Path Blur identity, tiny, alpha and invalid metadata boundaries are safe', () => {
  const source = rgba(7, 7, (x, y) => x === 0 || y === 0
    ? [255, 0, 255, 0]
    : [120, 60, 30, (x + y) % 2 ? 127 : 255]);
  for (const type of ['spin-blur', 'path-blur']) {
    for (const controls of [{ amount: 0 }, { radius: 0 }]) {
      const effect = { type, amount: 100, radius: 64, angle: 180, ...controls };
      assert.equal(isNeutralFilterEffects(effect), true);
      const output = applyFilterEffectsPixels(source, 7, 7, effect);
      assert.deepEqual(output, source);
      assert.notEqual(output, source);
    }
    const output = applyFilterEffectsPixels(source, 7, 7, {
      type, amount: 100, radius: 64, angle: 180, centerX: 0, centerY: 1,
    });
    assert.deepEqual(output, source, `${type} must retain constant visible colour and exclude hidden magenta`);
    const tiny = new Uint8ClampedArray([12, 34, 56, 127]);
    assert.deepEqual(applyFilterEffectsPixels(tiny, 1, 1, {
      type, amount: 100, radius: 64, angle: 180,
    }), tiny);
    const normalized = effectiveFilterEffects({
      type, amount: 140, radius: 99, angle: 999, centerX: -2, centerY: 9,
    });
    assert.deepEqual(
      { type: normalized.type, amount: normalized.amount, radius: normalized.radius, angle: normalized.angle, centerX: normalized.centerX, centerY: normalized.centerY },
      { type, amount: 100, radius: 64, angle: 180, centerX: 0, centerY: 1 },
    );
    assert.equal(validFilterEffects(normalized), true);
    for (const invalid of [{ radius: 1.5 }, { angle: 181 }, { centerX: -0.01 }, { amount: Infinity }])
      assert.equal(validFilterEffects({ ...normalized, ...invalid }), false);
  }
});

test('Path Blur integrates an authored polyline with endpoint speeds and taper', () => {
  const source = rgba(17, 11, (x, y) => [x * 13, y * 19, (x + y) * 7, 255]);
  const path = [
    { x: 0.1, y: 0.5, speed: 100 },
    { x: 0.5, y: 0.25, speed: 40 },
    { x: 0.9, y: 0.5, speed: 10 },
  ];
  const effect = {
    type: 'path-blur', amount: 100, radius: 7, centerX: 0.5, centerY: 0.5,
    path, pathCentered: true, pathTaper: 0.4,
  };
  const first = applyFilterEffectsPixels(source, 17, 11, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 17, 11, effect));
  assert.notDeepEqual(first, source);
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, 17, 11, { ...effect, path: [...path].reverse() }));
  const normalized = effectiveFilterEffects({ ...effect, path: [...path, ...path, ...path, ...path] });
  assert.equal(normalized.path?.length, 8);
  assert.deepEqual(normalized.path?.[0], path[0]);
  assert.equal(normalized.pathCentered, true);
  assert.equal(normalized.pathTaper, 0.4);
  assert.equal(validFilterEffects(normalized), true);
});

test('Spin Blur applies a rotated soft ellipse and leaves outside pixels untouched', () => {
  const source = rgba(15, 15, (x, y) => [x * 17, y * 13, (x + y) * 5, 255]);
  const ellipse = { radiusX: 0.45, radiusY: 0.2, rotation: 35, feather: 0.25 };
  const effect = {
    type: 'spin-blur', amount: 100, radius: 50, centerX: 0.5, centerY: 0.5,
    spinEllipse: ellipse,
  };
  const output = applyFilterEffectsPixels(source, 15, 15, effect);
  assert.notDeepEqual(output, source);
  assert.deepEqual(pixel(output, 15, 0, 7), pixel(source, 15, 0, 7));
  assert.notDeepEqual(output, applyFilterEffectsPixels(source, 15, 15, { ...effect, spinEllipse: { ...ellipse, rotation: -35 } }));
  const normalized = effectiveFilterEffects({ ...effect, spinEllipse: { radiusX: 5, radiusY: 0, rotation: 220, feather: 2 } });
  assert.deepEqual(normalized.spinEllipse, { radiusX: 2, radiusY: 0.01, rotation: 180, feather: 1 });
  assert.equal(validFilterEffects(normalized), true);
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

test('tilt shift normalizes geometry, rotates the focal band and preserves source alpha', () => {
  const source = rgba(17, 11, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [(x * 23 + y * 7) % 256, (x * 5 + y * 31) % 256, (x * 13 + y * 11) % 256, 96 + ((x + y) % 4) * 40];
  });
  const original = source.slice();
  const horizontal = {
    type: 'tilt-shift', amount: 100, radius: 4, centerX: 0.5, centerY: 0.5, angle: 0,
    tiltShift: { focusWidth: 0.24, feather: 0.2 },
  };
  const rotated = { ...horizontal, angle: 65, centerX: 0.35, centerY: 0.62 };
  const first = applyFilterEffectsPixels(source, 17, 11, horizontal);
  const second = applyFilterEffectsPixels(source, 17, 11, horizontal);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.notDeepEqual(first, applyFilterEffectsPixels(source, 17, 11, rotated));
  assert.deepEqual(pixel(first, 17, 0, 0), pixel(source, 17, 0, 0));
  for (let index = 0; index < source.length; index += 4)
    assert.equal(first[index + 3], source[index + 3]);
});

test('tilt shift bounds and identity controls normalize safely', () => {
  const normalized = effectiveFilterEffects({
    type: 'tilt-shift', amount: 140, radius: 99, angle: 220, centerX: -2, centerY: 8,
    tiltShift: { focusWidth: 2, feather: -1 },
  });
  assert.deepEqual(normalized.tiltShift, { focusWidth: 0.8, feather: 0.05 });
  assert.equal(normalized.amount, 100);
  assert.equal(normalized.radius, 64);
  assert.equal(normalized.angle, 180);
  assert.equal(normalized.centerX, 0);
  assert.equal(normalized.centerY, 1);
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(validFilterEffects({ ...normalized, tiltShift: { focusWidth: 0.01, feather: 0.2 } }), false);
  const source = fixture();
  for (const controls of [{ amount: 0 }, { radius: 0 }]) {
    const output = applyFilterEffectsPixels(source, 9, 5, {
      type: 'tilt-shift', amount: 100, radius: 8, tiltShift: { focusWidth: 0.3, feather: 0.3 }, ...controls,
    });
    assert.deepEqual(output, source);
    assert.notEqual(output, source);
  }
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

test('color halftone uses deterministic CMYK screens with bounded metadata', () => {
  const source = rgba(17, 13, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [
      (x * 31 + y * 7) % 256,
      (x * 11 + y * 23) % 256,
      (x * 5 + y * 17) % 256,
      96 + ((x + y) % 4) * 40,
    ];
  });
  const original = source.slice();
  const effect = {
    type: 'color-halftone', amount: 100, radius: 5,
    colorHalftone: { cyanAngle: 108, magentaAngle: 162, yellowAngle: 90, blackAngle: 45 },
  };
  const first = applyFilterEffectsPixels(source, 17, 13, effect);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 17, 13, effect));
  assert.deepEqual(source, original);
  assert.notDeepEqual(first, source);
  assert.deepEqual(pixel(first, 17, 0, 0), pixel(source, 17, 0, 0));
  for (let y = 0; y < 13; y += 1)
    for (let x = 0; x < 17; x += 1)
      assert.equal(pixel(first, 17, x, y)[3], pixel(source, 17, x, y)[3]);
  const rotated = applyFilterEffectsPixels(source, 17, 13, {
    ...effect,
    colorHalftone: { ...effect.colorHalftone, cyanAngle: 20 },
  });
  assert.notDeepEqual(first, rotated);
  assert.deepEqual(
    applyFilterEffectsPixels(source, 17, 13, { ...effect, amount: 0 }),
    source,
  );
  assert.deepEqual(
    applyFilterEffectsPixels(source, 17, 13, { ...effect, radius: 0 }),
    source,
  );
  const tiny = rgba(1, 1, () => [70, 140, 210, 128]);
  const tinyOutput = applyFilterEffectsPixels(tiny, 1, 1, { ...effect, radius: 64 });
  assert.equal(pixel(tinyOutput, 1, 0, 0)[3], 128);
  assert.notEqual(tinyOutput, tiny);
});

test('color halftone screen angles normalize and validate safely', () => {
  const normalized = effectiveFilterEffects({
    type: 'color-halftone', amount: 120, radius: 99,
    colorHalftone: { cyanAngle: 999, magentaAngle: -999, yellowAngle: -181, blackAngle: 45.7 },
  });
  assert.deepEqual(normalized.colorHalftone, {
    cyanAngle: 180, magentaAngle: -180, yellowAngle: -180, blackAngle: 46,
  });
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(validFilterEffects({
    ...normalized,
    colorHalftone: { ...normalized.colorHalftone, cyanAngle: 181 },
  }), false);
});

test('crystallize uses seeded bounded cells without mutating source or transparent RGB', () => {
  const source = rgba(13, 9, (x, y) => {
    if (x === 0 && y === 0) return [241, 17, 233, 0];
    return [(x * 31 + y * 7) % 256, (x * 11 + y * 23) % 256, (x * 5 + y * 17) % 256, 180 + (x % 4) * 15];
  });
  const original = source.slice();
  const effect = { type: 'crystallize', amount: 100, radius: 4, seed: 42 };
  const first = applyFilterEffectsPixels(source, 13, 9, effect);
  assert.deepEqual(source, original);
  assert.deepEqual(first, applyFilterEffectsPixels(source, 13, 9, effect));
  assert.notDeepEqual(first, source);
  assert.deepEqual(pixel(first, 13, 0, 0), [241, 17, 233, 0]);
  for (let y = 0; y < 9; y += 1)
    for (let x = 0; x < 13; x += 1)
      assert.equal(pixel(first, 13, x, y)[3], pixel(source, 13, x, y)[3]);
  assert.notDeepEqual(
    first,
    applyFilterEffectsPixels(source, 13, 9, { ...effect, seed: 43 }),
  );
  assert.deepEqual(
    applyFilterEffectsPixels(source, 13, 9, { ...effect, amount: 0 }),
    source,
  );
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

test('lens blur keeps alpha, softens a point highlight and remains bounded on tiny canvases', () => {
  const source = rgba(3, 3, (x, y) =>
    x === 1 && y === 1 ? [255, 255, 255, 255] : [0, 0, 0, 255],
  );
  const output = applyFilterEffectsPixels(source, 3, 3, {
    type: 'lens-blur',
    amount: 100,
    radius: 2,
  });
  assert.equal(pixel(output, 3, 1, 1)[3], 255);
  assert.ok(pixel(output, 3, 1, 1)[0] < 255);
  assert.ok(pixel(output, 3, 0, 1)[0] > 0);
});

test('smart blur is deterministic, edge-preserving and alpha-safe', () => {
  const source = rgba(9, 3, (x, y) => {
    if (x === 2 && y === 1) return [24, 24, 24, 255];
    return x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
  const effect = effectiveFilterEffects({ type: 'smart-blur', amount: 100, radius: 5 });
  assert.equal(validFilterEffects(effect), true);
  const first = applyFilterEffectsPixels(source, 9, 3, effect);
  const second = applyFilterEffectsPixels(source, 9, 3, effect);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, source);
  assert.ok(pixel(first, 9, 3, 1)[0] < 64);
  assert.ok(pixel(first, 9, 4, 1)[0] > 191);
  assert.equal(pixel(first, 9, 0, 0)[3], 255);
});

test('surface blur smooths tonal surfaces while retaining a hard luminance edge', () => {
  const source = rgba(9, 3, (x, y) => {
    if (x === 2 && y === 1) return [24, 24, 24, 255];
    return x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
  const effect = effectiveFilterEffects({ type: 'surface-blur', amount: 100, radius: 5 });
  assert.equal(validFilterEffects(effect), true);
  const output = applyFilterEffectsPixels(source, 9, 3, effect);
  assert.notDeepEqual(output, source);
  assert.ok(pixel(output, 9, 3, 1)[0] < 64);
  assert.ok(pixel(output, 9, 4, 1)[0] > 191);
  assert.equal(pixel(output, 9, 0, 0)[3], 255);
});

test('shape blur uses a deterministic diamond aperture and preserves alpha', () => {
  const source = rgba(7, 7, (x, y) =>
    x === 3 && y === 3 ? [255, 255, 255, 255] : [0, 0, 0, 255],
  );
  const effect = effectiveFilterEffects({ type: 'shape-blur', amount: 100, radius: 2 });
  assert.equal(validFilterEffects(effect), true);
  const output = applyFilterEffectsPixels(source, 7, 7, effect);
  assert.notDeepEqual(output, source);
  assert.ok(pixel(output, 7, 3, 3)[0] < 255);
  assert.ok(pixel(output, 7, 2, 3)[0] > 0);
  assert.equal(pixel(output, 7, 0, 0)[3], 255);
});

test('iris blur keeps a central focal ellipse sharp while blurring the outside', () => {
  const source = rgba(9, 5, (x, y) =>
    x === 4 && y === 2 ? [255, 255, 255, 255] : [0, 0, 0, 255],
  );
  const effect = effectiveFilterEffects({
    type: 'iris-blur',
    amount: 100,
    radius: 8,
    centerX: 0.5,
    centerY: 0.5,
  });
  assert.equal(effect.type, 'iris-blur');
  assert.equal(validFilterEffects(effect), true);
  const output = applyFilterEffectsPixels(source, 9, 5, effect);
  assert.notDeepEqual(output, source);
  assert.ok(pixel(output, 9, 4, 2)[0] > pixel(output, 9, 0, 2)[0]);
  assert.equal(pixel(output, 9, 0, 0)[3], 255);
});

test('de-interlace reconstructs alternating lines from adjacent fields', () => {
  const source = rgba(3, 6, (x, y) => [y === 3 ? 240 : y * 20 + x, y * 10, 80, 255]);
  const original = source.slice();
  const effect = { type: 'deinterlace', amount: 100, radius: 1 };
  assert.equal(validFilterEffects(effectiveFilterEffects(effect)), true);
  const output = applyFilterEffectsPixels(source, 3, 6, effect);
  assert.deepEqual(pixel(output, 3, 1, 2), pixel(source, 3, 1, 2));
  assert.deepEqual(pixel(output, 3, 1, 3), [61, 30, 80, 255]);
  assert.deepEqual(pixel(output, 3, 1, 4), pixel(source, 3, 1, 4));
  assert.deepEqual(source, original);
});

test('de-interlace blends strength, preserves alpha and hidden transparent RGB', () => {
  const source = rgba(3, 5, (x, y) => {
    if (x === 0 && y === 2) return [255, 0, 255, 0];
    return [y * 30, 90, 40, y === 2 ? 128 : 255];
  });
  const identity = applyFilterEffectsPixels(source, 3, 5, {
    type: 'deinterlace', amount: 0, radius: 1,
  });
  assert.deepEqual(identity, source);
  const output = applyFilterEffectsPixels(source, 3, 5, {
    type: 'deinterlace', amount: 50, radius: 1,
  });
  assert.equal(pixel(output, 3, 1, 2)[3], 128);
  assert.deepEqual(pixel(output, 3, 0, 2).slice(0, 3), [255, 0, 255]);
  assert.equal(isNeutralFilterEffects({ type: 'deinterlace', amount: 100, radius: 0 }), true);
});
