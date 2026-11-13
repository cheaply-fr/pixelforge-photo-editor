import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERN_IDS,
  PATTERN_MAX_TILE,
  PATTERN_MIN_TILE,
  applyPatternStamp,
  createPatternTile,
  normalizePatternTileSize,
  patternColor,
  validPatternId,
} from '../src/patternStamp.ts';

const base = {
  width: 17,
  height: 13,
  x: 8,
  y: 6,
  size: 9,
  hardness: 100,
  opacity: 1,
  pattern: 'checker',
  tileSize: 8,
  foreground: [240, 20, 10, 255],
  background: [10, 20, 240, 255],
};

const pixels = (width, height, color = [0, 0, 0, 0]) => {
  const value = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < value.length; i += 4) value.set(color, i);
  return value;
};

test('pattern ids and tile sizes are finite bounded values', () => {
  assert.deepEqual(PATTERN_IDS, [
    'checker',
    'stripes',
    'dots',
    'grid',
    'diagonal',
    'mesh',
  ]);
  assert.equal(validPatternId('dots'), true);
  assert.equal(validPatternId('photo'), false);
  assert.equal(normalizePatternTileSize(undefined), 32);
  assert.equal(normalizePatternTileSize(PATTERN_MIN_TILE), PATTERN_MIN_TILE);
  assert.equal(normalizePatternTileSize(PATTERN_MAX_TILE), PATTERN_MAX_TILE);
  assert.throws(() => normalizePatternTileSize(3), /between/);
  assert.throws(() => normalizePatternTileSize(129), /between/);
  assert.throws(() => normalizePatternTileSize(8.5), /integer/);
});

test('all built-in tiles are deterministic and contain only supplied colours', () => {
  for (const pattern of PATTERN_IDS) {
    const first = createPatternTile(
      pattern,
      16,
      [1, 2, 3, 255],
      [250, 251, 252, 0],
    );
    const second = createPatternTile(
      pattern,
      16,
      [1, 2, 3, 255],
      [250, 251, 252, 0],
    );
    assert.deepEqual(first, second);
    assert.equal(first.length, 16 * 16 * 4);
    const colours = new Set();
    for (let i = 0; i < first.length; i += 4)
      colours.add(Array.from(first.slice(i, i + 4)).join(','));
    assert.ok(colours.size <= 2);
    assert.ok(colours.has('1,2,3,255'));
  }
});

test('patternColor rejects coordinates outside the bounded tile', () => {
  assert.throws(
    () => patternColor('grid', -1, 0, 8, [0, 0, 0, 255], [255, 255, 255, 255]),
    /outside/,
  );
  assert.throws(
    () =>
      patternColor('grid', 8, 0, 8, [0, 0, 0, 255], [255, 255, 255, 255, 255]),
    /outside/,
  );
});

test('pattern stamp applies radial coverage, clips at edges, and phases across bounded buffers', () => {
  const destination = pixels(17, 13);
  const result = applyPatternStamp(destination, base);
  assert.equal(result.changed, true);
  assert.equal(result.bounds.left, 3);
  assert.equal(result.bounds.top, 1);
  assert.equal(result.bounds.right, 13);
  assert.equal(result.bounds.bottom, 11);
  assert.deepEqual(
    Array.from(destination.slice((6 * 17 + 8) * 4, (6 * 17 + 8) * 4 + 4)),
    [10, 20, 240, 255],
  );
  const bounded = pixels(5, 5);
  applyPatternStamp(bounded, {
    ...base,
    width: 5,
    height: 5,
    x: 0,
    y: 0,
    originX: 4,
    originY: 3,
  });
  assert.ok(Array.from(bounded).some((channel) => channel !== 0));
  assert.throws(
    () => applyPatternStamp(new Uint8ClampedArray(4), base),
    /every pixel/,
  );
});

test('pattern stamp opacity and transparent background preserve alpha semantics', () => {
  const destination = pixels(9, 9, [100, 100, 100, 255]);
  const result = applyPatternStamp(destination, {
    ...base,
    width: 9,
    height: 9,
    x: 4,
    y: 4,
    size: 7,
    opacity: 0.5,
    background: [255, 255, 255, 0],
  });
  assert.equal(result.changed, true);
  const center = (4 * 9 + 4) * 4;
  assert.equal(destination[center + 3], 255);
  assert.ok(destination[center] > 100 || destination[center + 1] < 100);
});

test('pattern stamp validates pattern, dimensions, colours and request bounds', () => {
  assert.throws(
    () =>
      applyPatternStamp(pixels(3, 3), {
        ...base,
        width: 3,
        height: 3,
        pattern: 'unknown',
      }),
    /id/,
  );
  assert.throws(
    () => applyPatternStamp(pixels(3, 3), { ...base, width: 0, height: 3 }),
    /dimensions/,
  );
  assert.throws(
    () =>
      applyPatternStamp(pixels(3, 3), {
        ...base,
        width: 3,
        height: 3,
        foreground: [0, 0, 0],
      }),
    /colours/,
  );
  assert.throws(
    () =>
      applyPatternStamp(pixels(3, 3), {
        ...base,
        width: 3,
        height: 3,
        originX: Number.NaN,
      }),
    /origin/,
  );
});
