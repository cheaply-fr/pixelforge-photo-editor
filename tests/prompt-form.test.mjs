import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MAX_PUPPET_PROMPT_PINS,
  initialPromptValues,
  parsePromptNumber,
  parsePromptValues,
  parsePuppetPinText,
  parseQuadPoints,
  promptNumberError,
  promptOptions,
  sentenceCase,
  validatePromptField,
  validatePromptForm,
} from '../src/promptForm.ts';

const percent = { id: 'opacity', label: 'Opacity', type: 'number', value: 50, min: 0, max: 100 };

test('numbers accept a sign and a decimal point or comma', () => {
  assert.equal(parsePromptNumber('24'), 24);
  assert.equal(parsePromptNumber(' -12 '), -12);
  assert.equal(parsePromptNumber('+7'), 7);
  assert.equal(parsePromptNumber('1.5'), 1.5);
  assert.equal(parsePromptNumber('1,5'), 1.5);
  assert.equal(parsePromptNumber('.5'), 0.5);
  assert.equal(parsePromptNumber('5.'), 5);
});

test('numbers reject empty, exponent, hex, infinity and junk input', () => {
  for (const text of ['', '   ', '-', '.', '1e3', '0x10', 'Infinity', 'NaN', '12px', '1.2.3', '1,2,3', '--1', 'abc'])
    assert.ok(Number.isNaN(parsePromptNumber(text)), text);
});

test('number fields enforce min, max and whole numbers inclusively', () => {
  assert.equal(validatePromptField(percent, '0'), null);
  assert.equal(validatePromptField(percent, '100'), null);
  assert.equal(validatePromptField(percent, '42.5'), null);
  assert.equal(validatePromptField(percent, '-0.1'), 'Enter a number from 0 to 100.');
  assert.equal(validatePromptField(percent, '100.01'), 'Enter a number from 0 to 100.');
  assert.equal(validatePromptField(percent, ''), 'Enter a number from 0 to 100.');
  assert.equal(validatePromptField(percent, 'fifty'), 'Enter a number from 0 to 100.');
  const whole = { ...percent, integer: true };
  assert.equal(validatePromptField(whole, '3'), null);
  assert.equal(validatePromptField(whole, '3.5'), 'Enter a whole number from 0 to 100.');
  const signed = { id: 'bend', label: 'Bend', type: 'number', value: 0, min: -100, max: 100 };
  assert.equal(validatePromptField(signed, '-100'), null);
  assert.equal(validatePromptField(signed, '-101'), 'Enter a number from -100 to 100.');
});

test('number error messages describe one-sided and open ranges', () => {
  assert.equal(promptNumberError({ min: 1 }), 'Enter a number of at least 1.');
  assert.equal(promptNumberError({ max: 8, integer: true }), 'Enter a whole number of at most 8.');
  assert.equal(promptNumberError({}), 'Enter a number.');
  const open = { id: 'n', label: 'N', type: 'number', value: 0 };
  assert.equal(validatePromptField(open, '-99999'), null);
  assert.equal(validatePromptField(open, 'x'), 'Enter a number.');
});

test('required text rejects whitespace; maxLength and custom validators apply', () => {
  const name = { id: 'name', label: 'Preset name', type: 'text', value: '', required: true, maxLength: 5 };
  assert.equal(validatePromptField(name, '   '), 'Preset name cannot be empty.');
  assert.equal(validatePromptField(name, 'Ink'), null);
  assert.equal(validatePromptField(name, 'Studio'), 'Use 5 characters or fewer.');
  const optional = { id: 'layer', label: 'Layer name', type: 'text', value: '' };
  assert.equal(validatePromptField(optional, ''), null);
  const custom = { id: 'q', label: 'Quad', type: 'text', value: '', validate: (text) => (text === 'ok' ? null : 'Bad quad') };
  assert.equal(validatePromptField(custom, 'ok'), null);
  assert.equal(validatePromptField(custom, 'no'), 'Bad quad');
});

test('selects only accept listed options; checkboxes are always valid', () => {
  const style = { id: 'style', label: 'Warp style', type: 'select', value: 'arc', options: promptOptions(['none', 'arc']) };
  assert.equal(validatePromptField(style, 'arc'), null);
  assert.equal(validatePromptField(style, 'twist'), 'Choose one of the listed options.');
  assert.equal(validatePromptField({ id: 'r', label: 'Reverse', type: 'checkbox', value: false }, true), null);
});

test('initial values stringify numbers, keep booleans and fall back to the first option', () => {
  const fields = [
    { id: 'name', label: 'Name', type: 'text', value: 'Custom brush' },
    { id: 'bend', label: 'Bend', type: 'number', value: -25 },
    { id: 'mode', label: 'Mode', type: 'select', value: 'missing', options: promptOptions(['white', 'black']) },
    { id: 'kind', label: 'Kind', type: 'select', value: 'black', options: promptOptions(['white', 'black']) },
    { id: 'reverse', label: 'Reverse', type: 'checkbox', value: true },
  ];
  assert.deepEqual(initialPromptValues(fields), { name: 'Custom brush', bend: '-25', mode: 'white', kind: 'black', reverse: true });
});

test('form parsing returns typed values only when every field is valid', () => {
  const fields = [
    { id: 'style', label: 'Warp style', type: 'select', value: 'none', options: promptOptions(['none', 'arc']) },
    { id: 'bend', label: 'Bend', type: 'number', value: 0, min: -100, max: 100 },
    { id: 'vertical', label: 'Vertical', type: 'number', value: 0, min: -100, max: 100 },
    { id: 'reverse', label: 'Reverse', type: 'checkbox', value: false },
  ];
  const good = { style: 'arc', bend: '65', vertical: '-20,5', reverse: true };
  assert.deepEqual(validatePromptForm(fields, good), {});
  assert.deepEqual(parsePromptValues(fields, good), { style: 'arc', bend: 65, vertical: -20.5, reverse: true });
  const bad = { ...good, bend: '150', style: 'twist' };
  assert.deepEqual(Object.keys(validatePromptForm(fields, bad)).sort(), ['bend', 'style']);
  assert.equal(parsePromptValues(fields, bad), null);
  // Defaults for every converted command parse back to themselves.
  assert.deepEqual(parsePromptValues(fields, initialPromptValues(fields)), { style: 'none', bend: 0, vertical: 0, reverse: false });
});

test('option labels are sentence case', () => {
  assert.equal(sentenceCase('soft-light'), 'Soft light');
  assert.equal(sentenceCase('ellipse'), 'Ellipse');
  assert.equal(sentenceCase(''), '');
  assert.deepEqual(promptOptions(['white', 'black']), [{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }]);
  assert.deepEqual(promptOptions(['a'], (value) => value.toUpperCase()), [{ value: 'a', label: 'A' }]);
});

test('quad parsing needs exactly four finite x,y pairs', () => {
  assert.deepEqual(parseQuadPoints('1,1;10,0;11,7;0,6'), [{ x: 1, y: 1 }, { x: 10, y: 0 }, { x: 11, y: 7 }, { x: 0, y: 6 }]);
  assert.deepEqual(parseQuadPoints(' 1 , 2 ; 3,4;5,6 ; -7,8.5 ')?.[3], { x: -7, y: 8.5 });
  for (const text of ['1,1;2,2;3,3', '1,1;2,2;3,3;4,4;5,5', '1,1;2,2;3,3;4', '1,1;2,2;3,3;4,x', '1,1;2,2;3,3;4,', '1,1,1;2,2;3,3;4,4', ''])
    assert.equal(parseQuadPoints(text), null, text);
});

test('puppet pin parsing accepts one to eight finite x,y,dx,dy groups', () => {
  assert.deepEqual(parsePuppetPinText('6,4,2,0'), { pins: [{ x: 6, y: 4, dx: 2, dy: 0 }] });
  assert.deepEqual(parsePuppetPinText('800,420,140,-60; 1,2,3,4').pins?.length, 2);
  const eight = Array.from({ length: MAX_PUPPET_PROMPT_PINS }, (_, index) => `${index},0,1,1`).join(';');
  assert.equal(parsePuppetPinText(eight).pins.length, 8);
  assert.deepEqual(parsePuppetPinText(`${eight};9,0,1,1`), { error: 'Puppet Warp accepts one to eight pins' });
  for (const text of ['', '1,2,3', '1,2,3,x', '1,2,3,', '1,2,3,4,5', '1,2,3,4;'])
    assert.deepEqual(parsePuppetPinText(text), { error: 'Puppet Warp needs x,y,dx,dy values for each pin' }, text);
});

test('the editor and Layers panel no longer call window.prompt', async () => {
  for (const file of ['../app/page.tsx', '../src/LayersPanel.tsx']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /\bwindow\.prompt\s*\(/, file);
    assert.doesNotMatch(code, /(?<![.\w])prompt\s*\(/, file);
  }
});
