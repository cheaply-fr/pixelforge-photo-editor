import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PEN_OPTIONS,
  PATH_TOOL_HINTS,
  WORK_PATH_STROKE_WIDTH,
  normalizePenOptions,
  pathToolOptions,
  penAutoEditMode,
  penLayerName,
  penLayerNotice,
  penPathStyle,
  rubberBandNodes,
  validPenOptions,
} from '../src/penOptions.ts';
import {
  DEFAULT_SHAPE_APPEARANCE,
  SHAPE_TOOL_IDS,
  centeredShapeBox,
  isShapeToolId,
  lineShapeAppearance,
  normalizeShapeAppearance,
  parametricShapeAppearance,
  parametricShapePathStyle,
  pathShapeAppearance,
  resolveShapePaint,
  shapeLayerName,
  shapeOutlineColor,
  validShapeAppearance,
} from '../src/shapeAppearance.ts';
import { appendCurvaturePoint, buildCurvaturePath } from '../src/curvaturePen.ts';
import { editPathAnchor, isPathAnchorEdit } from '../src/pathEditTools.ts';
import { validatePath } from '../src/paths.ts';
import { commonLayer, validateFrame } from '../src/document.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import { layerToCss } from '../src/cssExport.ts';

const FG = '#112233', BG = '#ddeeff';
const square = () => validatePath({
  nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  closed: true, fill: true, stroke: true, strokeWidth: 2, fillColor: '#000000', strokeColor: '#000000',
});

test('pen options default to Shape mode with Auto Add/Delete and no Rubber Band', () => {
  assert.deepEqual({ ...DEFAULT_PEN_OPTIONS }, { mode: 'shape', autoAddDelete: true, rubberBand: false });
  assert.deepEqual(normalizePenOptions(undefined), DEFAULT_PEN_OPTIONS);
  assert.deepEqual(normalizePenOptions({ mode: 'path' }), { mode: 'path', autoAddDelete: true, rubberBand: false });
  assert.deepEqual(normalizePenOptions({ mode: 'bogus', rubberBand: 'yes' }), DEFAULT_PEN_OPTIONS);
  assert.equal(validPenOptions(undefined), true);
  assert.equal(validPenOptions({ mode: 'path', autoAddDelete: false, rubberBand: true }), true);
  assert.equal(validPenOptions({ mode: 'outline' }), false);
  assert.equal(validPenOptions({ rubberBand: 1 }), false);
  assert.equal(validPenOptions({ extra: true }), false);
  assert.equal(validPenOptions([]), false);
});

test('Shape mode fills closed pen paths; Path mode makes unfilled hairline work paths', () => {
  assert.deepEqual(penPathStyle('shape', true, 6, '#ff0000'), {
    fill: true, stroke: true, strokeWidth: 6, fillColor: '#ff0000', strokeColor: '#ff0000',
  });
  assert.equal(penPathStyle('shape', false, 6, '#ff0000').fill, false, 'open shape paths are stroked only');
  const work = penPathStyle('path', true, 30, '#ff0000');
  assert.equal(work.fill, false);
  assert.equal(work.stroke, true);
  assert.equal(work.strokeWidth, WORK_PATH_STROKE_WIDTH);
  assert.doesNotThrow(() => validatePath({ ...square(), ...work }));
  assert.equal(penLayerName('pen', 'shape', 3), 'Path 3');
  assert.equal(penLayerName('freeform-pen', 'shape', 4), 'Freeform Path 4');
  assert.equal(penLayerName('curvature-pen', 'shape', 5), 'Curvature Path 5');
  assert.equal(penLayerName('curvature-pen', 'path', 5), 'Work Path 5');
  assert.match(penLayerNotice('pen', 'path'), /Work path/);
  assert.equal(penLayerNotice('pen', 'shape'), 'Editable path layer added');
});

test('Auto Add/Delete adds on a segment, deletes on an anchor, and modifiers always win', () => {
  const path = square();
  assert.equal(penAutoEditMode(path, { x: 50, y: 0 }, 6, {}, true), 'add');
  assert.equal(penAutoEditMode(path, { x: 100, y: 100 }, 6, {}, true), 'delete');
  assert.equal(penAutoEditMode(path, { x: 100, y: 100 }, 6, {}, false), null);
  assert.equal(penAutoEditMode(path, { x: 50, y: 0 }, 6, { altKey: true }, false), 'delete');
  assert.equal(penAutoEditMode(path, { x: 50, y: 0 }, 6, { shiftKey: true }, true), 'convert');
  const deleted = editPathAnchor(path, { x: 100, y: 100 }, 6, penAutoEditMode(path, { x: 100, y: 100 }, 6, {}, true));
  assert.ok(isPathAnchorEdit(deleted));
  assert.equal(deleted.path.nodes.length, 3);
  const added = editPathAnchor(path, { x: 50, y: 0 }, 6, penAutoEditMode(path, { x: 50, y: 0 }, 6, {}, true));
  assert.ok(isPathAnchorEdit(added));
  assert.equal(added.path.nodes.length, 5);
});

test('Rubber Band previews a provisional anchor without mutating the placed ones', () => {
  const points = [{ x: 0, y: 0, outHandle: { x: 5, y: 5 } }, { x: 10, y: 0 }];
  const preview = rubberBandNodes(points, { x: 20, y: 30 });
  assert.equal(preview.length, 3);
  assert.deepEqual(preview[2], { x: 20, y: 30 });
  assert.deepEqual(preview[0].outHandle, { x: 5, y: 5 });
  preview[0].outHandle.x = 99;
  assert.equal(points[0].outHandle.x, 5);
  assert.equal(rubberBandNodes(points, { x: 10.1, y: 0 }).length, 2, 'pointer on the last anchor adds nothing');
  assert.equal(rubberBandNodes(points, { x: Number.NaN, y: 0 }).length, 2);
  assert.equal(rubberBandNodes(points, undefined).length, 2);
});

test('pen and path tools get tailored option sets and hints', () => {
  assert.deepEqual(pathToolOptions('pen', 'shape'), ['mode', 'strokeWidth', 'autoAddDelete', 'rubberBand', 'pathPreset', 'strokePath']);
  assert.deepEqual(pathToolOptions('pen', 'path'), ['mode', 'autoAddDelete', 'rubberBand', 'pathPreset', 'strokePath']);
  assert.deepEqual(pathToolOptions('curvature-pen', 'shape'), ['mode', 'strokeWidth', 'rubberBand', 'pathPreset', 'strokePath']);
  assert.deepEqual(pathToolOptions('freeform-pen', 'shape'), ['mode', 'strokeWidth', 'pathPreset', 'strokePath']);
  for (const tool of ['add-anchor', 'delete-anchor', 'convert-point', 'path-select', 'direct-select'])
    assert.deepEqual(pathToolOptions(tool, 'shape'), ['pathPreset', 'strokePath'], tool);
  const sets = new Set(['pen', 'freeform-pen', 'curvature-pen', 'add-anchor'].map((tool) => pathToolOptions(tool, 'shape').join()));
  assert.equal(sets.size, 4, 'the drawing tools no longer share one option set');
  assert.equal(new Set(Object.values(PATH_TOOL_HINTS)).size, Object.keys(PATH_TOOL_HINTS).length);
});

test('a closed Curvature Pen path curves its closing segment like the others', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const style = { strokeWidth: 2, fillColor: '#abcdef', strokeColor: '#102030' };
  const closed = buildCurvaturePath(points, style, true);
  assert.equal(closed.closed, true);
  assert.equal(closed.fill, true);
  for (const node of closed.nodes) {
    assert.ok(node.inHandle && node.outHandle, 'every anchor is smooth');
    // Handles are collinear with the anchor (a smooth point).
    const cross = (node.outHandle.x - node.x) * (node.inHandle.y - node.y) - (node.outHandle.y - node.y) * (node.inHandle.x - node.x);
    assert.ok(Math.abs(cross) < 1e-9);
  }
  // Closing segment: last anchor's out-handle and first anchor's in-handle leave the chord.
  const first = closed.nodes[0], last = closed.nodes[3];
  assert.notEqual(last.outHandle.x, last.x);
  assert.notEqual(first.inHandle.y, first.y);
  // Symmetric input → symmetric handles (no straight edge left at the seam).
  assert.deepEqual(first.inHandle, { x: -100 / 6, y: 100 / 6 });
  assert.deepEqual(last.outHandle, { x: -100 / 6, y: 100 - 100 / 6 });
  // Open paths keep their straight ends (no wrap-around).
  const open = buildCurvaturePath(points, style);
  assert.equal(open.nodes[0].inHandle, undefined);
  assert.equal(open.nodes[3].outHandle, undefined);
  assert.equal(appendCurvaturePoint(points, { x: 0, y: 100.5 }).length, 4);
});

test('shape appearance defaults to filled foreground with no stroke', () => {
  assert.deepEqual({ ...DEFAULT_SHAPE_APPEARANCE }, {
    fill: 'foreground', fillColor: '#000000', stroke: 'none', strokeColor: '#000000',
    strokeWidth: 4, createWidth: 200, createHeight: 200,
  });
  assert.deepEqual(normalizeShapeAppearance(undefined), DEFAULT_SHAPE_APPEARANCE);
  assert.deepEqual(parametricShapeAppearance(DEFAULT_SHAPE_APPEARANCE, FG, BG), { color: FG, fill: true, stroke: 4 });
  const normalized = normalizeShapeAppearance({ fill: 'custom', fillColor: '#ABCDEF', strokeWidth: 1000, createWidth: 0.2, createHeight: 'x' });
  assert.equal(normalized.fillColor, '#abcdef');
  assert.equal(normalized.strokeWidth, 100);
  assert.equal(normalized.createWidth, 1);
  assert.equal(normalized.createHeight, 200);
  assert.equal(validShapeAppearance(undefined), true);
  assert.equal(validShapeAppearance({ fill: 'none', stroke: 'custom', strokeColor: '#ff0000', strokeWidth: 3 }), true);
  for (const bad of [{ fill: 'red' }, { strokeColor: 'red' }, { strokeWidth: 0 }, { createWidth: 16001 }, { other: 1 }, null, []])
    assert.equal(validShapeAppearance(bad), false, JSON.stringify(bad));
});

test('fill and stroke resolve consistently for parametric, line and path shapes', () => {
  assert.equal(resolveShapePaint('background', '#000000', FG, BG), BG);
  assert.equal(resolveShapePaint('custom', '#FF0000', FG, BG), '#ff0000');
  assert.equal(resolveShapePaint('none', '#ff0000', FG, BG), null);
  const both = { ...DEFAULT_SHAPE_APPEARANCE, stroke: 'custom', strokeColor: '#ff0000', strokeWidth: 6 };
  assert.deepEqual(parametricShapeAppearance(both, FG, BG), { color: FG, fill: true, stroke: 6, strokeColor: '#ff0000' });
  const outline = { ...DEFAULT_SHAPE_APPEARANCE, fill: 'none', stroke: 'background' };
  assert.deepEqual(parametricShapeAppearance(outline, FG, BG), { color: BG, fill: false, stroke: 4 }, 'legacy outline encoding');
  const nothing = { ...DEFAULT_SHAPE_APPEARANCE, fill: 'none' };
  assert.equal(parametricShapeAppearance(nothing, FG, BG), null);
  assert.equal(pathShapeAppearance(nothing, FG, BG), null);
  assert.deepEqual(pathShapeAppearance(both, FG, BG), { fill: true, stroke: true, strokeWidth: 6, fillColor: FG, strokeColor: '#ff0000' });
  assert.deepEqual(pathShapeAppearance(DEFAULT_SHAPE_APPEARANCE, FG, BG), { fill: true, stroke: false, strokeWidth: 4, fillColor: FG, strokeColor: FG });
  assert.deepEqual(lineShapeAppearance(DEFAULT_SHAPE_APPEARANCE, FG, BG), { color: FG, stroke: 4 });
  assert.deepEqual(lineShapeAppearance(both, FG, BG), { color: '#ff0000', stroke: 6 });
});

test('parametric shapes outline only when unfilled or given a strokeColor', () => {
  assert.equal(shapeOutlineColor({ fill: true, color: FG, stroke: 2 }), undefined);
  assert.equal(shapeOutlineColor({ fill: false, color: FG, stroke: 2 }), FG);
  assert.equal(shapeOutlineColor({ fill: true, color: FG, stroke: 2, strokeColor: '#ff0000' }), '#ff0000');
  assert.deepEqual(parametricShapePathStyle({ fill: true, color: FG, stroke: 3 }), {
    fill: true, stroke: false, strokeWidth: 3, fillColor: FG, strokeColor: FG,
  });
  assert.deepEqual(parametricShapePathStyle({ fill: true, color: FG, stroke: 3, strokeColor: '#ff0000' }).strokeColor, '#ff0000');
  const rect = { ...commonLayer('Rectangle 1'), kind: 'rectangle', width: 40, height: 20, color: FG, stroke: 3, fill: true, strokeColor: '#ff0000' };
  assert.match(layerToCss(rect, 100, 100), /border: 3px solid #ff0000/);
});

test('strokeColor validates on rectangle, ellipse and polygon layers and is rejected on lines', () => {
  const frame = (layer) => ({ w: 100, h: 100, active: layer.id, layers: [layer] });
  const valid = (layer) => { try { validateFrame(frame(layer), {}); return true; } catch { return false; } };
  const base = { ...commonLayer('Shape'), width: 40, height: 20, color: FG, stroke: 3, fill: true };
  for (const kind of ['rectangle', 'ellipse']) {
    assert.equal(valid({ ...base, kind }), true, `${kind} legacy`);
    assert.equal(valid({ ...base, kind, strokeColor: '#ff0000' }), true, kind);
    assert.equal(valid({ ...base, kind, strokeColor: 'red' }), false, kind);
    assert.equal(valid({ ...base, kind, strokeColor: 7 }), false, kind);
  }
  assert.equal(valid({ ...base, kind: 'polygon', sides: 5, strokeColor: '#00ff00' }), true);
  const line = { ...commonLayer('Line'), kind: 'line', width: 40, height: 20, color: FG, stroke: 3 };
  assert.equal(valid(line), true);
  assert.equal(valid({ ...line, strokeColor: '#00ff00' }), false);
});

test('shape layers are named after their tool and W×H creates centre on the canvas', () => {
  assert.equal(shapeLayerName('rectangle', 3), 'Rectangle 3');
  assert.equal(shapeLayerName('ellipse', 4), 'Ellipse 4');
  assert.equal(shapeLayerName('rounded-rectangle', 1), 'Rounded Rectangle 1');
  assert.equal(shapeLayerName('polygon', 2), 'Polygon 2');
  assert.equal(shapeLayerName('line', 2), 'Line 2');
  assert.equal(shapeLayerName('custom-shape', 6, 'Heart'), 'Heart 6');
  assert.deepEqual([...SHAPE_TOOL_IDS], ['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'polygon', 'custom-shape']);
  assert.equal(isShapeToolId('ellipse'), true);
  assert.equal(isShapeToolId('ellipse-select'), false);
  assert.deepEqual(centeredShapeBox(800, 600, 200, 100), { left: 300, top: 250, width: 200, height: 100 });
  assert.deepEqual(centeredShapeBox(100, 100, 0, Number.NaN), { left: 50, top: 50, width: 1, height: 1 });
  assert.equal(centeredShapeBox(100, 100, 99999, 10).width, 16000);
});

test('drafts persist shape appearance and pen options, and older drafts load with defaults', () => {
  const rect = { ...commonLayer('Rectangle 1'), kind: 'rectangle', width: 40, height: 20, color: FG, stroke: 3, fill: true, strokeColor: '#ff0000', matrix: [1, 0, 0, 1, 0, 0] };
  const draft = (settings = {}) => JSON.parse(JSON.stringify({
    version: CURRENT_DRAFT_VERSION,
    localRevision: 1,
    name: 'Vector fixture',
    index: 0,
    settings: { tool: 'rectangle', zoom: 72, color: '#000000', size: 10, text: '', fontSize: 56, ...settings },
    assets: {},
    history: [{ w: 100, h: 100, active: rect.id, layers: [rect] }],
  }));
  const legacy = validateDraft(draft());
  assert.equal(legacy.settings.shapeAppearance, undefined);
  assert.equal(legacy.settings.penOptions, undefined);
  const appearance = { fill: 'none', fillColor: '#000000', stroke: 'custom', strokeColor: '#ff0000', strokeWidth: 9, createWidth: 300, createHeight: 120 };
  const loaded = validateDraft(draft({ shapeAppearance: appearance, penOptions: { mode: 'path', autoAddDelete: false, rubberBand: true } }));
  assert.deepEqual(loaded.settings.shapeAppearance, appearance);
  assert.deepEqual(loaded.settings.penOptions, { mode: 'path', autoAddDelete: false, rubberBand: true });
  assert.throws(() => validateDraft(draft({ shapeAppearance: { fill: 'plaid' } })));
  assert.throws(() => validateDraft(draft({ penOptions: { mode: 'outline' } })));
});
