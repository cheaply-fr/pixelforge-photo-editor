import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_TYPE_SIZE_MAX, NEW_TYPE_SIZE_MIN, textSidebarFields } from '../src/textSidebarFields.ts';

const defaults = { fontFamily: 'Raleway', fontSize: 55 };

test('with no type selected the top Font and Size edit the new-type defaults', () => {
  const fields = textSidebarFields('defaults', { fontFamily: 'Georgia', fontSize: 12 }, defaults);
  assert.deepEqual(fields, {
    target: 'defaults',
    fontFamily: 'Raleway',
    fontSize: 55,
    sizeMin: NEW_TYPE_SIZE_MIN,
    sizeMax: NEW_TYPE_SIZE_MAX,
    sizeMixed: false,
  });
});

test('a selected text layer shows and edits its own font and size', () => {
  const fields = textSidebarFields('layer', { fontFamily: 'Pathway Gothic One', fontSize: 55 }, defaults);
  assert.equal(fields.target, 'type');
  assert.equal(fields.fontFamily, 'Pathway Gothic One');
  assert.equal(fields.fontSize, 55);
  assert.equal(fields.sizeMixed, false);
});

test('an open type edit follows the selected characters', () => {
  const fields = textSidebarFields('session', { fontFamily: 'Lobster', fontSize: 23.6 }, defaults);
  assert.equal(fields.target, 'type');
  assert.equal(fields.fontFamily, 'Lobster');
  assert.equal(fields.fontSize, 24);
});

test('mixed fonts show no family; mixed sizes fall back to the default and say so', () => {
  const fields = textSidebarFields('session', { fontFamily: 'mixed', fontSize: 'mixed' }, defaults);
  assert.equal(fields.fontFamily, '');
  assert.equal(fields.fontSize, 55);
  assert.equal(fields.sizeMixed, true);
});

test('the Size range widens to fit layers outside the new-type range', () => {
  const big = textSidebarFields('layer', { fontFamily: 'Arial', fontSize: 400 }, defaults);
  assert.equal(big.sizeMin, 1);
  assert.equal(big.sizeMax, 400);
  const small = textSidebarFields('layer', { fontFamily: 'Arial', fontSize: 8 }, defaults);
  assert.equal(small.fontSize, 8);
  assert.equal(small.sizeMin, 1);
  assert.equal(small.sizeMax, NEW_TYPE_SIZE_MAX);
});
