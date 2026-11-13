import test from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_FILL_CONTENTS, editFillColor, normalizeEditFillOptions } from '../src/editFill.ts';

const colors = { foreground: '#FF5C35', background: '#102030', color: '#00ff7f' };

test('fill contents resolve to exact colours', () => {
  assert.deepEqual(EDIT_FILL_CONTENTS.map((item) => item.value), ['foreground', 'background', 'color', 'black', 'white', 'gray', 'pattern']);
  assert.equal(editFillColor('foreground', colors), '#ff5c35');
  assert.equal(editFillColor('background', colors), '#102030');
  assert.equal(editFillColor('color', colors), '#00ff7f');
  assert.equal(editFillColor('black', colors), '#000000');
  assert.equal(editFillColor('white', colors), '#ffffff');
  assert.equal(editFillColor('gray', colors), '#808080');
  // Malformed colours fall back instead of painting arbitrary CSS.
  assert.equal(editFillColor('foreground', { ...colors, foreground: 'red; x' }), '#000000');
  assert.equal(editFillColor('color', { ...colors, color: 'nope' }), '#ff5c35');
});

test('dialog input is validated: opacity range, native blend modes, known contents', () => {
  assert.deepEqual(normalizeEditFillOptions({ contents: 'gray', opacity: '50', mode: 'multiply' }), {
    contents: 'gray', color: '#000000', opacity: 50, mode: 'multiply',
  });
  assert.equal(normalizeEditFillOptions({ contents: 'color', color: '#ABCDEF', opacity: 100, mode: 'source-over' }).color, '#abcdef');
  for (const opacity of ['0', '101', '12.5', '', 'x', -1])
    assert.equal(normalizeEditFillOptions({ contents: 'black', opacity, mode: 'source-over' }), null, `opacity ${opacity}`);
  // Software-only modes are not offered by the Fill dialog.
  assert.equal(normalizeEditFillOptions({ contents: 'black', opacity: 100, mode: 'linear-burn' }), null);
  assert.equal(normalizeEditFillOptions({ contents: 'black', opacity: 100, mode: 'copy' }), null);
  assert.equal(normalizeEditFillOptions({ contents: 'pattern', opacity: 100, mode: 'source-over' }), null);
});
