import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYER_PIXEL_BUDGET,
  LayerPixelBudgetError,
  commonLayer,
  formatMegapixels,
  layerPixelBudgetMessage,
  layerPixelUsage,
  validateFrame,
} from '../src/document.ts';
import {
  EXPANDING_PAINT_TOOLS,
  canExpandRasterLayer,
  canTrimRasterLayer,
  integerTranslation,
  planLayerExpansion,
  planLayerTrim,
  translateLocal,
} from '../src/layerTrim.ts';

const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const raster = (asset, patch = {}) => ({ ...commonLayer('Paint'), kind: 'raster', asset, ...patch });

/** A poster-sized document with `count` full-canvas paint layers. */
function poster(count, w = 2646, h = 4096) {
  const assets = { [assetId(1)]: { url, w, h } };
  const layers = Array.from({ length: count }, () => raster(assetId(1)));
  return { frame: { w, h, layers, active: layers[0].id }, assets };
}

/** RGBA pixels with the given opaque points. */
function pixels(width, height, points = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of points) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

test('layerPixelUsage counts every raster-content layer asset, including shared assets', () => {
  const { frame, assets } = poster(3);
  assert.equal(layerPixelUsage(frame, assets), 3 * 2646 * 4096);
  const withVector = {
    ...frame,
    layers: [...frame.layers, { ...commonLayer('Box'), kind: 'rectangle', width: 10, height: 10, color: '#ff0000', stroke: 1, fill: true }],
  };
  assert.equal(layerPixelUsage(withVector, assets), 3 * 2646 * 4096);
  assert.equal(layerPixelUsage({ layers: [raster('missing')] }, assets), 0);
});

test('the poster budget allows five full paint layers and rejects the sixth with a specific error', () => {
  const five = poster(5);
  assert.doesNotThrow(() => validateFrame(five.frame, five.assets));
  assert.ok(layerPixelUsage(five.frame, five.assets) <= LAYER_PIXEL_BUDGET);
  const six = poster(6);
  assert.throws(
    () => validateFrame(six.frame, six.assets),
    (error) => {
      assert.ok(error instanceof LayerPixelBudgetError);
      assert.equal(error.requiredPixels, 6 * 2646 * 4096);
      assert.match(error.message, /^Layer pixel budget reached: layers may store 64 MP in total and this edit needs 65.1 MP\./);
      assert.match(error.message, /Trim Layer to Content/);
      assert.doesNotMatch(error.message, /Invalid layer document/);
      return true;
    },
  );
});

test('malformed documents keep the generic error even when they are also over budget', () => {
  const six = poster(6);
  assert.throws(
    () => validateFrame({ ...six.frame, active: 'not-a-layer' }, six.assets),
    (error) => !(error instanceof LayerPixelBudgetError) && /Invalid layer document/.test(error.message),
  );
  assert.throws(
    () => validateFrame({ ...six.frame, layers: [...six.frame.layers, { ...six.frame.layers[0] }] }, six.assets),
    /Invalid layer document/,
  );
});

test('trimmed layers at the budget boundary validate exactly at 64 MP', () => {
  const assets = { [assetId(1)]: { url, w: 4000, h: 4000 }, [assetId(2)]: { url, w: 1, h: 1 } };
  const layers = [1, 2, 3, 4].map(() => raster(assetId(1)));
  const frame = { w: 4000, h: 4000, layers, active: layers[0].id };
  assert.equal(layerPixelUsage(frame, assets), LAYER_PIXEL_BUDGET);
  assert.doesNotThrow(() => validateFrame(frame, assets));
  const trimmed = raster(assetId(2), { matrix: [1, 0, 0, 1, 1200, 3400] });
  assert.throws(() => validateFrame({ ...frame, layers: [...layers, raster(assetId(2))] }, assets), LayerPixelBudgetError);
  // Replacing one full layer with a trimmed copy frees almost a whole layer.
  const freed = { ...frame, layers: [...layers.slice(1), trimmed], active: trimmed.id };
  assert.equal(layerPixelUsage(freed, assets), 3 * 16000000 + 1);
  assert.doesNotThrow(() => validateFrame(freed, assets));
});

test('megapixel formatting and message are compact and deterministic', () => {
  assert.equal(formatMegapixels(64000000), '64');
  assert.equal(formatMegapixels(54_190_000), '54.2');
  assert.equal(formatMegapixels(-5), '0');
  assert.equal(formatMegapixels(64000001, 'up'), '64.1');
  assert.equal(formatMegapixels(80000000, 'up'), '80');
  assert.match(layerPixelBudgetMessage(LAYER_PIXEL_BUDGET + 1), /needs 64.1 MP/);
  assert.equal(
    layerPixelBudgetMessage(70_000_000),
    'Layer pixel budget reached: layers may store 64 MP in total and this edit needs 70 MP. Merge or trim layers (Layer > Trim Layer to Content), or use a smaller canvas.',
  );
});

test('planLayerTrim crops to the non-transparent bounding box and keeps pixels in place', () => {
  const identity = [1, 0, 0, 1, 0, 0];
  const single = planLayerTrim(pixels(10, 8, [[3, 5]]), 10, 8, identity);
  assert.deepEqual(single.crop, { x: 3, y: 5, width: 1, height: 1 });
  assert.deepEqual(single.matrix, [1, 0, 0, 1, 3, 5]);
  assert.equal(single.savedPixels, 79);
  assert.equal(single.empty, false);

  const spread = planLayerTrim(pixels(10, 8, [[2, 1], [6, 4, 1]]), 10, 8, [1, 0, 0, 1, 100, -20]);
  assert.deepEqual(spread.crop, { x: 2, y: 1, width: 5, height: 4 });
  assert.deepEqual(spread.matrix, [1, 0, 0, 1, 102, -19]);

  const edge = planLayerTrim(pixels(10, 8, [[0, 0], [9, 3]]), 10, 8, identity);
  assert.deepEqual(edge.crop, { x: 0, y: 0, width: 10, height: 4 });
  assert.deepEqual(edge.matrix, identity);
});

test('planLayerTrim leaves full layers alone and stores empty layers as one transparent pixel', () => {
  const identity = [1, 0, 0, 1, 0, 0];
  assert.equal(planLayerTrim(pixels(4, 3, [[0, 0], [3, 2]]), 4, 3, identity), null);
  const empty = planLayerTrim(pixels(4, 3), 4, 3, identity);
  assert.deepEqual(empty.crop, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(empty.empty, true);
  assert.equal(empty.savedPixels, 11);
  assert.equal(planLayerTrim(pixels(1, 1), 1, 1, identity), null);
});

test('translateLocal composes a layer-local offset through any affine matrix', () => {
  assert.deepEqual(translateLocal([2, 0, 0, 3, 10, 20], 4, 5), [2, 0, 0, 3, 18, 35]);
  assert.deepEqual(translateLocal([0, 1, -1, 0, 0, 0], 4, 5), [0, 1, -1, 0, -5, 4]);
});

test('planLayerExpansion grows a trimmed layer to the union of its bounds and the canvas', () => {
  const plan = planLayerExpansion(20, 10, [1, 0, 0, 1, 30, 40], 100, 80);
  assert.deepEqual(plan, { w: 100, h: 80, offsetX: 30, offsetY: 40, matrix: [1, 0, 0, 1, 0, 0] });
  // Pixels already outside the canvas are retained.
  const overhang = planLayerExpansion(50, 50, [1, 0, 0, 1, -10, 60], 100, 80);
  assert.deepEqual(overhang, { w: 110, h: 110, offsetX: 0, offsetY: 60, matrix: [1, 0, 0, 1, -10, 0] });
  // Already covering the canvas: nothing to do.
  assert.equal(planLayerExpansion(100, 80, [1, 0, 0, 1, 0, 0], 100, 80), null);
  assert.equal(planLayerExpansion(120, 90, [1, 0, 0, 1, -5, -5], 100, 80), null);
  // Rotated, scaled or sub-pixel layers keep their existing paint behaviour.
  assert.equal(planLayerExpansion(10, 10, [2, 0, 0, 2, 0, 0], 100, 80), null);
  assert.equal(planLayerExpansion(10, 10, [1, 0, 0, 1, 0.5, 0], 100, 80), null);
  // Expansion never exceeds the per-asset limit.
  assert.equal(planLayerExpansion(10, 10, [1, 0, 0, 1, -9000, 0], 8000, 2000), null);
});

test('only plain integer-positioned raster layers can be trimmed or expanded', () => {
  const plain = raster(assetId(1));
  assert.equal(canTrimRasterLayer(plain), true);
  assert.equal(canExpandRasterLayer(plain), true);
  assert.equal(integerTranslation([1, 0, 0, 1, 3, -4]), true);
  assert.equal(canTrimRasterLayer({ ...plain, matrix: [1, 0, 0, 1, 0.25, 0] }), false);
  assert.equal(canTrimRasterLayer({ ...plain, fillColor: '#ff0000' }), false);
  assert.equal(canTrimRasterLayer({ ...plain, smartFilters: [{ type: 'emboss' }] }), false);
  assert.equal(canExpandRasterLayer({ ...plain, spotHealing: [{ points: [] }] }), false);
  assert.equal(canExpandRasterLayer({ ...plain, vectorMask: { path: { nodes: [] } } }), false);
  assert.equal(canTrimRasterLayer({ ...commonLayer('Text'), kind: 'text' }), false);
  const styled = { ...plain, styles: { dropShadow: { enabled: true, color: '#000000', opacity: 0.5, angle: 120, distance: 5, size: 5 } } };
  assert.equal(canExpandRasterLayer(styled), true);
  for (const tool of ['brush', 'pencil', 'eraser', 'fill', 'gradient', 'clone', 'heal', 'smudge', 'dodge', 'burn'])
    assert.ok(EXPANDING_PAINT_TOOLS.includes(tool), tool);
});
