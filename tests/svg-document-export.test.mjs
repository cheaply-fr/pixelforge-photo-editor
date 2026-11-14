import test from 'node:test';
import assert from 'node:assert/strict';
import { commonLayer } from '../src/document.ts';
import { prepareSvgImport } from '../src/svg.ts';
import {
  groupedBody,
  imageLayerSvg,
  planSvgExport,
  svgDocumentMarkup,
  svgLayerMode,
  textLayerSvg,
  uniformSpacing,
  vectorLayerSvg,
} from '../src/svgDocumentExport.ts';
import { planSvgImport } from '../src/svgImport.ts';

const rect = (extra = {}) => ({
  ...commonLayer('Box'), kind: 'rectangle', width: 40, height: 20, color: '#ff0000', stroke: 2, fill: true, strokeColor: '#000000', ...extra,
});
const path = (extra = {}) => ({
  ...commonLayer('Curve'),
  kind: 'path',
  path: {
    nodes: [{ x: 0, y: 0, outHandle: { x: 5, y: -5 } }, { x: 10, y: 0, inHandle: { x: 5, y: 5 } }, { x: 10, y: 10 }],
    closed: true, fill: true, stroke: true, strokeWidth: 3, fillColor: '#00ff0080', strokeColor: '#0000ff', fillRule: 'evenodd', lineJoin: 'miter', lineCap: 'butt',
  },
  ...extra,
});
const text = (extra = {}) => ({
  ...commonLayer('Title'), kind: 'text', text: 'Hi', color: '#112233', fontSize: 24, fontFamily: 'Inter', bold: false,
  boxWidth: 200, textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, orientation: 'horizontal', ...extra,
});
const raster = (extra = {}) => ({ ...commonLayer('Photo'), kind: 'raster', asset: 'a', ...extra });
const wrap = (body, w = 100, h = 100) => svgDocumentMarkup({ w, h, viewBox: [0, 0, w, h], title: 'Test', body });

test('layer modes: live vectors and text, embedded images, flattened effects', () => {
  assert.equal(svgLayerMode(rect()), 'vector');
  assert.equal(svgLayerMode(path()), 'vector');
  assert.equal(svgLayerMode(text()), 'text');
  assert.equal(svgLayerMode(raster()), 'image');
  assert.equal(svgLayerMode(rect({ visible: false })), 'hidden');
  assert.equal(svgLayerMode(rect({ blend: 'multiply' })), 'vector');
  assert.equal(svgLayerMode(rect({ blend: 'linear-burn' })), 'flatten');
  assert.equal(svgLayerMode({ ...commonLayer('Levels'), kind: 'adjustment' }), 'flatten');
  assert.equal(svgLayerMode(rect({ clippingTo: 'base' })), 'flatten');
  // Effects SVG cannot express keep the layer's pixels instead.
  assert.equal(svgLayerMode(rect({ mask: 'm' })), 'image');
  assert.equal(svgLayerMode(rect({ mask: 'm', maskEnabled: false })), 'vector');
  assert.equal(svgLayerMode(rect({ adjustments: { ...rect().adjustments, brightness: 150 } })), 'image');
  const shadow = rect();
  shadow.styles = { ...shadow.styles, dropShadow: { ...shadow.styles.dropShadow, enabled: true } };
  assert.equal(svgLayerMode(shadow), 'image');
  assert.equal(svgLayerMode(text({ warp: { style: 'arc', bend: 50, horizontal: 0, vertical: 0 } })), 'image');
  assert.equal(svgLayerMode(text({ orientation: 'vertical' })), 'image');
  // A hidden folder hides its members.
  const group = { id: 'g', name: 'Folder', visible: false, locked: false, opacity: 1, blend: 'source-over', collapsed: false };
  assert.equal(svgLayerMode(rect({ groupId: 'g' }), [group]), 'hidden');
});

test('everything below the topmost flattening layer becomes one image', () => {
  const layers = [raster(), rect(), { ...commonLayer('Curves'), kind: 'adjustment' }, rect(), text()];
  const plan = planSvgExport({ layers });
  assert.equal(plan.flattenThrough, 2);
  assert.deepEqual(plan.modes, ['image', 'vector', 'flatten', 'vector', 'text']);
  assert.equal(planSvgExport({ layers: [rect(), text()] }).flattenThrough, -1);
});

test('vector shapes match the canvas renderer geometry', () => {
  const box = vectorLayerSvg(rect({ matrix: [1, 0, 0, 1, 10, 20], opacity: 0.5, blend: 'screen' }));
  assert.match(box, /^<rect data-name="Box" transform="matrix\(1 0 0 1 10 20\)" opacity="0.5" style="mix-blend-mode:screen" width="40" height="20" fill="#ff0000" stroke="#000000" stroke-width="2"\/>$/);
  assert.match(vectorLayerSvg(rect({ cornerRadius: 6 })), /^<path [^>]*d="M [^"]+ C /);
  assert.match(vectorLayerSvg(rect({ fill: false, strokeColor: undefined })), /fill="none" stroke="#ff0000"/);
  assert.match(vectorLayerSvg({ ...rect(), kind: 'ellipse' }), /<ellipse [^>]*cx="20" cy="10" rx="20" ry="10"/);
  assert.match(vectorLayerSvg({ ...commonLayer('Rule'), kind: 'line', width: 30, height: 0, color: '#00ff00', stroke: 4 }), /<line [^>]*x2="30" y2="0" stroke="#00ff00" stroke-width="4" stroke-linecap="round"/);
  const star = vectorLayerSvg({ ...rect(), kind: 'polygon', sides: 5, variant: 'star', innerRadius: 0.5 });
  assert.equal(star.match(/points="([^"]+)"/)[1].split(' ').length, 10);
  const curve = vectorLayerSvg(path());
  assert.match(curve, /d="M 0 0 C 5 -5 5 5 10 0 L 10 10 Z"/);
  assert.match(curve, /fill="#00ff00" fill-opacity="0.502"/);
  assert.match(curve, /fill-rule="evenodd"/);
  assert.match(curve, /stroke-linejoin="miter" stroke-linecap="butt"/);
  assert.throws(() => vectorLayerSvg(text()), /not vector/);
});

test('text runs become SVG text, anchored when lines share an edge', () => {
  const runs = [
    { x: 50, y: 20, text: 'One & two', family: 'Inter', size: 24, weight: 700, italic: false, color: '#112233', anchor: 'middle' },
    { x: 50, y: 50, text: 'Three', family: 'Inter', size: 24, weight: 700, italic: false, color: '#112233', anchor: 'middle' },
  ];
  const markup = textLayerSvg(text(), runs);
  assert.match(markup, /^<text data-name="Title" x="50" y="20" font-family="'Inter', sans-serif" font-size="24" font-weight="700" fill="#112233" text-anchor="middle" xml:space="preserve">/);
  assert.match(markup, /<tspan x="50" y="20">One &amp; two<\/tspan><tspan x="50" y="50">Three<\/tspan>/);
  // Mixed styles are written per run; underlines wrap the layer in a group.
  const mixed = textLayerSvg(text(), [runs[0], { ...runs[1], color: '#ff0000', italic: true }], [{ x: 0, y: 30, w: 40, h: 2, color: '#112233' }]);
  assert.match(mixed, /^<g data-name="Title"><text x="50"/);
  assert.match(mixed, /<tspan [^>]*font-style="italic" fill="#ff0000"/);
  assert.match(mixed, /<rect x="0" y="30" width="40" height="2" fill="#112233"\/><\/g>$/);
  assert.equal(textLayerSvg(text(), []), '');
});

test('letter-spaced text is written as letter-spacing runs, not glyph by glyph', () => {
  const style = { fontSize: 24, letterSpacing: 3, tracking: 0 };
  const glyphs = [{ x: 0, width: 10 }, { x: 13, width: 8 }, { x: 24, width: 12 }];
  // Glyphs one advance plus the spacing apart are one run with that spacing.
  assert.equal(uniformSpacing({ perGlyph: true, style, glyphs }), 3);
  // Tracking (1/1000 em) adds to the layer spacing in px: 3 + 250 × 24 / 1000 = 9.
  assert.equal(uniformSpacing({ perGlyph: true, style: { ...style, tracking: 250 }, glyphs: [{ x: 0, width: 10 }, { x: 19, width: 8 }] }), 9);
  // A run drawn in one call needs no spacing; justified gaps keep per-glyph positions.
  assert.equal(uniformSpacing({ perGlyph: false, style, glyphs }), 0);
  assert.equal(uniformSpacing({ perGlyph: true, style, glyphs: [{ x: 0, width: 10 }, { x: 20, width: 8 }] }), undefined);
  const runs = [
    { x: 290, y: 20, text: 'First line', family: 'Arial', size: 18, weight: 700, italic: false, color: '#123456', spacing: 1, anchor: 'end' },
    { x: 290, y: 44, text: 'Second line', family: 'Arial', size: 18, weight: 700, italic: false, color: '#123456', spacing: 1, anchor: 'end' },
  ];
  const markup = textLayerSvg(text({ textAlign: 'right' }), runs);
  assert.match(markup, /^<text data-name="Title" x="290" y="20" [^>]*letter-spacing="1" fill="#123456" text-anchor="end" xml:space="preserve"><tspan x="290" y="20">First line<\/tspan><tspan x="290" y="44">Second line<\/tspan><\/text>$/);
  // It reopens as one right-aligned text layer with the same spacing in px.
  const back = planSvgImport(prepareSvgImport(wrap(markup, 300, 100)).markup);
  assert.deepEqual(back.items.map((item) => item.kind === 'layer' && item.layer.kind), ['text']);
  const layer = back.items[0].layer;
  assert.equal(layer.text, 'First line\nSecond line');
  assert.equal(layer.letterSpacing, 1);
  assert.equal(layer.textAlign, 'right');
  assert.equal(layer.bold, true);
  // Runs with different spacing are styled per tspan.
  assert.match(textLayerSvg(text(), [runs[0], { ...runs[1], spacing: 2 }]), /<tspan [^>]*letter-spacing="2"/);
});

test('groups wrap their members and images keep names and blend', () => {
  const group = { id: 'g', name: 'Hero', visible: true, locked: false, opacity: 0.5, blend: 'source-over', collapsed: false };
  const body = groupedBody([{ markup: '<a/>' }, { groupId: 'g', markup: '<b/>' }, { groupId: 'g', markup: '<c/>' }, { markup: '' }, { markup: '<d/>' }], [group]);
  assert.equal(body, '<a/><g data-name="Hero" opacity="0.5"><b/><c/></g><d/>');
  const image = imageLayerSvg(raster({ blend: 'overlay' }), { x: 3, y: 4, w: 5, h: 6, href: 'data:image/png;base64,AAAA' });
  assert.equal(image, '<image data-name="Photo" style="mix-blend-mode:overlay" x="3" y="4" width="5" height="6" preserveAspectRatio="none" xlink:href="data:image/png;base64,AAAA"/>');
});

test('exported documents pass the import safety check and round-trip as editable layers', () => {
  const group = { id: 'g', name: 'Badge', visible: true, locked: false, opacity: 0.5, blend: 'source-over', collapsed: false };
  const body = groupedBody([
    { markup: vectorLayerSvg(rect({ matrix: [1, 0, 0, 1, 10, 10] })) },
    { groupId: 'g', markup: vectorLayerSvg(path({ matrix: [2, 0, 0, 2, 0, 0] })) },
    { groupId: 'g', markup: textLayerSvg(text(), [{ x: 5, y: 60, text: 'Hello', family: 'Inter', size: 24, weight: 400, italic: false, color: '#112233' }]) },
    { markup: imageLayerSvg(raster(), { x: 0, y: 0, w: 1, h: 1, href: 'data:image/png;base64,iVBORw0KGgo=' }) },
  ], [group]);
  const markup = wrap(body, 120, 80);
  assert.match(markup, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink=/);
  assert.match(markup, /<title>Test<\/title>/);
  const prepared = prepareSvgImport(markup);
  assert.equal(prepared.width, 120);
  const back = planSvgImport(prepared.markup);
  assert.deepEqual(back.items.map((item) => (item.kind === 'layer' ? item.layer.kind : 'raster')), ['path', 'path', 'text', 'raster']);
  const [box, curve, title] = back.items.map((item) => item.layer);
  assert.equal(box.name, 'Box');
  assert.equal(box.path.fillColor, '#ff0000');
  const xs = box.path.nodes.map((node) => node.x);
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [10, 50]);
  // The uniform scale is baked into the nodes, stroke width included.
  assert.equal(curve.path.strokeWidth, 6);
  assert.equal(curve.path.lineJoin, 'miter');
  assert.equal(curve.path.fillColor, '#00ff0080');
  assert.equal(curve.groupId, back.groups[0].id);
  assert.equal(back.groups[0].name, 'Badge');
  assert.equal(back.groups[0].opacity, 0.5);
  assert.equal(title.text, 'Hello');
  assert.equal(title.fontFamily, 'Inter');
  assert.equal(back.items[3].name, 'Photo');
});

test('artboard documents use the artboard viewBox and background', () => {
  const markup = svgDocumentMarkup({ w: 50, h: 40, viewBox: [100, 200, 50, 40], title: 'Board', body: '', background: '#abcdef' });
  assert.match(markup, /width="50" height="40" viewBox="100 200 50 40"/);
  assert.match(markup, /<rect x="100" y="200" width="50" height="40" fill="#abcdef"\/>/);
});
