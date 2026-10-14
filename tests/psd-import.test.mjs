import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePsdComposite } from '../src/psd.ts';

function u16(value) {
  return [(value >>> 8) & 0xff, value & 0xff];
}
function u32(value) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function packBitsRow(row) {
  const out = [];
  for (let offset = 0; offset < row.length; offset += 127) {
    const chunk = row.slice(offset, offset + 127);
    out.push(chunk.length - 1, ...chunk);
  }
  return out;
}

function fixture({
  width = 2,
  height = 1,
  planes,
  compression = 0,
  colorMode = 3,
  version = 1,
}) {
  const channels = planes.length;
  const bytes = [
    0x38,
    0x42,
    0x50,
    0x53,
    ...u16(version),
    0,
    0,
    0,
    0,
    0,
    0,
    ...u16(channels),
    ...u32(height),
    ...u32(width),
    ...u16(8),
    ...u16(colorMode),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u16(compression),
  ];
  if (compression === 0) {
    for (const plane of planes) bytes.push(...plane);
  } else {
    const rowLengths = [];
    const encodedRows = [];
    for (const plane of planes) {
      for (let row = 0; row < height; row += 1) {
        const encoded = packBitsRow(
          plane.slice(row * width, (row + 1) * width),
        );
        rowLengths.push(...u16(encoded.length));
        encodedRows.push(...encoded);
      }
    }
    bytes.push(...rowLengths, ...encodedRows);
  }
  return Uint8Array.from(bytes);
}

test('decodes a raw RGB PSD composite and preserves alpha', () => {
  const decoded = decodePsdComposite(
    fixture({
      planes: [
        [255, 4],
        [8, 128],
        [16, 64],
        [255, 0],
      ],
    }),
  );
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 1);
  assert.equal(decoded.compression, 'raw');
  assert.deepEqual([...decoded.pixels], [255, 8, 16, 255, 4, 128, 64, 0]);
});

test('decodes PackBits RGB and grayscale PSD composites', () => {
  const rgb = decodePsdComposite(
    fixture({
      width: 2,
      height: 2,
      compression: 1,
      planes: [
        [255, 0, 12, 24],
        [0, 255, 34, 44],
        [0, 0, 56, 64],
      ],
    }),
  );
  assert.equal(rgb.compression, 'rle');
  assert.deepEqual(
    rgb.pixels.slice(0, 16),
    Uint8ClampedArray.from([
      255, 0, 0, 255, 0, 255, 0, 255, 12, 34, 56, 255, 24, 44, 64, 255,
    ]),
  );
  const gray = decodePsdComposite(
    fixture({
      colorMode: 1,
      planes: [
        [33, 200],
        [64, 128],
      ],
    }),
  );
  assert.deepEqual([...gray.pixels], [33, 33, 33, 64, 200, 200, 200, 128]);
});

test('rejects malformed, unsupported and over-sized PSD input', () => {
  assert.throws(
    () => decodePsdComposite(Uint8Array.from([0x38, 0x42])),
    /truncated/,
  );
  assert.throws(
    () =>
      decodePsdComposite(
        Uint8Array.from([0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0]),
      ),
    /truncated/,
  );
  assert.throws(
    () =>
      decodePsdComposite(
        fixture({
          planes: [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
          version: 2,
          compression: 2,
        }),
      ),
    /compression/,
  );
  assert.throws(
    () =>
      decodePsdComposite(
        fixture({ width: 16000, height: 16000, planes: [[1], [2], [3]] }),
      ),
    /16 megapixels/,
  );
});
