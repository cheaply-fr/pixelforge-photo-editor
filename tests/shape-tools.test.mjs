import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORNER_RADIUS_MAX,
  QUARTER_CIRCLE_KAPPA,
  clampCornerRadius,
  roundedRectNodes,
  roundedRectPoints,
  shapeDragBox,
  validCornerRadius,
} from '../src/vectorShapes.ts';
import {
  CUSTOM_SHAPE_IDS,
  CUSTOM_SHAPE_LIBRARY,
  DEFAULT_CUSTOM_SHAPE_ID,
  controlBounds,
  customShapeAspect,
  customShapePath,
  customShapeThumbnailPath,
  fitPathToBox,
  normalizeContours,
  parseShapeCommands,
  validCustomShapeChoice,
  validCustomShapeId,
} from '../src/customShapeLibrary.ts';
import { pathBounds, pathContours, serializePathData, validatePath } from '../src/paths.ts';
import { validateFrame, commonLayer, neutral } from '../src/document.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { layerToCss } from '../src/cssExport.ts';
import { pathToSvg } from '../src/svgExport.ts';
import { TOOL_FAMILIES, TOOL_FLYOUTS, TOOL_ICONS, cycleFamilyTool, duplicateToolIcons } from '../src/toolPalette.ts';
import { sectionForTool } from '../src/sidebarSections.ts';

const close = (actual, expected, message, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);

/** Point-in-polygon (even-odd) for flattened geometry checks. */
function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Sample every cubic/line segment of a contour into a polyline. */
function flatten(contour, samples = 24) {
  const out = [];
  const count = contour.nodes.length;
  const segments = contour.closed ? count : count - 1;
  for (let index = 0; index < segments; index += 1) {
    const a = contour.nodes[index], b = contour.nodes[(index + 1) % count];
    const p1 = a.outHandle ?? a, p2 = b.inHandle ?? b;
    for (let step = 0; step < samples; step += 1) {
      const t = step / samples, u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
      });
    }
  }
  return out;
}

test('corner radius clamps to half the shorter side and treats bad input as square', () => {
  assert.equal(clampCornerRadius(12, 100, 60), 12);
  assert.equal(clampCornerRadius(80, 100, 60), 30);
  assert.equal(clampCornerRadius(80, 40, 200), 20);
  assert.equal(clampCornerRadius(undefined, 100, 60), 0);
  assert.equal(clampCornerRadius(-5, 100, 60), 0);
  assert.equal(clampCornerRadius(Number.NaN, 100, 60), 0);
  assert.equal(clampCornerRadius(Infinity, 100, 60), 0);
  assert.equal(clampCornerRadius(10, 0, 60), 0);
  assert.equal(validCornerRadius(undefined), true);
  assert.equal(validCornerRadius(0), true);
  assert.equal(validCornerRadius(CORNER_RADIUS_MAX), true);
  assert.equal(validCornerRadius(CORNER_RADIUS_MAX + 1), false);
  assert.equal(validCornerRadius(-1), false);
  assert.equal(validCornerRadius('8'), false);
  assert.equal(validCornerRadius(Number.NaN), false);
});

test('rounded rectangle nodes trace quarter circles inside the box', () => {
  assert.deepEqual(roundedRectNodes(40, 20, 0), [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 },
  ]);
  const nodes = roundedRectNodes(200, 100, 25);
  assert.equal(nodes.length, 8);
  assert.deepEqual(nodes[0], { x: 25, y: 0, inHandle: { x: 25 - 25 * QUARTER_CIRCLE_KAPPA, y: 0 } });
  const path = validatePath({ nodes, closed: true, fill: true, stroke: false, strokeWidth: 1, fillColor: '#ff0000', strokeColor: '#ff0000' });
  const bounds = pathBounds(path);
  assert.deepEqual([bounds.left, bounds.top, bounds.right, bounds.bottom], [0, 0, 200, 100]);
  // Midpoint of the top-left quarter arc lies on the radius-25 circle.
  const polyline = flatten({ nodes, closed: true }, 64);
  const arc = polyline.filter((point) => point.x < 25 && point.y < 25);
  for (const point of arc) close(Math.hypot(point.x - 25, point.y - 25), 25, 'arc radius', 0.03);
  // The exact corner pixel is outside the rounded shape, the interior inside.
  assert.equal(inside(polyline, 1, 1), false);
  assert.equal(inside(polyline, 100, 50), true);
  assert.equal(inside(polyline, 199, 50), true);
  // An oversized radius makes a stadium: the short side becomes a semicircle.
  const stadium = roundedRectNodes(200, 100, 5000);
  assert.equal(stadium[2].y, 50);
  assert.equal(stadium[3].y, 50);
});

test('flattened rounded rectangle points stay on the clamped arcs', () => {
  assert.equal(roundedRectPoints(30, 30, 0).length, 4);
  const points = roundedRectPoints(120, 80, 30, 8);
  assert.equal(points.length, 4 * 9);
  for (const point of points) {
    assert.ok(point.x >= -1e-9 && point.x <= 120 + 1e-9 && point.y >= -1e-9 && point.y <= 80 + 1e-9);
  }
  assert.equal(inside(points, 2, 2), false);
  assert.equal(inside(points, 60, 40), true);
  assert.throws(() => roundedRectPoints(0, 10, 4), /dimensions/);
  assert.throws(() => roundedRectNodes(10, -1, 4), /dimensions/);
});

test('shape drag box supports Shift proportions and Alt from-centre', () => {
  assert.deepEqual(shapeDragBox({ x: 10, y: 10 }, { x: 60, y: 30 }), { left: 10, top: 10, width: 50, height: 20 });
  assert.deepEqual(shapeDragBox({ x: 60, y: 30 }, { x: 10, y: 10 }), { left: 10, top: 10, width: 50, height: 20 });
  assert.deepEqual(shapeDragBox({ x: 10, y: 10 }, { x: 60, y: 30 }, { proportional: true }), { left: 10, top: 10, width: 50, height: 50 });
  assert.deepEqual(shapeDragBox({ x: 100, y: 100 }, { x: 70, y: 90 }, { proportional: true }), { left: 70, top: 70, width: 30, height: 30 });
  assert.deepEqual(shapeDragBox({ x: 100, y: 100 }, { x: 130, y: 110 }, { fromCenter: true }), { left: 70, top: 90, width: 60, height: 20 });
  const wide = shapeDragBox({ x: 0, y: 0 }, { x: 40, y: 40 }, { proportional: true, aspect: 2 });
  assert.equal(wide.width / wide.height, 2);
  const both = shapeDragBox({ x: 50, y: 50 }, { x: 60, y: 80 }, { proportional: true, fromCenter: true });
  assert.deepEqual(both, { left: 20, top: 20, width: 60, height: 60 });
});

test('rectangle layers validate corner radius and keep legacy rectangles valid', () => {
  const frame = (layer) => ({ w: 200, h: 100, active: layer.id, layers: [layer] });
  const rect = { ...commonLayer('Rect'), kind: 'rectangle', width: 80, height: 40, color: '#336699', stroke: 2, fill: true };
  const valid = (layer) => { try { validateFrame(frame(layer), {}); return true; } catch { return false; } };
  assert.equal(valid(rect), true, 'legacy rectangle without radius stays valid');
  assert.equal(valid({ ...rect, cornerRadius: 12 }), true);
  assert.equal(valid({ ...rect, cornerRadius: 0 }), true);
  assert.equal(valid({ ...rect, cornerRadius: -1 }), false);
  assert.equal(valid({ ...rect, cornerRadius: CORNER_RADIUS_MAX + 1 }), false);
  assert.equal(valid({ ...rect, cornerRadius: '12' }), false);
  assert.equal(valid({ ...rect, cornerRadius: Number.NaN }), false);
});

test('CSS and SVG exports keep rounded corners as cubic curves', () => {
  const layer = { ...commonLayer('Rounded'), kind: 'rectangle', width: 100, height: 60, color: '#ff0000', stroke: 2, fill: true, cornerRadius: 20 };
  const css = layerToCss(layer, 200, 200);
  assert.match(css, /clip-path: path\('M 20 0 L 80 0 C /);
  const square = layerToCss({ ...layer, cornerRadius: 0 }, 200, 200);
  assert.doesNotMatch(square, / C /);
  const svg = pathToSvg(validatePath({ nodes: roundedRectNodes(100, 60, 20), closed: true, fill: true, stroke: true, strokeWidth: 2, fillColor: '#ff0000', strokeColor: '#ff0000' }), 200, 200);
  assert.match(svg, /<path d="M 20 0 L 80 0 C 91\.0457 0 100 8\.9543 100 20/);
});

test('library has at least ten unique, labelled shapes', () => {
  assert.ok(CUSTOM_SHAPE_LIBRARY.length >= 10);
  assert.equal(new Set(CUSTOM_SHAPE_IDS).size, CUSTOM_SHAPE_IDS.length);
  assert.equal(new Set(CUSTOM_SHAPE_LIBRARY.map((entry) => entry.label)).size, CUSTOM_SHAPE_LIBRARY.length);
  for (const id of ['arrow', 'heart', 'starburst', 'speech-bubble', 'checkmark', 'cross', 'lightning', 'flower', 'puzzle'])
    assert.ok(validCustomShapeId(id), id);
  assert.ok(validCustomShapeId(DEFAULT_CUSTOM_SHAPE_ID));
});

test('every library shape is closed, normalized to the unit box and passes validatePath', () => {
  for (const entry of CUSTOM_SHAPE_LIBRARY) {
    const bounds = controlBounds(entry.contours);
    close(bounds.left, 0, `${entry.id} left`);
    close(bounds.top, 0, `${entry.id} top`);
    close(bounds.right, 1, `${entry.id} right`);
    close(bounds.bottom, 1, `${entry.id} bottom`);
    for (const contour of entry.contours) {
      assert.equal(contour.closed, true, `${entry.id} contour closed`);
      assert.ok(contour.nodes.length >= 3, `${entry.id} has an area`);
    }
    const path = customShapePath(entry.id, 1, 1, '#000000');
    assert.doesNotThrow(() => validatePath(path), entry.id);
    assert.equal(path.fill, true);
    assert.equal(path.stroke, false);
    assert.equal(path.fillRule, entry.fillRule);
    // Every anchor and handle sits in the unit box, so the drawn curve does too.
    for (const contour of pathContours(path))
      for (const node of contour.nodes)
        for (const point of [node, node.inHandle, node.outHandle].filter(Boolean)) {
          assert.ok(point.x >= -1e-9 && point.x <= 1 + 1e-9, `${entry.id} x in box`);
          assert.ok(point.y >= -1e-9 && point.y <= 1 + 1e-9, `${entry.id} y in box`);
        }
    // The centre of mass of a filled shape is covered by its fill somewhere.
    const polyline = pathContours(path).map((contour) => flatten(contour));
    let covered = 0;
    for (let y = 0.05; y < 1; y += 0.1)
      for (let x = 0.05; x < 1; x += 0.1)
        if (polyline.reduce((hit, poly) => hit !== inside(poly, x, y), false)) covered += 1;
    assert.ok(covered >= 15 && covered <= 100, `${entry.id} covers ${covered}% of its box`);
    assert.match(customShapeThumbnailPath(entry.id), /^M /);
  }
});

test('library shapes scale exactly to the requested box and colour', () => {
  for (const entry of CUSTOM_SHAPE_LIBRARY) {
    const unit = customShapePath(entry.id, 1, 1, '#000000');
    const scaled = customShapePath(entry.id, 240, 90, '#12AB34');
    assert.equal(scaled.fillColor, '#12ab34');
    const unitContours = pathContours(unit), scaledContours = pathContours(scaled);
    assert.equal(scaledContours.length, unitContours.length);
    unitContours.forEach((contour, c) => contour.nodes.forEach((node, n) => {
      const other = scaledContours[c].nodes[n];
      close(other.x, node.x * 240, `${entry.id} x`, 1e-6);
      close(other.y, node.y * 90, `${entry.id} y`, 1e-6);
      if (node.outHandle) close(other.outHandle.x, node.outHandle.x * 240, `${entry.id} handle`, 1e-6);
    }));
    const serialized = serializePathData(scaled);
    assert.ok(serialized.length > 10);
  }
  assert.throws(() => customShapePath('nope', 10, 10, '#000000'), /Unknown custom shape/);
  assert.throws(() => customShapePath('heart', 0, 10, '#000000'), /size/);
  assert.throws(() => customShapePath('heart', 10, 20000, '#000000'), /size/);
  assert.throws(() => customShapePath('heart', 10, 10, 'red'), /colors/);
});

test('flower uses an even-odd hole and heart curves keep their aspect', () => {
  const flower = customShapePath('flower', 100, 100, '#000000');
  assert.equal(pathContours(flower).length, 2);
  assert.equal(flower.fillRule, 'evenodd');
  close(customShapeAspect('heart'), 100 / 92, 'heart aspect');
  assert.equal(customShapeAspect('arrow'), 100 / 80);
  assert.equal(customShapeAspect('plus'), 1);
  assert.equal(customShapeAspect('missing'), 1);
});

test('shape command parser rejects malformed data and normalizes arbitrary boxes', () => {
  assert.throws(() => parseShapeCommands('L 0 0'), /start with M/);
  assert.throws(() => parseShapeCommands('M 0 x'), /invalid/);
  assert.throws(() => parseShapeCommands('M 0 0 Q 1 1 2 2'), /Unsupported/);
  assert.throws(() => normalizeContours(parseShapeCommands('M 0 0 L 10 0 Z')), /non-empty/);
  const [square] = normalizeContours(parseShapeCommands('M 10 20 L 30 20 L 30 60 L 10 60 Z'));
  assert.deepEqual(square.nodes, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  const [curve] = parseShapeCommands('M 0 0 C 1 0 2 1 2 2 C 2 3 1 4 0 0 Z');
  assert.equal(curve.nodes.length, 2);
  assert.deepEqual(curve.nodes[0].inHandle, { x: 1, y: 4 });
});

test('saved closed paths fit into the drag box as custom shapes', () => {
  const triangle = validatePath({
    nodes: [{ x: 500, y: 100 }, { x: 900, y: 500 }, { x: 100, y: 500 }],
    closed: true, fill: false, stroke: true, strokeWidth: 3, fillColor: '#000000', strokeColor: '#000000',
  });
  const fitted = fitPathToBox(triangle, 80, 40, '#00ff00');
  assert.deepEqual(fitted.nodes, [{ x: 40, y: 0 }, { x: 80, y: 40 }, { x: 0, y: 40 }]);
  assert.equal(fitted.fill, true);
  assert.equal(fitted.fillColor, '#00ff00');
  const open = validatePath({ nodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], closed: false, fill: false, stroke: true, strokeWidth: 1, fillColor: '#000000', strokeColor: '#000000' });
  assert.throws(() => fitPathToBox(open, 10, 10, '#000000'), /closed/);
});

test('drafts persist rounded rectangles, corner radius and custom shape settings', () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const draft = (settings = {}, layer = {}) => JSON.parse(JSON.stringify({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Shape fixture',
    index: 0,
    settings: { tool: 'custom-shape', zoom: 72, color: '#000000', size: 10, text: '', fontSize: 56, ...neutral, ...settings },
    assets: {},
    history: [{
      w: 200, h: 100, active: id,
      layers: [{
        id, name: 'Rounded', visible: true, locked: false, opacity: 1, blend: 'source-over',
        matrix: [1, 0, 0, 1, 10, 10], adjustments: { ...neutral }, kind: 'rectangle',
        width: 80, height: 40, color: '#ff0000', stroke: 2, fill: true, cornerRadius: 14, ...layer,
      }],
    }],
  }));
  const loaded = validateDraft(draft({ tool: 'rounded-rectangle', shapeCornerRadius: 24, customShapeId: 'heart' }));
  assert.equal(loaded.settings.tool, 'rounded-rectangle');
  assert.equal(loaded.settings.shapeCornerRadius, 24);
  assert.equal(loaded.settings.customShapeId, 'heart');
  assert.equal(loaded.history[0].layers[0].cornerRadius, 14);
  assert.equal(validateDraft(draft({ customShapeId: 'path-preset:12345678-abcd' })).settings.customShapeId, 'path-preset:12345678-abcd');
  assert.equal(validateDraft(draft({}, { cornerRadius: undefined })).history[0].layers[0].cornerRadius, undefined);
  assert.throws(() => validateDraft(draft({ customShapeId: 'unicorn' })));
  assert.throws(() => validateDraft(draft({ shapeCornerRadius: -3 })));
  assert.throws(() => validateDraft(draft({ shapeCornerRadius: CORNER_RADIUS_MAX + 1 })));
  assert.throws(() => validateDraft(draft({}, { cornerRadius: -2 })));
  assert.equal(validCustomShapeChoice('path-preset:bad id'), false);
});

test('shape tools join the U family in Photoshop order with unique icons and sections', () => {
  assert.deepEqual(TOOL_FAMILIES.u, ['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'polygon', 'custom-shape']);
  assert.deepEqual(TOOL_FLYOUTS.shape, TOOL_FAMILIES.u);
  assert.equal(cycleFamilyTool('rectangle', 'u'), 'rounded-rectangle');
  assert.equal(cycleFamilyTool('polygon', 'u'), 'custom-shape');
  assert.equal(cycleFamilyTool('custom-shape', 'u'), 'rectangle');
  assert.equal(cycleFamilyTool('rectangle', 'u', true), 'custom-shape');
  assert.equal(TOOL_ICONS['rounded-rectangle'], 'SquareRoundCorner');
  assert.equal(TOOL_ICONS['custom-shape'], 'Shapes');
  assert.deepEqual(duplicateToolIcons(), []);
  assert.equal(sectionForTool('rounded-rectangle'), 'tool-options');
  assert.equal(sectionForTool('custom-shape'), 'tool-options');
});
