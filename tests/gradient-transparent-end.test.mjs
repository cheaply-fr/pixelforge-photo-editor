import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGradientColorStops, transparentOf } from '../src/gradientStops.ts';

const base = {
  mode: 'linear',
  color: '#2b3a8f',
  backgroundColor: '#ffcc00',
  end: 'transparent',
  reverse: false,
  midpoint: 'none',
  midpointPosition: 50,
  stops: [],
};

const rgba = (hex) => {
  const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  assert.ok(match, `expected hex colour, got ${hex}`);
  return [1, 2, 3].map((index) => parseInt(match[index], 16)).concat(match[4] ? parseInt(match[4], 16) : 255);
};

const assertTransparentOf = (stop, neighbour) => {
  const [r, g, b, a] = rgba(stop.color);
  const [nr, ng, nb] = rgba(neighbour);
  assert.equal(a, 0, `${stop.color} should have zero alpha`);
  assert.deepEqual([r, g, b], [nr, ng, nb], `${stop.color} should keep the hue of ${neighbour}`);
};

/**
 * Model of a canvas gradient sample: Chrome/Skia interpolate colour stops
 * un-premultiplied, then the result is stored premultiplied and read back
 * un-premultiplied by getImageData.
 */
const sample = (stops, t) => {
  let index = stops.findIndex((stop) => stop.offset >= t);
  if (index <= 0) index = 1;
  const from = stops[index - 1], to = stops[index];
  const span = to.offset - from.offset || 1;
  const u = Math.max(0, Math.min(1, (t - from.offset) / span));
  const [ar, ag, ab, aa] = rgba(from.color), [br, bg, bb, ba] = rgba(to.color);
  return [ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u, aa + (ba - aa) * u];
};

test('transparentOf keeps RGB and zeroes alpha', () => {
  assert.equal(transparentOf('#2B3A8F'), '#2b3a8f00');
  assert.equal(transparentOf('#abc'), '#aabbcc00');
  assert.equal(transparentOf('#11223344'), '#11223300');
  assert.equal(transparentOf('not a colour'), '#ffffff00');
});

test('linear transparent end fades the drawing colour, not white', () => {
  const stops = buildGradientColorStops(base);
  assert.deepEqual(stops.map((stop) => stop.offset), [0, 1]);
  assert.equal(stops[0].color, '#2b3a8f');
  assertTransparentOf(stops[1], '#2b3a8f');
  assert.deepEqual(buildGradientColorStops({ ...base, mode: 'radial' }), stops);
});

test('reversed transparent start takes the hue of its neighbouring stop', () => {
  const stops = buildGradientColorStops({ ...base, reverse: true });
  assertTransparentOf(stops[0], '#2b3a8f');
  assert.equal(stops[1].color, '#2b3a8f');
  const authored = buildGradientColorStops({
    ...base,
    reverse: true,
    stops: [{ position: 70, color: '#0000ff' }, { position: 30, color: '#FF0000' }],
  });
  assert.deepEqual(authored.map((stop) => stop.offset), [0, 0.3, 0.7, 1]);
  assertTransparentOf(authored[0], '#ff0000');
  assert.equal(authored[3].color, '#2b3a8f');
});

test('transparent end follows the last authored stop or midpoint colour', () => {
  const authored = buildGradientColorStops({
    ...base,
    stops: [{ position: 22, color: '#ff0000' }, { position: 78, color: '#0000ff' }],
  });
  assert.deepEqual(authored.map((stop) => [stop.offset, stop.color.slice(0, 7)]), [
    [0, '#2b3a8f'], [0.22, '#ff0000'], [0.78, '#0000ff'], [1, '#0000ff'],
  ]);
  assertTransparentOf(authored[3], '#0000ff');

  const midpoint = buildGradientColorStops({ ...base, midpoint: '#00ff00', midpointPosition: 64 });
  assert.deepEqual(midpoint.map((stop) => stop.offset), [0, 0.64, 1]);
  assert.equal(midpoint[1].color, '#00ff00');
  assertTransparentOf(midpoint[2], '#00ff00');
  const clamped = buildGradientColorStops({ ...base, midpoint: '#00ff00', midpointPosition: 0 });
  assert.equal(clamped[1].offset, 0.01);
});

test('reflected transparent midpoint is the drawing colour at zero alpha', () => {
  const stops = buildGradientColorStops({ ...base, mode: 'reflected', midpointPosition: 80 });
  assert.deepEqual(stops.map((stop) => stop.offset), [0, 0.5, 1]);
  assert.equal(stops[0].color, '#2b3a8f');
  assertTransparentOf(stops[1], '#2b3a8f');
  assert.equal(stops[2].color, '#2b3a8f');
  const withMidpoint = buildGradientColorStops({ ...base, mode: 'reflected', midpoint: '#00ff00', midpointPosition: 64 });
  assert.deepEqual(withMidpoint, [
    { offset: 0, color: '#2b3a8f' },
    { offset: 0.64, color: '#00ff00' },
    { offset: 1, color: '#2b3a8f' },
  ]);
});

test('background end is unchanged', () => {
  const plan = { ...base, end: 'background' };
  assert.deepEqual(buildGradientColorStops(plan), [
    { offset: 0, color: '#2b3a8f' },
    { offset: 1, color: '#ffcc00' },
  ]);
  assert.deepEqual(buildGradientColorStops({ ...plan, reverse: true }), [
    { offset: 0, color: '#ffcc00' },
    { offset: 1, color: '#2b3a8f' },
  ]);
  assert.deepEqual(buildGradientColorStops({ ...plan, mode: 'reflected' }), [
    { offset: 0, color: '#2b3a8f' },
    { offset: 0.5, color: '#ffcc00' },
    { offset: 1, color: '#2b3a8f' },
  ]);
  assert.deepEqual(buildGradientColorStops({ ...plan, stops: [{ position: 40, color: '#00ff00' }] }), [
    { offset: 0, color: '#2b3a8f' },
    { offset: 0.4, color: '#00ff00' },
    { offset: 1, color: '#ffcc00' },
  ]);
});

test('every sampled ramp pixel keeps the start hue (no white fringe)', () => {
  for (const plan of [base, { ...base, reverse: true }, { ...base, mode: 'reflected' }]) {
    const stops = buildGradientColorStops(plan);
    for (let step = 0; step <= 100; step += 1) {
      const [r, g, b, a] = sample(stops, step / 100);
      if (a <= 0) continue;
      assert.ok(Math.abs(r - 0x2b) <= 1 && Math.abs(g - 0x3a) <= 1 && Math.abs(b - 0x8f) <= 1,
        `t=${step / 100} drifted to rgb(${r}, ${g}, ${b})`);
    }
  }
  // The previous transparent-white end visibly lightened the ramp midpoint.
  const [r, g, b] = sample([{ offset: 0, color: '#2b3a8f' }, { offset: 1, color: '#ffffff00' }], 0.5);
  assert.ok(r > 0x80 && g > 0x80 && b > 0xb0);
});
