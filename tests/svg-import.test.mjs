import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SVG_MAX_INPUT_BYTES,
  prepareSvgBytes,
  prepareSvgImport,
} from '../src/svg.ts';

const SIMPLE = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="2" height="1" fill="#ff5c35"/></svg>';

test('prepares a bounded SVG without changing safe local markup', () => {
  const result = prepareSvgImport(SIMPLE);
  assert.equal(result.markup, SIMPLE);
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
});

test('accepts local fragment paint references and viewBox dimensions', () => {
  const result = prepareSvgImport('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 2 8 4"><defs><linearGradient id="paint"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect width="8" height="4" fill="url(#paint)"/></svg>');
  assert.deepEqual(result.viewBox, [-1, 2, 8, 4]);
  assert.equal(result.width, undefined);
});

test('rejects scripts, event handlers, foreign content and external resources', () => {
  for (const markup of [
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" onload="alert(1)"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><foreignObject><div/></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image href="https://example.com/x.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect fill="url(http://example.com/x)"/></svg>',
  ]) {
    assert.throws(() => prepareSvgImport(markup), /not allowed|URLs|reference/);
  }
});

test('rejects malformed, unsupported and oversized SVG documents', () => {
  for (const markup of [
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2%" height="2"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16001" height="1"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect/>',
  ]) {
    assert.throws(() => prepareSvgImport(markup), /SVG/);
  }
  assert.throws(() => prepareSvgBytes(new Uint8Array([0xff, 0xfe])), /UTF-8/);
  assert.throws(() => prepareSvgBytes(new Uint8Array(SVG_MAX_INPUT_BYTES + 1)), /8 MB/);
});

test('prepares UTF-8 SVG bytes and rejects duplicate root attributes', () => {
  assert.equal(prepareSvgBytes(new TextEncoder().encode(SIMPLE)).width, 2);
  assert.throws(() => prepareSvgImport('<svg xmlns="http://www.w3.org/2000/svg" width="2" WIDTH="2" height="1"><rect/></svg>'), /duplicated/);
});
