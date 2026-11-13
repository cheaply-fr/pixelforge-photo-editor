import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editFillColor,
  editFillImagePatternId,
  editFillPatternTile,
  normalizeEditFillOptions,
  renderEditFillPattern,
} from '../src/editFill.ts';
import { PATTERN_IDS, createPatternTile, patternColor, patternUsesForeground } from '../src/patternStamp.ts';

const IMAGE_ID = '0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const base = { contents: 'pattern', opacity: 100, mode: 'source-over' };
const pattern = (overrides = {}) => ({ source: 'mesh', tileSize: 16, transparentBackground: true, ...overrides });

test('pattern fill options normalize: procedural ids, tile sizes, defined image patterns', () => {
  assert.deepEqual(normalizeEditFillOptions({ ...base, pattern: pattern() }), {
    contents: 'pattern', color: '#000000', opacity: 100, mode: 'source-over',
    pattern: { source: 'mesh', tileSize: 16, transparentBackground: true },
  });
  for (const source of PATTERN_IDS)
    assert.equal(normalizeEditFillOptions({ ...base, pattern: pattern({ source }) }).pattern.source, source);
  // Tile size accepts the dialog's text and the Pattern Stamp bounds only.
  assert.equal(normalizeEditFillOptions({ ...base, pattern: pattern({ tileSize: ' 128 ' }) }).pattern.tileSize, 128);
  assert.equal(normalizeEditFillOptions({ ...base, pattern: pattern({ tileSize: '4' }) }).pattern.tileSize, 4);
  for (const tileSize of [3, 129, 12.5, '', 'x', NaN, undefined, null])
    assert.equal(normalizeEditFillOptions({ ...base, pattern: pattern({ tileSize }) }), null, `tile ${tileSize}`);
  // Unknown pattern ids and foreign shapes are refused rather than guessed.
  for (const source of ['fishnet', 'MESH', '', 42, null, undefined, 'image:nope', `image:${IMAGE_ID}`])
    assert.equal(normalizeEditFillOptions({ ...base, pattern: pattern({ source }) }), null, `source ${source}`);
  assert.equal(normalizeEditFillOptions({ ...base }), null);
  assert.equal(normalizeEditFillOptions({ ...base, pattern: null }), null);
  // A defined image pattern is accepted only when it still exists; its own size is used.
  const image = normalizeEditFillOptions(
    { ...base, pattern: pattern({ source: `image:${IMAGE_ID}`, tileSize: 'ignored' }) },
    [IMAGE_ID],
  );
  assert.equal(image.pattern.source, `image:${IMAGE_ID}`);
  assert.equal(image.pattern.tileSize, 32);
  assert.equal(editFillImagePatternId(`image:${IMAGE_ID}`), IMAGE_ID);
  assert.equal(editFillImagePatternId('mesh'), null);
  // Transparent background is the default; only an explicit false keeps the background colour.
  assert.equal(
    normalizeEditFillOptions({ ...base, pattern: { source: 'grid', tileSize: 8 } }).pattern.transparentBackground,
    true,
  );
  assert.equal(
    normalizeEditFillOptions({ ...base, pattern: pattern({ transparentBackground: false }) }).pattern.transparentBackground,
    false,
  );
  // The shared opacity and blend-mode rules still apply.
  assert.equal(normalizeEditFillOptions({ ...base, opacity: 0, pattern: pattern() }), null);
  assert.equal(normalizeEditFillOptions({ ...base, mode: 'linear-burn', pattern: pattern() }), null);
  assert.equal(normalizeEditFillOptions({ ...base, mode: 'multiply', opacity: '40', pattern: pattern() }).opacity, 40);
  // Colour contents never carry a pattern.
  assert.equal(
    'pattern' in normalizeEditFillOptions({ contents: 'black', opacity: 100, mode: 'source-over', pattern: pattern() }),
    false,
  );
  assert.equal(editFillColor('pattern', { foreground: '#FF0000', background: '#000000', color: '#00ff00' }), '#ff0000');
});

const band = (value, size) => {
  const wrapped = ((value % size) + size) % size;
  return Math.min(wrapped, size - wrapped);
};

test('the mesh tile is a seamless diamond lattice in the foreground colour', () => {
  for (const size of [4, 8, 16, 31, 32, 64, 128]) {
    let lines = 0;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const on = patternUsesForeground('mesh', x, y, size);
        lines += on ? 1 : 0;
        // Mirror symmetry across the vertical axis: a diamond, not a slant.
        assert.equal(on, patternUsesForeground('mesh', size - 1 - x, y, size), `mirror ${size} ${x},${y}`);
      }
    // Lines are present but leave open diamonds between them.
    assert.ok(lines > 0 && lines < size * size * 0.7, `coverage ${size}: ${lines}`);
  }
  // Both diagonals pass through the tile; the cell centres between them stay open.
  assert.equal(patternUsesForeground('mesh', 0, 0, 32), true);
  assert.equal(patternUsesForeground('mesh', 31, 0, 32), true);
  assert.equal(patternUsesForeground('mesh', 16, 15, 32), true);
  assert.equal(patternUsesForeground('mesh', 16, 0, 32), false);
  assert.equal(patternUsesForeground('mesh', 0, 16, 32), false);
  // Seamless: across a 3 × 3 tiling the lattice follows the global diagonals,
  // so no line is doubled or broken at a tile edge.
  const tile = { width: 32, height: 32, data: createPatternTile('mesh', 32, [0, 0, 0, 255], [0, 0, 0, 0]) };
  const wide = renderEditFillPattern(96, 96, tile);
  for (let y = 0; y < 96; y += 1)
    for (let x = 0; x < 96; x += 1) {
      const onLine = band(x + y + 1, 32) <= 2 || band(x - y, 32) <= 2;
      assert.equal(wide[(y * 96 + x) * 4 + 3] === 255, onLine, `${x},${y}`);
    }
});

test('the existing patterns are unchanged by the shared predicate', () => {
  // Hand-checked values from the original Pattern Stamp formulas.
  assert.equal(patternUsesForeground('checker', 0, 0, 16), true);
  assert.equal(patternUsesForeground('checker', 8, 0, 16), false);
  assert.equal(patternUsesForeground('stripes', 4, 0, 16), true);
  assert.equal(patternUsesForeground('stripes', 5, 0, 16), false);
  assert.equal(patternUsesForeground('diagonal', 7, 0, 16), true);
  assert.equal(patternUsesForeground('diagonal', 8, 0, 16), false);
  assert.equal(patternUsesForeground('grid', 1, 9, 16), true);
  assert.equal(patternUsesForeground('grid', 2, 9, 16), false);
  assert.equal(patternUsesForeground('dots', 8, 8, 16), true);
  assert.equal(patternUsesForeground('dots', 0, 0, 16), false);
  for (const id of PATTERN_IDS)
    assert.deepEqual(
      patternColor(id, 3, 5, 16, [9, 9, 9, 255], [1, 1, 1, 0]),
      patternUsesForeground(id, 3, 5, 16) ? [9, 9, 9, 255] : [1, 1, 1, 0],
    );
});

test('procedural fill tiles take the foreground and background wells like Pattern Stamp', () => {
  const colors = { foreground: '#FF8000', background: '#102030' };
  const transparent = editFillPatternTile(pattern({ source: 'checker', tileSize: 8 }), colors);
  assert.equal(transparent.width, 8);
  assert.equal(transparent.height, 8);
  assert.deepEqual(Array.from(transparent.data.slice(0, 4)), [255, 128, 0, 255]);
  const offset = 4 * 4;
  assert.equal(transparent.data[offset + 3], 0);
  const opaque = editFillPatternTile(pattern({ source: 'checker', tileSize: 8, transparentBackground: false }), colors);
  assert.deepEqual(Array.from(opaque.data.slice(offset, offset + 4)), [16, 32, 48, 255]);
  // Malformed wells fall back to black on white rather than arbitrary CSS.
  const fallback = editFillPatternTile(pattern({ source: 'checker', tileSize: 8, transparentBackground: false }), {
    foreground: 'red',
    background: 'x',
  });
  assert.deepEqual(Array.from(fallback.data.slice(0, 4)), [0, 0, 0, 255]);
  assert.deepEqual(Array.from(fallback.data.slice(offset, offset + 4)), [255, 255, 255, 255]);
  assert.throws(() => editFillPatternTile(pattern({ source: `image:${IMAGE_ID}` }), colors), /procedural/);
});

test('the tiled fill is deterministic and repeats the tile from the layer origin', () => {
  const tile = editFillPatternTile(pattern({ source: 'stripes', tileSize: 12 }), {
    foreground: '#00ff00',
    background: '#000000',
  });
  const first = renderEditFillPattern(53, 29, tile);
  const second = renderEditFillPattern(53, 29, tile);
  assert.deepEqual(first, second);
  assert.equal(first.length, 53 * 29 * 4);
  for (let y = 0; y < 29; y += 1)
    for (let x = 0; x < 53; x += 1) {
      const out = (y * 53 + x) * 4,
        inTile = ((y % 12) * 12 + (x % 12)) * 4;
      assert.deepEqual(
        Array.from(first.slice(out, out + 4)),
        Array.from(tile.data.slice(inTile, inTile + 4)),
        `${x},${y}`,
      );
    }
  // Non-square image tiles larger than the layer are cropped, not scaled.
  const image = { width: 5, height: 3, data: Uint8ClampedArray.from({ length: 60 }, (_, i) => (i * 7) % 256) };
  const small = renderEditFillPattern(4, 2, image);
  assert.deepEqual(Array.from(small.slice(0, 16)), Array.from(image.data.slice(0, 16)));
  assert.deepEqual(Array.from(small.slice(16, 32)), Array.from(image.data.slice(20, 36)));
  // Invalid buffers are refused.
  assert.throws(() => renderEditFillPattern(0, 4, tile), /dimensions/);
  assert.throws(() => renderEditFillPattern(4.5, 4, tile), /dimensions/);
  assert.throws(() => renderEditFillPattern(4, 4, { width: 2, height: 2, data: [1, 2, 3] }), /tile/);
  assert.throws(() => renderEditFillPattern(4, 4, tile, new Uint8ClampedArray(4)), /mask/);
});

test('a selection mask confines the pattern, including feathered coverage', () => {
  const width = 40,
    height = 30;
  const tile = editFillPatternTile(pattern({ source: 'checker', tileSize: 4, transparentBackground: false }), {
    foreground: '#ff0000',
    background: '#0000ff',
  });
  // Selected rectangle x 10–29, y 5–19, with a feathered ramp on its left edge.
  const mask = new Uint8ClampedArray(width * height * 4);
  for (let y = 5; y < 20; y += 1)
    for (let x = 10; x < 30; x += 1) mask[(y * width + x) * 4 + 3] = x < 14 ? (x - 9) * 51 : 255;
  const filled = renderEditFillPattern(width, height, tile, mask);
  const plain = renderEditFillPattern(width, height, tile);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4,
        coverage = mask[i + 3];
      if (coverage === 0) assert.equal(filled[i + 3], 0, `outside ${x},${y}`);
      else {
        assert.equal(filled[i + 3], Math.round((plain[i + 3] * coverage) / 255), `alpha ${x},${y}`);
        assert.deepEqual(Array.from(filled.slice(i, i + 3)), Array.from(plain.slice(i, i + 3)));
      }
    }
  // Fully selected pixels carry the full opaque pattern; the feather fades it.
  assert.equal(filled[(10 * width + 20) * 4 + 3], 255);
  assert.equal(filled[(10 * width + 10) * 4 + 3], 51);
  assert.equal(filled[(10 * width + 12) * 4 + 3], 153);
  // Transparent gaps stay transparent even where selected.
  const lines = editFillPatternTile(pattern({ source: 'grid', tileSize: 8 }), {
    foreground: '#ffffff',
    background: '#000000',
  });
  const confined = renderEditFillPattern(width, height, lines, mask);
  assert.equal(confined[(10 * width + 20) * 4 + 3], 0);
  assert.equal(confined[(8 * width + 16) * 4 + 3], 255);
  assert.equal(confined[(8 * width + 2) * 4 + 3], 0);
});
