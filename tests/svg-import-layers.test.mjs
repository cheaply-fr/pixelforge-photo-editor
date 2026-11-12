import test from 'node:test';
import assert from 'node:assert/strict';
import { commonLayer, validateFrame } from '../src/document.ts';
import { validatePath } from '../src/paths.ts';
import { prepareSvgImport } from '../src/svg.ts';
import {
  parsePaint,
  parsePathData,
  parseStylesheet,
  parseSvgXml,
  parseTransform,
  planSvgImport,
} from '../src/svgImport.ts';

const close = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);
const svg = (body, root = 'width="100" height="100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${root}>${body}</svg>`;
const plan = (body, root, options) => planSvgImport(prepareSvgImport(svg(body, root)).markup, options);
const layers = (result) => result.items.filter((item) => item.kind === 'layer').map((item) => item.layer);
/** Imported layers must be valid document layers. */
const assertValidDocument = (result) => {
  const kept = layers(result);
  if (!kept.length) return;
  assert.doesNotThrow(() =>
    validateFrame({ w: result.w, h: result.h, layers: kept, active: kept[0].id, selectedLayerIds: [kept[0].id], ...(result.groups.length ? { groups: result.groups } : {}) }, {}),
  );
};

test('XML parser keeps nesting, entities, CDATA and source offsets', () => {
  const markup = svg('<!-- note --><g id="a"><text>A &amp; B<![CDATA[ <C> ]]></text><rect width="1" height="1"/></g>');
  const root = parseSvgXml(markup);
  assert.equal(root.name, 'svg');
  const group = root.children[0];
  assert.equal(group.attrs.id, 'a');
  assert.equal(group.children[0].content.filter((item) => typeof item === 'string').join(''), 'A & B <C> ');
  assert.equal(markup.slice(group.children[1].start, group.children[1].end), '<rect width="1" height="1"/>');
  assert.throws(() => parseSvgXml('<svg><g></svg>'), /does not match/);
  assert.throws(() => parseSvgXml('<svg><g>'), /not closed/);
});

test('path data covers every command, relative forms and packed arc flags', () => {
  const [square] = parsePathData('M0 0 H10 V10 h-10 z');
  assert.equal(square.closed, true);
  assert.deepEqual(square.nodes.map((node) => [node.x, node.y]), [[0, 0], [10, 0], [10, 10], [0, 10]]);

  const [curve] = parsePathData('m 0 0 c 1 2 3 4 5 6 s 5 5 10 0');
  assert.deepEqual(curve.nodes[0].outHandle, { x: 1, y: 2 });
  assert.deepEqual(curve.nodes[1].inHandle, { x: 3, y: 4 });
  // S reflects the previous control point around the current point.
  assert.deepEqual(curve.nodes[1].outHandle, { x: 7, y: 8 });
  assert.deepEqual([curve.nodes[2].x, curve.nodes[2].y], [15, 6]);

  const [quad] = parsePathData('M0 0 Q 3 3 6 0 T 12 0');
  close(quad.nodes[0].outHandle.x, 2);
  close(quad.nodes[0].outHandle.y, 2);
  assert.equal(quad.nodes.length, 3);

  // a full circle from two packed-flag arcs ("0 1 0" written "010").
  const [circle] = parsePathData('M10 0a10 10 0 010 20a10 10 0 010-20z');
  assert.equal(circle.closed, true);
  for (const node of circle.nodes) close(Math.hypot(node.x - 10, node.y - 10), 10, 1e-6);

  const compound = parsePathData('M0 0 L1 0 L1 1 Z M5 5 L6 5 L6 6 Z');
  assert.equal(compound.length, 2);
  assert.equal(parsePathData('M0 0 L 1 x'), undefined);
  assert.deepEqual(parsePathData('M5 5'), []);
});

test('paints parse named, hex, rgb and hsl colours and reject gradients', () => {
  assert.deepEqual(parsePaint('navy'), { hex: '#000080', alpha: 1 });
  assert.deepEqual(parsePaint('#f80'), { hex: '#ff8800', alpha: 1 });
  assert.deepEqual(parsePaint('#ff000080'), { hex: '#ff0000', alpha: 128 / 255 });
  assert.deepEqual(parsePaint('rgba(0, 128, 255, 0.5)'), { hex: '#0080ff', alpha: 0.5 });
  assert.deepEqual(parsePaint('rgb(100% 0% 0% / 25%)'), { hex: '#ff0000', alpha: 0.25 });
  assert.deepEqual(parsePaint('hsl(120, 100%, 50%)'), { hex: '#00ff00', alpha: 1 });
  assert.equal(parsePaint('none'), 'none');
  assert.deepEqual(parsePaint('currentColor', 'red'), { hex: '#ff0000', alpha: 1 });
  assert.equal(parsePaint('url(#gradient)'), undefined);
  assert.equal(parsePaint('mysterycolor'), undefined);
});

test('transforms compose left to right and rotate about a point', () => {
  assert.deepEqual(parseTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
  const rotated = parseTransform('rotate(90 10 10)');
  // (20, 10) rotates to (10, 20) around (10, 10).
  close(rotated[0] * 20 + rotated[2] * 10 + rotated[4], 10);
  close(rotated[1] * 20 + rotated[3] * 10 + rotated[5], 20);
  assert.equal(parseTransform('translate(1,2) wobble(3)'), undefined);
});

test('stylesheets apply by specificity: tag < class < id, then inline style', () => {
  const rules = parseStylesheet('rect{fill:red} .a{fill:green} #b{fill:blue} g rect{fill:black} @media print{.a{fill:pink}}');
  assert.deepEqual(rules.map((rule) => rule.declarations.fill), ['red', 'green', 'blue']);
  const result = plan('<style>rect{fill:red} .a{fill:#00ff00} #b{fill:#0000ff}</style><rect class="a" width="10" height="10"/><rect id="b" class="a" width="10" height="10"/><rect class="a" style="fill:#123456" width="10" height="10"/>');
  assert.deepEqual(layers(result).map((layer) => layer.path.fillColor), ['#00ff00', '#0000ff', '#123456']);
});

test('shapes become editable path layers in document coordinates', () => {
  const result = plan(
    '<rect x="10" y="10" width="40" height="20" rx="5" fill="#ff0000" stroke="#000000" stroke-width="2"/>' +
    '<circle cx="50" cy="50" r="10" fill="blue"/>' +
    '<line x1="0" y1="0" x2="100" y2="100" stroke="green" stroke-width="3" stroke-linecap="square"/>' +
    '<polygon points="0,0 10,0 5,8" fill="black" stroke="red" stroke-linejoin="bevel"/>',
    'width="200" height="100" viewBox="0 0 100 50"',
  );
  assert.equal(result.w, 200);
  assert.equal(result.h, 100);
  const [rect, circle, line, polygon] = layers(result);
  assert.equal(rect.kind, 'path');
  assert.equal(rect.name, 'Rectangle');
  assert.deepEqual(rect.matrix, [1, 0, 0, 1, 0, 0]);
  // The viewBox doubles everything, stroke width included.
  assert.equal(rect.path.strokeWidth, 4);
  const xs = rect.path.nodes.map((node) => node.x);
  close(Math.min(...xs), 20);
  close(Math.max(...xs), 100);
  assert.equal(rect.path.lineJoin, 'miter');
  assert.equal(rect.path.lineCap, 'butt');
  for (const node of circle.path.nodes) close(Math.hypot(node.x - 100, node.y - 100), 20, 1e-6);
  assert.equal(circle.path.fillColor, '#0000ff');
  assert.equal(line.path.fill, false);
  assert.equal(line.path.lineCap, 'square');
  assert.equal(polygon.path.lineJoin, 'bevel');
  assert.equal(result.vectorLayers, 4);
  assertValidDocument(result);
});

test('opacity, fill-opacity, blend modes and skew transforms are kept', () => {
  const result = plan(
    '<rect width="10" height="10" fill="#ff0000" fill-opacity="0.5" opacity="0.4" style="mix-blend-mode:multiply"/>' +
    '<rect width="10" height="10" fill="#00ff00" transform="skewX(30)"/>',
  );
  const [faded, skewed] = layers(result);
  assert.equal(faded.path.fillColor, '#ff000080');
  close(faded.opacity, 0.4);
  assert.equal(faded.blend, 'multiply');
  // A skew cannot be baked into nodes, so it stays on the layer.
  close(skewed.matrix[2], Math.tan(Math.PI / 6));
  assertValidDocument(result);
});

test('top-level groups become layer groups; nested groups fold in', () => {
  const result = plan('<g id="Hero" opacity="0.5"><rect width="5" height="5"/><g opacity="0.5"><circle r="2" cx="5" cy="5"/></g></g><rect width="5" height="5"/>');
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].name, 'Hero');
  assert.equal(result.groups[0].opacity, 0.5);
  const [first, nested, outside] = layers(result);
  assert.equal(first.groupId, result.groups[0].id);
  assert.equal(nested.groupId, result.groups[0].id);
  assert.equal(nested.opacity, 0.5);
  assert.equal(outside.groupId, undefined);
  assertValidDocument(result);
});

test('simple text becomes a text layer with lines, spacing and anchor', () => {
  const result = plan(
    '<text x="50" y="40" font-family="\'Georgia\', serif" font-size="20" font-weight="bold" fill="#336699" text-anchor="middle" letter-spacing="2">' +
    '<tspan x="50" y="40">First line</tspan><tspan x="50" y="70">Second</tspan></text>',
  );
  const item = result.items[0];
  assert.equal(item.kind, 'layer');
  assert.equal(item.anchor, 'middle');
  const text = item.layer;
  assert.equal(text.kind, 'text');
  assert.equal(text.text, 'First line\nSecond');
  assert.equal(text.fontFamily, 'Georgia');
  assert.equal(text.fontSize, 20);
  assert.equal(text.bold, true);
  assert.equal(text.color, '#336699');
  assert.equal(text.textAlign, 'center');
  assert.equal(text.letterSpacing, 2);
  close(text.lineHeight, 1.5);
  // The layer top sits one ascent (0.8 em) above the first baseline.
  assert.deepEqual(text.matrix, [1, 0, 0, 1, 50, 24]);
  assert.equal(result.textLayers, 1);
  assertValidDocument(result);
});

test('styled runs and text on a path fall back to pixels', () => {
  const result = plan('<text x="0" y="10">Plain <tspan fill="red">red</tspan></text><text x="0" y="20" font-style="italic">Italic</text>');
  assert.deepEqual(result.items.map((item) => item.kind), ['raster']);
  assert.equal(result.rasterLayers, 1);
});

test('unsupported paint keeps exact looks as pixel layers with their resources', () => {
  const result = plan(
    '<defs><linearGradient id="fade"><stop offset="0" stop-color="red"/></linearGradient><clipPath id="clip"><rect width="5" height="5"/></clipPath></defs>' +
    '<rect width="10" height="10" fill="#000000"/>' +
    '<rect width="10" height="10" fill="url(#fade)"/>' +
    '<circle r="5" cx="5" cy="5" clip-path="url(#clip)"/>' +
    '<rect width="10" height="10" fill="#ffffff" stroke="#000000" stroke-dasharray="2 2"/>' +
    '<rect width="2" height="2" fill="#00ff00"/>',
  );
  assert.deepEqual(result.items.map((item) => item.kind), ['layer', 'raster', 'layer']);
  const raster = result.items[1];
  // Consecutive pieces share one pixel layer, with the gradient and clip definitions.
  assert.match(raster.markup, /<linearGradient id="fade">/);
  assert.match(raster.markup, /<clipPath id="clip">/);
  assert.match(raster.markup, /stroke-dasharray/);
  assert.match(raster.markup, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"[^>]* width="100" height="100" viewBox="0 0 100 100">/);
  assert.doesNotThrow(() => prepareSvgImport(raster.markup));
});

test('hidden content is skipped and over-limit documents import flattened', () => {
  const hidden = plan('<rect width="5" height="5" display="none"/><rect width="5" height="5" visibility="hidden"/><rect width="5" height="5" fill="none"/>');
  assert.equal(hidden.items.length, 0);
  const many = plan(Array.from({ length: 6 }, (_, index) => `<rect x="${index}" width="1" height="1"/>`).join(''), undefined, { maxLayers: 5 });
  assert.equal(many.items.length, 1);
  assert.equal(many.items[0].kind, 'raster');
  assert.equal(many.rasterLayers, 1);
});

test('real-world files: DOCTYPE, stylesheets, units, percent sizes and embedded images', () => {
  const illustrator = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="72pt" height="1in" viewBox="0 0 96 96">
<style type="text/css">.st0{fill:#E30613;}</style>
<path class="st0" d="M0,0h96v96H0V0z"/>
<image width="1" height="1" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
</svg>`;
  const prepared = prepareSvgImport(illustrator);
  assert.equal(prepared.width, 96);
  assert.equal(prepared.height, 96);
  const result = planSvgImport(prepared.markup);
  assert.equal(result.w, 96);
  assert.equal(layers(result)[0].path.fillColor, '#e30613');
  assert.equal(result.items[1].kind, 'raster');
  assert.match(result.items[1].markup, /data:image\/png;base64/);

  const percent = prepareSvgImport(svg('<rect width="1" height="1"/>', 'width="100%" height="100%" viewBox="0 0 30 20"'));
  assert.equal(planSvgImport(percent.markup).w, 30);
});

test('the safety check still rejects external and scripted content', () => {
  assert.throws(() => prepareSvgImport(svg('<image href="https://example.com/a.png"/>')), /fragment/);
  assert.throws(() => prepareSvgImport(svg('<image href="data:image/svg+xml;base64,PHN2Zz4="/>')), /data URLs/);
  assert.throws(() => prepareSvgImport(svg('<style>@import url(https://x.test/a.css);</style>')), /imports/);
  assert.throws(() => prepareSvgImport(svg('<style>.a{fill:url(https://x.test/p)}</style>')), /fragment/);
  assert.throws(() => prepareSvgImport(`<!DOCTYPE svg [<!ENTITY x "y">]>${svg('')}`), /declarations/);
  assert.throws(() => prepareSvgImport(svg('<script>alert(1)</script>')), /script/);
  assert.throws(() => prepareSvgImport(svg('', 'width="10vw" height="10"')), /absolute length/);
});

test('paths keep optional stroke joins and caps through validation', () => {
  const base = { nodes: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: false, fill: false, stroke: true, strokeWidth: 2, fillColor: '#000000', strokeColor: '#000000' };
  assert.equal(validatePath(base).lineJoin, undefined);
  const mitred = validatePath({ ...base, lineJoin: 'miter', lineCap: 'butt' });
  assert.equal(mitred.lineJoin, 'miter');
  assert.equal(mitred.lineCap, 'butt');
  // Round is the default and is not stored.
  assert.equal(validatePath({ ...base, lineJoin: 'round' }).lineJoin, undefined);
  assert.throws(() => validatePath({ ...base, lineJoin: 'spiky' }), /line join/);
  assert.throws(() => validatePath({ ...base, lineCap: 'flat' }), /line cap/);
  const layer = { ...commonLayer('Path'), kind: 'path', path: mitred };
  assert.doesNotThrow(() => validateFrame({ w: 10, h: 10, layers: [layer], active: layer.id, selectedLayerIds: [layer.id] }, {}));
});
