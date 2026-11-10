import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DOCUMENT_PIXELS,
  MAX_DOCUMENT_SIDE,
  NEW_DOCUMENT_BACKGROUNDS,
  NEW_DOCUMENT_PRESETS,
  backgroundFill,
  megapixels,
  newDocumentProblem,
  parseDimension,
  presetFor,
} from '../src/newDocument.ts';

test('dimension fields accept whole numbers only', () => {
  assert.equal(parseDimension('2646'), 2646);
  assert.equal(parseDimension(' 800 '), 800);
  for (const bad of ['', '12.5', '1e4', '-5', '0x10', '100px', '123456'])
    assert.equal(parseDimension(bad), undefined, JSON.stringify(bad));
});

test('documents follow the Canvas Size limits', () => {
  assert.equal(newDocumentProblem(2646, 4096), null);
  assert.equal(newDocumentProblem(1, 1), null);
  assert.equal(newDocumentProblem(4000, 4000), null);
  assert.equal(newDocumentProblem(0, 10), 'width');
  assert.equal(newDocumentProblem(undefined, 10), 'width');
  assert.equal(newDocumentProblem(10, MAX_DOCUMENT_SIDE + 1), 'height');
  assert.equal(newDocumentProblem(12.5, 10), 'width');
  // 16,000 × 1,001 is under the side limit but over 16 MP.
  assert.equal(newDocumentProblem(16000, 1001), 'pixels');
  assert.ok(16000 * 1000 <= MAX_DOCUMENT_PIXELS);
  assert.equal(newDocumentProblem(16000, 1000), null);
  assert.equal(newDocumentProblem(100, 100, '   '), 'name');
  assert.equal(newDocumentProblem(100, 100, 'x'.repeat(161)), 'name');
});

test('every preset is a valid, unique document', () => {
  const ids = new Set();
  for (const preset of NEW_DOCUMENT_PRESETS) {
    assert.equal(newDocumentProblem(preset.width, preset.height), null, preset.id);
    assert.ok(!ids.has(preset.id));
    ids.add(preset.id);
    assert.equal(presetFor(preset.width, preset.height), preset);
  }
  assert.equal(presetFor(1201, 800), undefined);
  // The high-density poster size used for the reference artwork is offered.
  assert.equal(presetFor(2646, 4096)?.id, 'poster-2-3');
});

test('background contents map to fills', () => {
  assert.deepEqual(NEW_DOCUMENT_BACKGROUNDS.map(([value]) => value), ['white', 'black', 'background-color', 'transparent']);
  assert.equal(backgroundFill('white', '#123456'), '#ffffff');
  assert.equal(backgroundFill('black', '#123456'), '#000000');
  assert.equal(backgroundFill('background-color', '#123456'), '#123456');
  assert.equal(backgroundFill('background-color', 'not a colour'), '#ffffff');
  assert.equal(backgroundFill('transparent', '#123456'), undefined);
});

test('size summary is in megapixels', () => {
  assert.equal(megapixels(2646, 4096), '10.8 MP');
  assert.equal(megapixels(1200, 800), '1.0 MP');
});
