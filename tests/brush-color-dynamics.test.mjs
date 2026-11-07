import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_COLOR_DYNAMICS_KEYS,
  DEFAULT_BRUSH_DYNAMICS,
  brushDabColor,
  brushDabColorJitter,
  brushDabsAt,
  hasBrushColorDynamics,
  hsbToRgb,
  normalizeBrushDynamics,
  rgbToHsb,
  validBrushDynamics,
} from '../src/brushDynamics.ts';
import { applyRadialStamp } from '../src/brush.ts';

const dynamics = (values) => normalizeBrushDynamics({ ...DEFAULT_BRUSH_DYNAMICS, ...values });
const points = Array.from({ length: 40 }, (_, index) => ({ x: 13.5 + index * 7.25, y: 91 - index * 3.5 }));

test('HSB maths round-trips primaries, greys and arbitrary colours', () => {
  assert.deepEqual(rgbToHsb(255, 0, 0), { hue: 0, saturation: 1, brightness: 1 });
  assert.deepEqual(rgbToHsb(0, 255, 0), { hue: 120, saturation: 1, brightness: 1 });
  assert.deepEqual(rgbToHsb(0, 0, 255), { hue: 240, saturation: 1, brightness: 1 });
  assert.deepEqual(rgbToHsb(0, 0, 0), { hue: 0, saturation: 0, brightness: 0 });
  const grey = rgbToHsb(128, 128, 128);
  assert.equal(grey.saturation, 0);
  assert.equal(grey.hue, 0);
  assert.ok(Math.abs(grey.brightness - 128 / 255) < 1e-12);
  assert.ok(Math.abs(rgbToHsb(255, 0, 128).hue - 329.88) < 0.01);
  assert.deepEqual(hsbToRgb(60, 1, 1), [255, 255, 0]);
  assert.deepEqual(hsbToRgb(180, 1, 0.5), [0, 128, 128]);
  assert.deepEqual(hsbToRgb(300, 0, 1), [255, 255, 255]);
  // Hue wraps and saturation/brightness clamp.
  assert.deepEqual(hsbToRgb(-120, 1, 1), hsbToRgb(240, 1, 1));
  assert.deepEqual(hsbToRgb(720, 2, 3), [255, 0, 0]);
  assert.deepEqual(hsbToRgb(Number.NaN, -1, -1), [0, 0, 0]);
  for (let red = 0; red <= 255; red += 15)
    for (let green = 0; green <= 255; green += 17)
      for (let blue = 0; blue <= 255; blue += 51) {
        const hsb = rgbToHsb(red, green, blue);
        assert.ok(hsb.hue >= 0 && hsb.hue < 360);
        assert.deepEqual(hsbToRgb(hsb.hue, hsb.saturation, hsb.brightness), [red, green, blue]);
      }
});

test('colour dynamics validate and normalize; legacy settings default to 0', () => {
  for (const key of BRUSH_COLOR_DYNAMICS_KEYS) {
    assert.equal(DEFAULT_BRUSH_DYNAMICS[key], 0);
    assert.equal(validBrushDynamics({ [key]: 0 }), true);
    assert.equal(validBrushDynamics({ [key]: 100 }), true);
    assert.equal(validBrushDynamics({ [key]: 101 }), false);
    assert.equal(validBrushDynamics({ [key]: -1 }), false);
    assert.equal(validBrushDynamics({ [key]: '40' }), false);
    assert.equal(validBrushDynamics({ [key]: Number.NaN }), false);
  }
  const legacy = { scatterBothAxes: false, count: 3, countJitter: 10, sizeJitter: 20, angleJitter: 30, opacityJitter: 40 };
  assert.equal(validBrushDynamics(legacy), true);
  assert.deepEqual(normalizeBrushDynamics(legacy), {
    ...legacy,
    hueJitter: 0,
    saturationJitter: 0,
    brightnessJitter: 0,
    colorMixJitter: 0,
  });
  assert.deepEqual(
    normalizeBrushDynamics({ hueJitter: 150, saturationJitter: -4, brightnessJitter: 33.6, colorMixJitter: 'x' }),
    { ...DEFAULT_BRUSH_DYNAMICS, hueJitter: 100, saturationJitter: 0, brightnessJitter: 34, colorMixJitter: 0 },
  );
  assert.equal(hasBrushColorDynamics(undefined), false);
  assert.equal(hasBrushColorDynamics(legacy), false);
  assert.equal(hasBrushColorDynamics(dynamics({ brightnessJitter: 1 })), true);
});

test('colour jitter is deterministic per point and dab, bounded, and independent of geometry', () => {
  const settings = dynamics({ count: 4, hueJitter: 50, saturationJitter: 40, brightnessJitter: 30, colorMixJitter: 60 });
  const geometryOnly = dynamics({ count: 4 });
  const hues = new Set();
  for (const point of points) {
    const dabs = brushDabsAt(point, 10, 500, settings);
    assert.deepEqual(dabs, brushDabsAt({ ...point }, 10, 500, settings));
    const plain = brushDabsAt(point, 10, 500, geometryOnly);
    assert.equal(dabs.length, plain.length);
    for (const [index, dab] of dabs.entries()) {
      // Colour dynamics never move, resize, rotate or fade a dab.
      assert.equal(dab.x, plain[index].x);
      assert.equal(dab.y, plain[index].y);
      assert.equal(dab.sizeScale, plain[index].sizeScale);
      assert.ok(Math.abs(dab.hueShift) <= 90);
      assert.ok(Math.abs(dab.saturationShift) <= 0.4);
      assert.ok(Math.abs(dab.brightnessShift) <= 0.3);
      assert.ok(dab.backgroundMix >= 0 && dab.backgroundMix <= 0.6);
      hues.add(Math.round(dab.hueShift));
    }
  }
  // Varied, not a constant offset.
  assert.ok(hues.size > 30, `expected varied hue shifts, got ${hues.size}`);
  // Full hue jitter spans both directions.
  const full = points.map((point) => brushDabColorJitter(point, 0, { hueJitter: 100 }).hueShift);
  assert.ok(Math.min(...full) < -60 && Math.max(...full) > 60);
  // Only the enabled channels are present.
  assert.deepEqual(Object.keys(brushDabColorJitter(points[0], 0, { hueJitter: 10 })), ['hueShift']);
  assert.deepEqual(brushDabColorJitter(points[0], 0, { hueJitter: 0, colorMixJitter: Number.NaN }), {});
});

test('brushDabColor applies mix then HSB offsets and keeps alpha', () => {
  const red = [255, 0, 0, 200], blue = [0, 0, 255, 255];
  assert.equal(brushDabColor(red, blue, {}), red, 'no offsets returns the same colour');
  assert.equal(brushDabColor(red, undefined, { backgroundMix: 0.5 }), red, 'no background means no mix');
  assert.deepEqual(brushDabColor(red, blue, { backgroundMix: 0.5 }), [128, 0, 128, 200]);
  assert.deepEqual(brushDabColor(red, blue, { backgroundMix: 1 }), [0, 0, 255, 200]);
  assert.deepEqual(brushDabColor(red, blue, { hueShift: 120 }), [0, 255, 0, 200]);
  assert.deepEqual(brushDabColor(red, blue, { hueShift: -120 }), [0, 0, 255, 200]);
  assert.deepEqual(brushDabColor(red, blue, { saturationShift: -1 }), [255, 255, 255, 200]);
  assert.deepEqual(brushDabColor(red, blue, { brightnessShift: -0.5 }), [128, 0, 0, 200]);
  assert.deepEqual(brushDabColor(red, blue, { brightnessShift: 0.5 }), [255, 0, 0, 200], 'brightness clamps at 1');
  // White stars keep hue-neutral white under hue jitter but dim with brightness jitter.
  const white = [255, 255, 255, 255];
  assert.deepEqual(brushDabColor(white, blue, { hueShift: 90 }), white);
  assert.deepEqual(brushDabColor(white, blue, { brightnessShift: -0.2 }), [204, 204, 204, 255]);
  assert.deepEqual(brushDabColor(red, blue, { hueShift: Number.NaN, backgroundMix: Number.POSITIVE_INFINITY }), red);
});

test('legacy dynamics render byte-identically through the stamp pipeline', () => {
  const width = 96, height = 64, color = [40, 120, 220, 255];
  const render = (settings, withColorDynamics) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (const point of points.slice(0, 12)) {
      for (const dab of brushDabsAt({ x: point.x % width, y: point.y % height }, 9, 300, settings)) {
        applyRadialStamp(pixels, {
          width,
          height,
          x: dab.x,
          y: dab.y,
          size: 9 * dab.sizeScale,
          hardness: 60,
          opacity: 0.8 * dab.opacityScale,
          mode: 'source-over',
          color: withColorDynamics ? brushDabColor(color, [250, 250, 250, 255], dab) : color,
        });
      }
    }
    return pixels;
  };
  const legacy = { scatterBothAxes: true, count: 3, countJitter: 30, sizeJitter: 40, angleJitter: 0, opacityJitter: 50 };
  const before = render(normalizeBrushDynamics(legacy), false);
  assert.deepEqual(render(normalizeBrushDynamics(legacy), true), before);
  assert.deepEqual(render(dynamics({ ...legacy }), true), before);
  // Every legacy dab omits the colour keys entirely.
  for (const dab of brushDabsAt(points[3], 9, 300, normalizeBrushDynamics(legacy)))
    for (const key of ['hueShift', 'saturationShift', 'brightnessShift', 'backgroundMix'])
      assert.equal(key in dab, false);
  // Enabling hue jitter changes the painted colours.
  const jittered = render(dynamics({ ...legacy, hueJitter: 80 }), true);
  assert.notDeepEqual(jittered, before);
});
