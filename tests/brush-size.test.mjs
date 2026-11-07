import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_SEGMENT_GATE_SIZE,
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
  BRUSH_SIZE_SLIDER_STEPS,
  brushSegmentDue,
  brushSizeStep,
  brushSizeToSliderPosition,
  brushSizeValueText,
  clampBrushSize,
  sliderPositionToBrushSize,
  spacedDabPositions,
  stepBrushSize,
  validBrushSize,
} from '../src/brushSize.ts';
import { applyRadialStamp, radialStampMask } from '../src/brush.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { localSize, neutral } from '../src/document.ts';

test('shared Size range is 1–5000 px and validation rejects out-of-range values', () => {
  assert.equal(BRUSH_SIZE_MIN, 1);
  assert.equal(BRUSH_SIZE_MAX, 5000);
  for (const value of [1, 2, 18, 100, 101, 800, 4999.5, 5000]) assert.equal(validBrushSize(value), true, String(value));
  for (const value of [0, 0.5, -1, 5000.01, 5001, 10000, Number.NaN, Infinity, '800', null, undefined])
    assert.equal(validBrushSize(value), false, String(value));
});

test('clampBrushSize rounds, clamps, parses numeric text and falls back on garbage', () => {
  assert.equal(clampBrushSize(800), 800);
  assert.equal(clampBrushSize(799.6), 800);
  assert.equal(clampBrushSize(0), 1);
  assert.equal(clampBrushSize(-40), 1);
  assert.equal(clampBrushSize(9000), 5000);
  assert.equal(clampBrushSize('1200'), 1200);
  assert.equal(clampBrushSize('', 44), 44);
  assert.equal(clampBrushSize('abc', 44), 44);
  assert.equal(clampBrushSize(Number.NaN), 18);
  assert.equal(clampBrushSize(undefined, Number.NaN), 18);
});

test('[ and ] steps are proportional to size and snap to band multiples', () => {
  const up = [];
  let size = 1;
  while (size < BRUSH_SIZE_MAX) {
    size = stepBrushSize(size, 1);
    up.push(size);
  }
  assert.deepEqual(up.slice(0, 12), [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25]);
  assert.ok(up.includes(100) && up.includes(110) && up.includes(200) && up.includes(225));
  assert.ok(up.includes(300) && up.includes(350) && up.includes(500) && up.includes(600));
  assert.ok(up.includes(1000) && up.includes(1200) && up.includes(2000) && up.includes(2500));
  assert.equal(up.at(-1), 5000);
  // Every step is at most ~50% and at least ~2% of the size it leaves.
  let previous = 1;
  for (const value of up) {
    assert.ok(value > previous);
    if (previous >= 10) assert.ok((value - previous) / previous <= 0.5 && (value - previous) / previous >= 0.02, `${previous}→${value}`);
    previous = value;
  }
  // Walking back down retraces exactly the same values.
  const down = [];
  size = BRUSH_SIZE_MAX;
  while (size > BRUSH_SIZE_MIN) {
    size = stepBrushSize(size, -1);
    down.push(size);
  }
  assert.deepEqual(down, [...up].reverse().slice(1).concat(1));
  // Off-grid values snap to the next grid value in the requested direction.
  assert.equal(stepBrushSize(18, 1), 20);
  assert.equal(stepBrushSize(18, -1), 15);
  assert.equal(stepBrushSize(730, 1), 800);
  assert.equal(stepBrushSize(730, -1), 700);
  assert.equal(stepBrushSize(5000, 1), 5000);
  assert.equal(stepBrushSize(1, -1), 1);
  assert.equal(stepBrushSize(99999, -1), 4500);
  assert.equal(brushSizeStep(100, 1), 10);
  assert.equal(brushSizeStep(100, -1), 5);
  assert.equal(brushSizeStep(800, 1), 100);
});

test('perceptual slider mapping round-trips sizes and spans the full range', () => {
  assert.equal(brushSizeToSliderPosition(BRUSH_SIZE_MIN), 0);
  assert.equal(brushSizeToSliderPosition(BRUSH_SIZE_MAX), BRUSH_SIZE_SLIDER_STEPS);
  assert.equal(sliderPositionToBrushSize(0), BRUSH_SIZE_MIN);
  assert.equal(sliderPositionToBrushSize(BRUSH_SIZE_SLIDER_STEPS), BRUSH_SIZE_MAX);
  assert.equal(sliderPositionToBrushSize(-20), BRUSH_SIZE_MIN);
  assert.equal(sliderPositionToBrushSize(5000), BRUSH_SIZE_MAX);
  // value → position → value is exact for the legacy 1–100 px range…
  for (let size = 1; size <= 100; size += 1)
    assert.equal(sliderPositionToBrushSize(brushSizeToSliderPosition(size)), size, String(size));
  // …and within one track step (<1%) everywhere else.
  for (let size = 101; size <= BRUSH_SIZE_MAX; size += 7) {
    const roundTrip = sliderPositionToBrushSize(brushSizeToSliderPosition(size));
    assert.ok(Math.abs(roundTrip - size) / size < 0.01, `${size}→${roundTrip}`);
  }
  // position → value → position is stable once value is a track value.
  for (let position = 0; position <= BRUSH_SIZE_SLIDER_STEPS; position += 1) {
    const value = sliderPositionToBrushSize(position);
    assert.equal(sliderPositionToBrushSize(brushSizeToSliderPosition(value)), value);
  }
  // Monotonic and perceptual: the middle of the track is far below the linear midpoint.
  let last = 0;
  for (let position = 0; position <= BRUSH_SIZE_SLIDER_STEPS; position += 1) {
    const value = sliderPositionToBrushSize(position);
    assert.ok(value >= last);
    last = value;
  }
  assert.ok(sliderPositionToBrushSize(BRUSH_SIZE_SLIDER_STEPS / 2) < 100);
  assert.ok(brushSizeToSliderPosition(18) > 300, 'default size sits a third of the way along the track');
  assert.equal(brushSizeValueText(800), '800 px');
  assert.equal(brushSizeValueText(9000), '5000 px');
});

test('dab spacing carries across segments instead of re-dabbing every pointer move', () => {
  const state = { started: false, carry: 0 };
  // Stroke start dabs once at the origin.
  assert.deepEqual(spacedDabPositions(0, 1250, state), [0]);
  // Many tiny moves with a 5000 px brush at 25% spacing add no dabs until 1250 px of travel.
  let dabs = 0;
  for (let move = 0; move < 249; move += 1) dabs += spacedDabPositions(5, 1250, state).length;
  assert.equal(dabs, 0);
  assert.equal(state.carry, 1245);
  assert.deepEqual(spacedDabPositions(10, 1250, state), [0.5]);
  assert.equal(state.carry, 5);
  // A long segment dabs every interval from the carried remainder.
  const long = spacedDabPositions(3000, 1000, { started: true, carry: 400 });
  assert.deepEqual(long.map((t) => Math.round(t * 3000)), [600, 1600, 2600]);
  // Total dabs for a path scale with length ÷ spacing, not with event count.
  const fine = { started: false, carry: 0 };
  let fineDabs = 0;
  for (let move = 0; move < 1000; move += 1) fineDabs += spacedDabPositions(move === 0 ? 0 : 4, 100, fine).length;
  assert.equal(fineDabs, 1 + Math.floor((999 * 4) / 100));
  // The dab cap bounds pathological segments.
  assert.equal(spacedDabPositions(1e9, 1, { started: true, carry: 0 }, 64).length, 64);
});

test('whole-layer engines coalesce moves only above the legacy 100 px range', () => {
  assert.equal(BRUSH_SEGMENT_GATE_SIZE, 100);
  assert.equal(brushSegmentDue(0.5, 18), true);
  assert.equal(brushSegmentDue(0.5, 100), true);
  assert.equal(brushSegmentDue(79, 800), false);
  assert.equal(brushSegmentDue(80, 800), true);
  assert.equal(brushSegmentDue(499, 5000), false);
  assert.equal(brushSegmentDue(500, 5000), true);
});

test('drafts accept the widened Size range while legacy sizes keep loading', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  const assetId = '11111111-1111-4111-8111-111111111111';
  const draft = (size) => ({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Brush size fixture',
    index: 0,
    settings: { tool: 'brush', zoom: 72, color: '#000000', size, text: '', fontSize: 56, ...neutral },
    assets: { [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 } },
    history: [{
      w: 1, h: 1, active: '22222222-2222-4222-8222-222222222222',
      layers: [{
        id: '22222222-2222-4222-8222-222222222222', name: 'Background', visible: true, locked: false,
        opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: { ...neutral }, kind: 'raster', asset: assetId,
      }],
    }],
  });
  for (const size of [1, 2, 18, 100, 101, 800, 5000]) assert.equal(validateDraft(draft(size)).settings.size, size);
  for (const size of [0, 5001, 10000, Number.NaN]) assert.throws(() => validateDraft(draft(size)), /not supported/);
});

test('layer-local brush diameter stays inside every engine limit for down-scaled layers', () => {
  assert.equal(localSize([1, 0, 0, 1, 0, 0], 5000), 5000);
  assert.equal(localSize([2, 0, 0, 2, 0, 0], 5000), 2500);
  assert.equal(localSize([0.25, 0, 0, 0.25, 0, 0], 5000), 10000);
  assert.equal(localSize([0.0001, 0, 0, 0.0001, 0, 0], 100), 10000);
});

test('a 3000 px dab paints the exact radius and keeps hard/soft geometry', () => {
  const width = 3200, height = 3200, size = 3000;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const started = performance.now();
  const result = applyRadialStamp(pixels, { width, height, x: 1600, y: 1600, size, hardness: 100, opacity: 1, mode: 'source-over', color: [200, 10, 20, 255] });
  const elapsed = performance.now() - started;
  assert.equal(result.changed, true);
  const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
  assert.equal(alphaAt(1600, 1600), 255);
  assert.equal(alphaAt(1600 + 1499, 1600), 255);
  assert.equal(alphaAt(1600 + 1501, 1600), 0);
  assert.equal(alphaAt(1600, 1600 - 1500), 255);
  assert.equal(alphaAt(1600, 1600 - 1501), 0);
  // Corners of the bounding square are outside the circle.
  assert.equal(alphaAt(1600 + 1100, 1600 + 1100), 0);
  // Generous bound: the optimized path handles ~7 MP dabs well under this on CI.
  assert.ok(elapsed < 20000, `3000 px dab took ${elapsed.toFixed(0)} ms`);
  const soft = radialStampMask({ width: 1001, height: 1001, x: 500, y: 500, size: 1000, hardness: 0, opacity: 1 });
  const at = (x, y) => soft.data[(y - soft.bounds.top) * soft.width + (x - soft.bounds.left)];
  assert.equal(at(500, 500), 255);
  assert.equal(at(750, 500), Math.round(0.5 * 255));
  assert.equal(at(999, 500), Math.round((1 / 500) * 255));
});

test('optimized stamp loop matches the per-pixel coverage helpers exactly', async () => {
  const { brushCoverage } = await import('../src/brush.ts');
  const { bristleCoverage } = await import('../src/brushBristle.ts');
  const { wetEdgesOpacity } = await import('../src/brushWetEdges.ts');
  const { buildUpOpacity } = await import('../src/brushBuildUp.ts');
  const cases = [
    { size: 17.3, hardness: 35, roundness: 40, angle: 30, flipX: true, flipY: false, bristle: 0, wetEdges: 0, buildUp: 0 },
    { size: 23, hardness: 100, roundness: 100, angle: 0, flipX: false, flipY: true, bristle: 60, wetEdges: 40, buildUp: 70 },
    { size: 31.7, hardness: 0, roundness: 75, angle: -120, flipX: true, flipY: true, bristle: 0, wetEdges: 90, buildUp: 0 },
  ];
  for (const options of cases) {
    const request = { width: 40, height: 36, x: 19.4, y: 17.8, opacity: 0.63, ...options };
    const mask = radialStampMask(request);
    const radius = options.size / 2, scale = 0.63 * 255;
    for (let py = mask.bounds.top; py < mask.bounds.bottom; py += 1)
      for (let px = mask.bounds.left; px < mask.bounds.right; px += 1) {
        const dx = px - request.x, dy = py - request.y;
        const coverage = brushCoverage(dx, dy, radius, options.hardness, options.roundness, options.angle, options.flipX, options.flipY);
        const filament = bristleCoverage(dx, dy, radius, options.bristle);
        const expected = coverage > 0 && filament > 0
          ? Math.round(coverage * filament * wetEdgesOpacity(Math.hypot(dx, dy), radius, options.wetEdges) * buildUpOpacity(Math.hypot(dx, dy), radius, options.buildUp) * scale)
          : 0;
        assert.equal(mask.data[(py - mask.bounds.top) * mask.width + (px - mask.bounds.left)], expected, `${JSON.stringify(options)} @ ${px},${py}`);
      }
  }
});
