import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTiffComposite } from '../src/tiff.ts';

function bytes16(value, endian) {
  return endian === 'little' ? [value & 0xff, value >>> 8] : [value >>> 8, value & 0xff];
}

function bytes32(value, endian) {
  return endian === 'little'
    ? [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24]
    : [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function fixture({ endian = 'little', width = 2, height = 1, samplesPerPixel = 3, photometric = 2, compression = 1, predictor = 1, orientation = 1, extraSample = 2, pixels }) {
  const entries = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, samplesPerPixel, samplesPerPixel === 1 ? 8 : 0],
    [259, 3, 1, compression],
    [262, 3, 1, photometric],
    [273, 4, 1, 0],
    [277, 3, 1, samplesPerPixel],
    [278, 4, 1, height],
    [279, 4, 1, 0],
    [284, 3, 1, 1],
    [317, 3, 1, predictor],
    [274, 3, 1, orientation],
  ];
  if (samplesPerPixel === 4 || samplesPerPixel === 2) entries.push([338, 3, 1, extraSample]);
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  const encoded = compression === 1 ? [...pixels] : [pixels.length - 1, ...pixels];
  const bitsOffset = dataOffset;
  const bitsExternal = samplesPerPixel * 2 > 4;
  const encodedOffset = bitsOffset + (bitsExternal ? samplesPerPixel * 2 : 0);
  const bytes = [
    ...(endian === 'little' ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...bytes16(42, endian),
    ...bytes32(8, endian),
    ...bytes16(entries.length, endian),
  ];
  for (const [tag, type, count, value] of entries) {
    bytes.push(...bytes16(tag, endian), ...bytes16(type, endian), ...bytes32(count, endian));
    const actual = tag === 258 && count > 2 ? bitsOffset : tag === 273 ? encodedOffset : tag === 279 ? encoded.length : value;
    if (tag === 258 && count === 2) bytes.push(...bytes16(8, endian), ...bytes16(8, endian));
    else if (type === 3 && count === 1) bytes.push(...bytes16(actual, endian), 0, 0);
    else bytes.push(...bytes32(actual, endian));
  }
  bytes.push(...bytes32(0, endian));
  if (bitsExternal) for (let index = 0; index < samplesPerPixel; index += 1) bytes.push(...bytes16(8, endian));
  bytes.push(...encoded);
  return Uint8Array.from(bytes);
}

test('decodes little-endian raw RGB TIFF pixels and alpha defaults', () => {
  const decoded = decodeTiffComposite(fixture({ pixels: [255, 8, 16, 4, 128, 64] }));
  assert.equal(decoded.compression, 'raw');
  assert.deepEqual([...decoded.pixels], [255, 8, 16, 255, 4, 128, 64, 255]);
});

test('decodes big-endian PackBits RGB and inverted grayscale TIFFs', () => {
  const rgb = decodeTiffComposite(fixture({ endian: 'big', compression: 32773, pixels: [255, 0, 0, 0, 255, 0] }));
  assert.equal(rgb.compression, 'packbits');
  assert.deepEqual([...rgb.pixels], [255, 0, 0, 255, 0, 255, 0, 255]);
  const gray = decodeTiffComposite(fixture({ width: 2, samplesPerPixel: 1, photometric: 0, pixels: [0, 255] }));
  assert.deepEqual([...gray.pixels], [255, 255, 255, 255, 0, 0, 0, 255]);
});

test('decodes horizontal-predictor RGBA TIFFs and rejects mismatched channel depths', () => {
  const rgba = decodeTiffComposite(fixture({ samplesPerPixel: 4, compression: 1, predictor: 2, pixels: [10, 20, 30, 255, 251, 241, 231, 129] }));
  assert.equal(rgba.predictor, 'horizontal');
  assert.deepEqual([...rgba.pixels], [10, 20, 30, 255, 5, 5, 5, 128]);
  const malformed = fixture({ samplesPerPixel: 3, pixels: [1, 2, 3, 4, 5, 6] });
  malformed[158] = 1;
  assert.throws(() => decodeTiffComposite(malformed), /BitsPerSample/);
});

test('normalizes TIFF orientation and associated alpha without changing the output contract', () => {
  const oriented = decodeTiffComposite(fixture({
    width: 2,
    height: 2,
    orientation: 6,
    pixels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  }));
  assert.equal(oriented.orientation, 6);
  assert.equal(oriented.width, 2);
  assert.equal(oriented.height, 2);
  assert.deepEqual([...oriented.pixels], [7, 8, 9, 255, 1, 2, 3, 255, 10, 11, 12, 255, 4, 5, 6, 255]);

  const associated = decodeTiffComposite(fixture({
    samplesPerPixel: 4,
    width: 1,
    pixels: [10, 20, 30, 128],
    extraSample: 1,
  }));
  assert.deepEqual([...associated.pixels], [20, 40, 60, 128]);

  const associatedGray = decodeTiffComposite(fixture({
    width: 1,
    samplesPerPixel: 2,
    photometric: 1,
    pixels: [64, 128],
    extraSample: 1,
  }));
  assert.deepEqual([...associatedGray.pixels], [128, 128, 128, 128]);
});

test('rejects malformed, unsupported and oversized TIFF input', () => {
  assert.throws(() => decodeTiffComposite(Uint8Array.from([0x49, 0x49])), /truncated/);
  assert.throws(() => decodeTiffComposite(fixture({ compression: 5, pixels: [1, 2, 3, 4, 5, 6] })), /compression/);
  assert.throws(() => decodeTiffComposite(fixture({ width: 16000, height: 16000, pixels: [1, 2, 3] })), /16 megapixels/);
});
