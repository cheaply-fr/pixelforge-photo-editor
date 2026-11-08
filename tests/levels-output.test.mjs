import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLevelsPixels,
  levelsChannel,
  neutral,
  validAdjustments,
} from '../src/document.ts';

const pixel = (data, index) => Array.from(data.slice(index * 4, index * 4 + 4));

test('Levels output range maps the corrected endpoints and preserves identity defaults', () => {
  assert.equal(levelsChannel(0, 0, 255, 1, 32, 224), 32);
  assert.equal(levelsChannel(255, 0, 255, 1, 32, 224), 224);
  assert.equal(levelsChannel(128, 0, 255, 1, 32, 224), 128);
  assert.equal(levelsChannel(64, 0, 255, 2, 32, 224), 128);
  assert.equal(levelsChannel(128, 0, 255, 1), 128);
});

test('Levels output controls are bounded and may be reversed or equal', () => {
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 32, levelsOutputWhite: 224 }), true);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: -1 }), false);
  assert.equal(validAdjustments({ ...neutral, levelsOutputWhite: 256 }), false);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 256 }), false);
  assert.equal(validAdjustments({ ...neutral, levelsOutputWhite: -1 }), false);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: Number.NaN }), false);
  // Reversed (inverting) and equal (flat) output ranges are valid now.
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 224, levelsOutputWhite: 32 }), true);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 255, levelsOutputWhite: 0 }), true);
  assert.equal(validAdjustments({ ...neutral, levelsOutputBlack: 128, levelsOutputWhite: 128 }), true);
  // Input levels keep their ordered contract.
  assert.equal(validAdjustments({ ...neutral, levelsBlack: 200, levelsWhite: 100 }), false);
});

test('Levels remapping is detached, alpha-safe and preserves hidden RGB bytes', () => {
  const source = new Uint8ClampedArray([
    0, 64, 128, 255,
    255, 128, 0, 127,
    9, 19, 29, 0,
  ]);
  const result = applyLevelsPixels(source, {
    levelsBlack: 0,
    levelsWhite: 255,
    levelsGamma: 1,
    levelsOutputBlack: 32,
    levelsOutputWhite: 224,
  });
  assert.notEqual(result, source);
  assert.deepEqual(pixel(result, 0), [32, 80, 128, 255]);
  assert.deepEqual(pixel(result, 1), [224, 128, 32, 127]);
  assert.deepEqual(pixel(result, 2), [9, 19, 29, 0]);
  assert.deepEqual(source, new Uint8ClampedArray([
    0, 64, 128, 255,
    255, 128, 0, 127,
    9, 19, 29, 0,
  ]));
});

test('Levels rejects incomplete pixel buffers before processing', () => {
  assert.throws(() => applyLevelsPixels(new Uint8ClampedArray(3), neutral), /complete RGBA/);
  assert.throws(() => applyLevelsPixels(new Uint8Array(4), neutral), /complete RGBA/);
});
