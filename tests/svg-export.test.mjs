import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToSvg } from '../src/svgExport.ts';

const path = {
  nodes: [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 8 }, { x: 1, y: 8 }],
  closed: true, fill: true, stroke: true, strokeWidth: 2,
  fillColor: '#ff0000', strokeColor: '#000000', fillRule: 'evenodd',
};

test('SVG export is deterministic, transformed-path ready and keeps compound fill rules', () => {
  const svg = pathToSvg(path, 10, 10);
  assert.match(svg, /^<svg xmlns=/);
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /M 1 2/);
  assert.equal(pathToSvg(path, 10, 10), svg);
});

test('SVG export rejects unsafe dimensions and malformed paths', () => {
  assert.throws(() => pathToSvg(path, 0, 10), /dimensions/);
  assert.throws(() => pathToSvg({ ...path, fillColor: 'url(javascript:bad)' }, 10, 10), /color/);
});
