import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_STRANDS_COUNT_MAX,
  BRUSH_STRANDS_COUNT_MIN,
  BRUSH_STRANDS_MAX_INPUT_POINTS,
  BRUSH_STRANDS_MAX_SAMPLES,
  DEFAULT_BRUSH_STRANDS,
  buildStrands,
  drawStrands,
  normalizeBrushStrands,
  smoothStrandPath,
  strandBounds,
  strandCrossings,
  strandEnvelope,
  strandOffset,
  strandParams,
  strandPathOptions,
  strandPhase,
  strandRandom,
  strandTaper,
  strandThicknessTaper,
  thinStrandInput,
  validBrushStrands,
} from '../src/brushStrands.ts';
import { BUILT_IN_BRUSH_PRESETS, builtInBrushPresetById } from '../src/brushPresetLibrary.ts';
import { createCustomBrushPreset, normalizeCustomBrushPresets, validCustomBrushPreset } from '../src/customBrushPresets.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const settings = (overrides = {}) => normalizeBrushStrands({ ...DEFAULT_BRUSH_STRANDS, enabled: true, ...overrides });
const line = (length = 600, n = 61) => Array.from({ length: n }, (_, i) => ({ x: 20 + (length * i) / (n - 1), y: 200 }));
const arc = (n) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * i) / (n - 1);
    return { x: 300 - 250 * Math.cos(a), y: 300 - 180 * Math.sin(a) };
  });
const build = (strandSettings, points = line(), extra = {}) =>
  buildStrands(smoothStrandPath(points, strandPathOptions(strandSettings)), strandSettings, { strandWidth: 2, ...extra });

class RecordingContext {
  constructor() {
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this.strokeStyle = '#000';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.calls = [];
    this.path = [];
    this.saved = 0;
  }
  save() { this.saved += 1; }
  restore() { this.saved -= 1; }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push([x, y]); }
  lineTo(x, y) { this.path.push([x, y]); }
  stroke() {
    this.calls.push({ alpha: this.globalAlpha, width: this.lineWidth, color: this.strokeStyle, cap: this.lineCap, join: this.lineJoin, points: this.path.slice() });
  }
}

test('settings normalize to bounded values and validate persisted shapes', () => {
  assert.deepEqual(normalizeBrushStrands(undefined), { ...DEFAULT_BRUSH_STRANDS });
  assert.deepEqual(normalizeBrushStrands([1, 2]), { ...DEFAULT_BRUSH_STRANDS });
  const clamped = normalizeBrushStrands({ enabled: true, count: 900, width: -5, twists: 3.3, wobble: 140, opacityJitter: -1, seed: 1e9 });
  assert.equal(clamped.enabled, true);
  assert.equal(clamped.count, BRUSH_STRANDS_COUNT_MAX);
  assert.equal(clamped.width, 1);
  assert.equal(clamped.twists, 3.5);
  assert.equal(clamped.wobble, 100);
  assert.equal(clamped.opacityJitter, 0);
  assert.equal(clamped.seed, 99999);
  assert.equal(normalizeBrushStrands({ count: 0 }).count, BRUSH_STRANDS_COUNT_MIN);
  assert.equal(normalizeBrushStrands({ count: Number.NaN }).count, DEFAULT_BRUSH_STRANDS.count);
  assert.equal(validBrushStrands({}), true);
  assert.equal(validBrushStrands({ ...DEFAULT_BRUSH_STRANDS }), true);
  assert.equal(validBrushStrands({ count: 49 }), false);
  assert.equal(validBrushStrands({ count: 2.5 }), false);
  assert.equal(validBrushStrands({ width: 0 }), false);
  assert.equal(validBrushStrands({ twists: 21 }), false);
  assert.equal(validBrushStrands({ wobble: '10' }), false);
  assert.equal(validBrushStrands({ seed: -1 }), false);
  assert.equal(validBrushStrands({ enabled: 'yes' }), false);
  assert.equal(validBrushStrands(null), false);
  assert.equal(validBrushStrands([]), false);
});

test('strand randomness is deterministic, seeded and spread over [0, 1)', () => {
  assert.equal(strandRandom(7, 3, 2), strandRandom(7, 3, 2));
  assert.notEqual(strandRandom(7, 3, 2), strandRandom(8, 3, 2));
  assert.notEqual(strandRandom(7, 3, 2), strandRandom(7, 4, 2));
  assert.notEqual(strandRandom(7, 3, 2), strandRandom(7, 3, 3));
  let sum = 0;
  for (let i = 0; i < 2000; i += 1) {
    const value = strandRandom(42, i, 0);
    assert.ok(value >= 0 && value < 1);
    sum += value;
  }
  assert.ok(Math.abs(sum / 2000 - 0.5) < 0.05);
});

test('the same seed and stroke give identical strands; another seed differs', () => {
  const a = build(settings({ seed: 11 })),
    b = build(settings({ seed: 11 })),
    c = build(settings({ seed: 12 }));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const recordA = new RecordingContext(),
    recordB = new RecordingContext();
  drawStrands(recordA, a, '#ffffff', 0.8);
  drawStrands(recordB, b, '#ffffff', 0.8);
  assert.deepEqual(recordA.calls, recordB.calls);
});

test('builds one strand per count with ribbon coordinates spread across [-1, 1]', () => {
  for (const count of [1, 2, 7, 24, 48]) {
    const strands = build(settings({ count }));
    assert.equal(strands.length, count);
    const us = strands.map((strand) => strand.u);
    assert.ok(us.every((u) => u >= -1 && u <= 1));
    if (count === 1) assert.equal(us[0], 0);
    else {
      assert.ok(Math.min(...us) < -0.6);
      assert.ok(Math.max(...us) > 0.6);
      // Ordered: jitter stays within the even spacing.
      for (let i = 1; i < us.length; i += 1) assert.ok(us[i] >= us[i - 1]);
    }
  }
});

test('the ribbon tapers to a point at both ends and is widest in the middle', () => {
  assert.equal(strandTaper(0), 0);
  assert.ok(strandTaper(1) < 1e-6);
  assert.equal(strandTaper(0.5), 1);
  assert.ok(strandTaper(0.1) < strandTaper(0.3));
  assert.ok(strandTaper(-1) === 0 && strandTaper(2) < 1e-6);
  const s = settings({ wobble: 60, twists: 0 }),
    phase = strandPhase(s);
  for (let k = 0; k < s.count; k += 1) {
    const params = strandParams(s, k);
    assert.ok(Math.abs(strandOffset(0, params, s, phase)) < 1e-9);
    assert.ok(Math.abs(strandOffset(1, params, s, phase)) < 1e-4);
  }
});

test('strand thickness and opacity fade to zero at each strand window edge', () => {
  const s = settings({ opacityJitter: 0 });
  for (let k = 0; k < s.count; k += 1) {
    const params = strandParams(s, k);
    assert.ok(params.start >= 0 && params.start < 0.2);
    assert.ok(params.end <= 1 && params.end > 0.8);
    assert.equal(strandEnvelope(params.start, params), 0);
    assert.equal(strandEnvelope(params.end, params), 0);
    assert.equal(strandThicknessTaper(params.start - 0.01, params), 0);
    const middle = (params.start + params.end) / 2;
    assert.ok(Math.abs(strandEnvelope(middle, params) - 1) < 1e-9);
    assert.ok(Math.abs(strandThicknessTaper(middle, params) - 1) < 1e-9);
  }
  // Built vertices: ends are thinner and fainter than the middle.
  for (const strand of build(s, line(800, 9))) {
    const v = strand.vertices,
      mid = v[Math.floor(v.length / 2)];
    assert.ok(v[0].width < mid.width && v[v.length - 1].width < mid.width);
    assert.ok(v[0].alpha < mid.alpha * 0.5 && v[v.length - 1].alpha < mid.alpha * 0.5);
  }
});

test('strands start and end at staggered points along the stroke', () => {
  const s = settings({ count: 24 }),
    starts = new Set(),
    ends = new Set();
  for (let k = 0; k < s.count; k += 1) {
    const params = strandParams(s, k);
    starts.add(params.start.toFixed(3));
    ends.add(params.end.toFixed(3));
  }
  assert.ok(starts.size > 18 && ends.size > 18);
  const strands = build(s);
  const firstX = strands.map((strand) => strand.vertices[0].x);
  assert.ok(Math.max(...firstX) - Math.min(...firstX) > 30);
});

test('integer twists make every pair of strands cross exactly 2 × twists times', () => {
  for (const twists of [1, 2, 3, 5]) {
    const s = settings({ twists, wobble: 0 });
    const first = strandParams(s, 0),
      last = strandParams(s, s.count - 1),
      middle = strandParams(s, 5);
    assert.equal(strandCrossings(s, first, last), 2 * twists, `twists ${twists}`);
    assert.equal(strandCrossings(s, first, middle), 2 * twists, `twists ${twists}`);
  }
  // No twist: the ribbon stays flat and the outer strands never cross.
  const flat = settings({ twists: 0, wobble: 0 });
  assert.equal(strandCrossings(flat, strandParams(flat, 0), strandParams(flat, flat.count - 1)), 0);
  // Small wobble keeps the crossing count near the twist count.
  const wobbly = settings({ twists: 3, wobble: 20 });
  const count = strandCrossings(wobbly, strandParams(wobbly, 0), strandParams(wobbly, wobbly.count - 1));
  assert.ok(count >= 5 && count <= 8, `crossings ${count}`);
});

test('offsets stay within the ribbon half-width at every point, at any wobble', () => {
  for (const wobble of [0, 35, 100])
    for (const width of [10, 120, 900]) {
      const s = settings({ wobble, width, twists: 4 }),
        phase = strandPhase(s);
      for (let k = 0; k < s.count; k += 1) {
        const params = strandParams(s, k);
        for (let i = 0; i <= 400; i += 1) {
          const t = i / 400;
          assert.ok(Math.abs(strandOffset(t, params, s, phase)) <= (width / 2) * strandTaper(t) + 1e-9);
        }
      }
    }
  // Strand vertices stay within the band around a straight stroke.
  const s = settings({ width: 160, wobble: 100 });
  for (const strand of build(s)) for (const vertex of strand.vertices) assert.ok(Math.abs(vertex.y - 200) <= 80 + 1e-6);
  // And the ribbon actually uses its width.
  const ys = build(s).flatMap((strand) => strand.vertices.map((vertex) => vertex.y));
  assert.ok(Math.max(...ys) - Math.min(...ys) > 100);
});

test('wider ribbons scale offsets proportionally', () => {
  const narrow = settings({ width: 50 }),
    wide = settings({ width: 200 }),
    phase = strandPhase(narrow);
  const params = strandParams(narrow, 0);
  for (const t of [0.2, 0.4, 0.7])
    assert.ok(Math.abs(strandOffset(t, params, wide, phase) - 4 * strandOffset(t, params, narrow, phase)) < 1e-9);
});

test('a few sparse pointer samples still give a smooth, evenly spaced path', () => {
  const sparse = [
    { x: 0, y: 0 },
    { x: 200, y: 160 },
    { x: 420, y: -40 },
    { x: 640, y: 120 },
  ];
  const path = smoothStrandPath(sparse, { step: 2, smoothing: 30 });
  assert.ok(path.samples.length > 300);
  // Passes through the input samples (Catmull-Rom interpolates).
  for (const point of sparse)
    assert.ok(path.samples.some((sample) => Math.hypot(sample.x - point.x, sample.y - point.y) < 2.5));
  // Even arc-length spacing.
  for (let i = 1; i < path.samples.length; i += 1) {
    const a = path.samples[i - 1], b = path.samples[i];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - path.step) < 0.25);
  }
  // Unit normals that rotate gradually.
  let maxTurn = 0;
  for (let i = 1; i < path.samples.length; i += 1) {
    const a = path.samples[i - 1], b = path.samples[i];
    assert.ok(Math.abs(Math.hypot(a.nx, a.ny) - 1) < 1e-9);
    maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, a.nx * b.nx + a.ny * b.ny))));
  }
  assert.ok(maxTurn < (4 * Math.PI) / 180, `max normal turn ${maxTurn}`);
  // Strands built on that path have no kinks either.
  const s = settings({ width: 80, wobble: 30 });
  for (const strand of buildStrands(path, s, { strandWidth: 2 })) {
    for (let i = 2; i < strand.vertices.length; i += 1) {
      const a = strand.vertices[i - 2], b = strand.vertices[i - 1], c = strand.vertices[i];
      const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (lengths < 1e-9) continue;
      const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lengths)));
      assert.ok(turn < (25 * Math.PI) / 180, `strand turn ${turn}`);
    }
  }
});

test('dense and sparse samples of the same curve give nearly the same path', () => {
  const dense = smoothStrandPath(arc(200), { step: 2 }),
    sparse = smoothStrandPath(arc(9), { step: 2 });
  assert.ok(Math.abs(dense.length - sparse.length) / dense.length < 0.02);
  const mid = (path) => path.samples[Math.floor(path.samples.length / 2)];
  assert.ok(Math.hypot(mid(dense).x - mid(sparse).x, mid(dense).y - mid(sparse).y) < 4);
});

test('normals sit to the left of the direction of travel and survive reversals', () => {
  const path = smoothStrandPath(line(300, 4), { step: 2 });
  for (const sample of path.samples) {
    assert.ok(Math.abs(sample.nx) < 1e-9);
    assert.ok(Math.abs(sample.ny + 1) < 1e-9);
  }
  const back = smoothStrandPath([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 1 }], { step: 2, smoothing: 400 });
  for (const sample of back.samples) assert.ok(Number.isFinite(sample.nx) && Math.abs(Math.hypot(sample.nx, sample.ny) - 1) < 1e-6);
});

test('degenerate input yields no strands and never throws', () => {
  const s = settings();
  assert.deepEqual(smoothStrandPath([]).samples, []);
  assert.equal(smoothStrandPath([{ x: 5, y: 5 }]).samples.length, 1);
  assert.equal(smoothStrandPath([{ x: 5, y: 5 }, { x: 5.5, y: 5 }]).samples.length, 1);
  assert.deepEqual(buildStrands(smoothStrandPath([{ x: 5, y: 5 }]), s, { strandWidth: 2 }), []);
  assert.deepEqual(buildStrands(smoothStrandPath([{ x: Number.NaN, y: 1 }]), s, { strandWidth: 2 }), []);
  assert.equal(strandBounds([]), null);
});

test('input thinning drops near-duplicates and caps very long strokes', () => {
  const jitter = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0.2 }, { x: 4, y: 0 }, { x: 4.2, y: 0 }];
  const thinned = thinStrandInput(jitter);
  assert.deepEqual(thinned.map((p) => p.x), [0, 4.2]);
  const long = Array.from({ length: 30000 }, (_, i) => ({ x: i * 3, y: 0 }));
  const capped = thinStrandInput(long);
  assert.equal(capped.length, BRUSH_STRANDS_MAX_INPUT_POINTS);
  assert.equal(capped[capped.length - 1].x, long[long.length - 1].x);
  const path = smoothStrandPath(long, { step: 1 });
  assert.ok(path.samples.length <= BRUSH_STRANDS_MAX_SAMPLES);
});

test('strand thickness follows brush size and pen pressure', () => {
  const s = settings({ opacityJitter: 0 });
  const points = line(600, 7).map((point, i) => ({ ...point, pressure: i < 3 ? 0.2 : 1 }));
  const path = smoothStrandPath(points, strandPathOptions(s));
  const thin = buildStrands(path, s, { strandWidth: 2 }),
    thick = buildStrands(path, s, { strandWidth: 6 });
  const maxWidth = (strands) => Math.max(...strands.flatMap((strand) => strand.vertices.map((v) => v.width)));
  assert.ok(Math.abs(maxWidth(thick) / maxWidth(thin) - 3) < 0.05);
  assert.ok(maxWidth(thick) <= 6 + 1e-9);
  const pressured = buildStrands(path, s, { strandWidth: 6, sizeAt: (p) => p, opacityAt: (p) => p });
  // Light-pressure part (left) is thinner and fainter than the firm part (right).
  const strand = pressured.find((item) => item.vertices.length > 100);
  const left = strand.vertices.filter((v) => v.x > 150 && v.x < 200),
    right = strand.vertices.filter((v) => v.x > 420 && v.x < 470);
  const mean = (list, key) => list.reduce((sum, v) => sum + v[key], 0) / list.length;
  assert.ok(mean(left, 'width') < mean(right, 'width') * 0.6);
  assert.ok(mean(left, 'alpha') < mean(right, 'alpha') * 0.6);
});

test('opacity jitter lowers some strand peaks; zero jitter keeps them at full strength', () => {
  const none = settings({ opacityJitter: 0 }),
    full = settings({ opacityJitter: 100, count: 24 });
  for (let k = 0; k < none.count; k += 1) assert.equal(strandParams(none, k).peak, 1);
  const peaks = Array.from({ length: full.count }, (_, k) => strandParams(full, k).peak);
  assert.ok(Math.min(...peaks) < 0.4);
  assert.ok(peaks.every((peak) => peak > 0 && peak <= 1));
});

test('bounds cover every vertex plus its half width', () => {
  const strands = build(settings({ width: 200 })),
    bounds = strandBounds(strands);
  for (const strand of strands)
    for (const v of strand.vertices) {
      assert.ok(v.x - v.width / 2 >= bounds.x && v.x + v.width / 2 <= bounds.x + bounds.width);
      assert.ok(v.y - v.width / 2 >= bounds.y && v.y + v.width / 2 <= bounds.y + bounds.height);
    }
  assert.ok(bounds.height <= 200 + 20);
});

test('drawing batches segments into few strokes with butt caps and bounded alpha', () => {
  const s = settings({ count: 24, width: 300 }),
    strands = build(s, line(2000, 200)),
    segments = strands.reduce((sum, strand) => sum + strand.vertices.length - 1, 0),
    context = new RecordingContext(),
    calls = drawStrands(context, strands, '#abcdef', 0.5);
  assert.equal(calls, context.calls.length);
  assert.ok(calls > strands.length);
  assert.ok(calls < segments / 2, `${calls} strokes for ${segments} segments`);
  assert.equal(context.saved, 0);
  for (const call of context.calls) {
    assert.equal(call.color, '#abcdef');
    assert.equal(call.cap, 'butt');
    assert.ok(call.alpha > 0 && call.alpha <= 0.5);
    assert.ok(call.width > 0);
    assert.ok(call.points.length >= 2);
  }
  // Every segment is drawn exactly once (runs share endpoints only).
  const drawnSegments = context.calls.reduce((sum, call) => sum + call.points.length - 1, 0);
  assert.ok(drawnSegments <= segments && drawnSegments > segments * 0.9);
});

test('path options scale the step and direction smoothing with ribbon width', () => {
  assert.deepEqual(strandPathOptions(settings({ width: 30 })), { step: 1, smoothing: 15 });
  const wide = strandPathOptions(settings({ width: 2000 }));
  assert.equal(wide.step, 4);
  assert.equal(wide.smoothing, 120);
});

test('the built-in Silk smoke preset enables strands and validates as a preset', () => {
  const silk = builtInBrushPresetById('builtin-silk-smoke');
  assert.ok(silk, 'Silk smoke preset exists');
  assert.equal(silk.label, 'Silk smoke');
  assert.equal(silk.brushStrands.enabled, true);
  assert.ok(silk.brushStrands.count >= 12);
  assert.ok(validBrushStrands(silk.brushStrands));
  assert.match(silk.description, /strand/i);
  // Every other built-in leaves strands off (or unset).
  for (const preset of BUILT_IN_BRUSH_PRESETS)
    if (preset.id !== 'builtin-silk-smoke') assert.notEqual(preset.brushStrands?.enabled, true);
});

test('saved presets and drafts round-trip strand settings and reject invalid ones', () => {
  const values = {
    size: 2, hardness: 100, spacing: 10, angle: 0, roundness: 100, flipX: false, flipY: false,
    pressureSize: true, pressureOpacity: false, brushSmoothing: 0, brushScatter: 0, brushTexture: 0, brushDual: 0,
    secondaryBrushPreset: 'none', brushBristle: 0, brushWetEdges: 0, brushBuildUp: 0, brushFlow: 100,
    brushStrands: { ...DEFAULT_BRUSH_STRANDS, enabled: true, count: 30, seed: 77 },
  };
  const preset = createCustomBrushPreset('00000000-0000-4000-8000-000000000001', 'Ribbon', values);
  assert.deepEqual(normalizeCustomBrushPresets([preset])[0].brushStrands, values.brushStrands);
  assert.equal(validCustomBrushPreset({ ...preset, brushStrands: { count: 99 } }), false);
  // Older presets without strands still load.
  const { brushStrands: _omit, ...legacy } = preset;
  assert.equal(validCustomBrushPreset(legacy), true);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const assetId = '11111111-1111-4111-8111-111111111111', layerId = '22222222-2222-4222-8222-222222222222';
  const draft = (extra) => ({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Silk fixture',
    index: 0,
    settings: { tool: 'brush', zoom: 72, color: '#000000', size: 2, text: '', fontSize: 56, ...neutral, ...extra },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: layerId,
      layers: [{
        id: layerId, name: 'Background', visible: true, locked: false,
        opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      }],
    }],
  });
  assert.equal(validateDraft(draft({})).settings.brushStrands, undefined);
  assert.deepEqual(validateDraft(draft({ brushStrands: values.brushStrands })).settings.brushStrands, values.brushStrands);
  assert.throws(() => validateDraft(draft({ brushStrands: { width: 0 } })));
  assert.deepEqual(validateDraft(draft({ customBrushPresets: [preset] })).settings.customBrushPresets[0].brushStrands, values.brushStrands);
});
