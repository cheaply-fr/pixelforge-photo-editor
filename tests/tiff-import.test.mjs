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

function fixture({ endian = 'little', width = 2, height = 1, samplesPerPixel = 3, photometric = 2, compression = 1, pixels }) {
  const entries = [
    [256, 4, width],
    [257, 4, height],
    [258, 3, 8],
    [259, 3, compression],
    [262, 3, photometric],
    [273, 4, 0],
    [277, 3, samplesPerPixel],
    [278, 4, height],
    [279, 4, 0],
    [284, 3, 1],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  const encoded = compression === 1 ? [...pixels] : [pixels.length - 1, ...pixels];
  const bytes = [
    ...(endian === 'little' ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...bytes16(42, endian),
    ...bytes32(8, endian),
    ...bytes16(entries.length, endian),
  ];
  for (const [tag, type, value] of entries) {
    bytes.push(...bytes16(tag, endian), ...bytes16(type, endian), ...bytes32(1, endian));
    const actual = tag === 273 ? dataOffset : tag === 279 ? encoded.length : value;
    if (type === 3) bytes.push(...bytes16(actual, endian), 0, 0);
    else bytes.push(...bytes32(actual, endian));
  }
  bytes.push(...bytes32(0, endian), ...encoded);
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

test('rejects malformed, unsupported and oversized TIFF input', () => {
  assert.throws(() => decodeTiffComposite(Uint8Array.from([0x49, 0x49])), /truncated/);
  assert.throws(() => decodeTiffComposite(fixture({ compression: 5, pixels: [1, 2, 3, 4, 5, 6] })), /compression/);
  assert.throws(() => decodeTiffComposite(fixture({ width: 16000, height: 16000, pixels: [1, 2, 3] })), /16 megapixels/);
});
