import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneLayerCss, layerToCss } from '../src/cssExport.ts';

const common = {
  id: 'layer-css-1', name: 'CSS layer', visible: true, locked: false,
  opacity: 75, blend: 'normal', matrix: [1, 0, 0, 1, 12, 24],
  adjustments: {},
};

test('CSS export serializes editable text metrics and escaped content deterministically', () => {
  const layer = {
    ...common, kind: 'text', text: 'A "quoted"\nlabel', color: '#ABCDEF', fontSize: 24,
    fontFamily: 'Arial', bold: true, boxWidth: 180, textAlign: 'center',
    lineHeight: 1.25, letterSpacing: 2, orientation: 'horizontal',
  };
  const css = layerToCss(layer, 800, 600);
  assert.match(css, /^\.pixelforge-layer-layer-css-1 \{/);
  assert.match(css, /transform: matrix\(1, 0, 0, 1, 12, 24\)/);
  assert.match(css, /font-family: "Arial"/);
  assert.match(css, /font-weight: 700/);
  assert.match(css, /--pixelforge-text: "A \\"quoted\\"\\A label"/);
  assert.equal(css, cloneLayerCss(layer, 800, 600));
});

test('CSS export represents vector geometry and rejects pixel-bearing layers', () => {
  const layer = { ...common, kind: 'rectangle', width: 120, height: 80, color: '#ff0000', stroke: 3, fill: true };
  const css = layerToCss(layer, 800, 600);
  assert.match(css, /background: #ff0000/);
  assert.match(css, /border: 3px solid #ff0000/);
  assert.match(css, /clip-path: path\('M 0 0 L 120 0 L 120 80 L 0 80 Z'\)/);
  assert.throws(() => layerToCss({ ...common, kind: 'raster', asset: 'asset-1' }, 800, 600), /editable text and vector/);
  assert.throws(() => layerToCss(layer, 0, 600), /dimensions/);
});

