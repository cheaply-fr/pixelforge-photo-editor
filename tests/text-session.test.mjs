import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCharacterStyle,
  applyLayerPatch,
  applyStyleToLayer,
  applyTextInput,
  beginTextSession,
  convertToParagraphText,
  convertToPointText,
  insertText,
  redoTextSession,
  sessionCharacterState,
  steppedFontSize,
  textSessionChanged,
  toggledStyle,
  undoTextSession,
  withTextRemapped,
} from '../src/textSession.ts';
import { layoutRichText, MAX_TEXT_LENGTH } from '../src/richText.ts';
import {
  MAX_TYPE_PRESETS,
  parseTypePresets,
  presetFromState,
  serializeTypePresets,
  upsertTypePreset,
  validPresetName,
} from '../src/typePresets.ts';
import { replaceTextLayers } from '../src/textReplace.ts';

const measure = (font, text) => Array.from(text).length * Number(/([\d.]+)px/.exec(font)[1]) * 0.5;
const layer = (patch = {}) => ({
  id: 'layer', kind: 'text', text: 'Hello world', color: '#000000', fontSize: 20, fontFamily: 'Arial', bold: false,
  boxWidth: 400, textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, orientation: 'horizontal', textMode: 'point', ...patch,
});
const begin = (patch, selection) => beginTextSession(layer(patch), { layerId: 'layer', selection });

test('a session starts with a clamped selection and no changes', () => {
  const session = begin({}, { anchor: -4, focus: 99 });
  assert.deepEqual(session.selection, { anchor: 0, focus: 11 });
  assert.equal(textSessionChanged(session), false);
  assert.equal(textSessionChanged({ ...session, isNew: true }), true);
});

test('typing coalesces into one undo step; deleting is a separate step', () => {
  let session = begin({}, { anchor: 11, focus: 11 });
  session = applyTextInput(session, 'Hello world!', { anchor: 12, focus: 12 });
  session = applyTextInput(session, 'Hello world!!', { anchor: 13, focus: 13 });
  assert.equal(session.undo.length, 1);
  session = applyTextInput(session, 'Hello world!', { anchor: 12, focus: 12 });
  assert.equal(session.undo.length, 2);
  session = undoTextSession(session);
  assert.equal(session.layer.text, 'Hello world!!');
  session = undoTextSession(session);
  assert.equal(session.layer.text, 'Hello world');
  assert.equal(undoTextSession(session), session);
  session = redoTextSession(redoTextSession(session));
  assert.equal(session.layer.text, 'Hello world!');
  assert.equal(redoTextSession(session), session);
});

test('input is bounded to the text limit and keeps runs consistent', () => {
  const session = applyTextInput(begin({}, { anchor: 11, focus: 11 }), 'x'.repeat(MAX_TEXT_LENGTH + 50), { anchor: 99999, focus: 99999 });
  assert.equal(session.layer.text.length, MAX_TEXT_LENGTH);
  assert.equal(session.selection.focus, MAX_TEXT_LENGTH);
});

test('styling a selection creates runs; a collapsed caret stores a pending style', () => {
  let session = begin({}, { anchor: 6, focus: 11 });
  session = applyCharacterStyle(session, { fontWeight: 700 });
  assert.deepEqual(session.layer.rich, { version: 1, runs: [{ length: 6 }, { length: 5, style: { fontWeight: 700 } }] });
  // Collapsed caret at the end: Ctrl+I then typing makes italic bold text.
  session = { ...session, selection: { anchor: 11, focus: 11 } };
  session = applyCharacterStyle(session, { italic: true });
  assert.equal(session.layer.rich.runs.length, 2);
  assert.deepEqual(sessionCharacterState(session).italic, true);
  session = applyTextInput(session, 'Hello world!', { anchor: 12, focus: 12 });
  assert.deepEqual(session.layer.rich.runs.at(-1), { length: 1, style: { fontWeight: 700, italic: true } });
  assert.equal(session.pendingStyle, undefined);
  // Clearing every override drops the rich record entirely.
  session = applyCharacterStyle({ ...session, selection: { anchor: 0, focus: 12 } }, { fontWeight: undefined, italic: undefined });
  assert.equal(session.layer.rich, undefined);
});

test('toggle helpers and size stepping follow the selection state', () => {
  let session = begin({}, { anchor: 0, focus: 5 });
  assert.deepEqual(toggledStyle(session, 'bold'), { fontWeight: 700 });
  session = applyCharacterStyle(session, { fontWeight: 700, underline: true });
  assert.deepEqual(toggledStyle(session, 'bold'), { fontWeight: 400 });
  assert.deepEqual(toggledStyle(session, 'underline'), { underline: false });
  assert.deepEqual(toggledStyle({ ...session, selection: { anchor: 0, focus: 11 } }, 'underline'), { underline: true });
  assert.equal(steppedFontSize(20, 1), 22);
  assert.equal(steppedFontSize(20, -1, true), 10);
  assert.equal(steppedFontSize(1, -1), 1);
  assert.equal(steppedFontSize('mixed', 1), 14);
});

test('insertText replaces the selection (paste, glyph picker)', () => {
  const session = insertText(begin({}, { anchor: 6, focus: 11 }), 'there ©');
  assert.equal(session.layer.text, 'Hello there ©');
  assert.deepEqual(session.selection, { anchor: 13, focus: 13 });
});

test('layer patches are undoable and resize steps coalesce', () => {
  let session = begin({ textMode: 'paragraph', boxWidth: 100 });
  session = applyLayerPatch(session, { boxWidth: 120 }, 'resize');
  session = applyLayerPatch(session, { boxWidth: 140 }, 'resize');
  assert.equal(session.undo.length, 1);
  session = applyLayerPatch(session, { textAlign: 'center' });
  assert.equal(session.undo.length, 2);
  session = undoTextSession(undoTextSession(session));
  assert.equal(session.layer.boxWidth, 100);
});

test('whole-layer styling updates base fields and keeps other overrides on runs', () => {
  const styled = applyStyleToLayer(layer({ rich: { version: 1, runs: [{ length: 5, style: { color: '#ff0000' } }, { length: 6 }] } }), {
    color: '#00ff00', fontWeight: 700, italic: true, fontFamily: 'Library Sans',
  }, (family) => family === 'Arial');
  assert.equal(styled.color, '#00ff00');
  assert.equal(styled.bold, true);
  assert.equal(styled.fontFamily, 'Arial');
  assert.deepEqual(styled.rich.runs, [{ length: 11, style: { italic: true, fontFamily: 'Library Sans' } }]);
});

test('plain-text edits outside a session keep styles aligned', () => {
  const source = layer({ rich: { version: 1, runs: [{ length: 6 }, { length: 5, style: { italic: true } }] } });
  const next = withTextRemapped(source, 'Hello brave world', { ...source, text: 'Hello brave world' });
  assert.deepEqual(next.rich.runs, [{ length: 12 }, { length: 5, style: { italic: true } }]);
});

test('convert paragraph ↔ point keeps visible line breaks and styles', () => {
  const paragraph = layer({ text: 'aaaa bbbb cccc', textMode: 'paragraph', boxWidth: 100, boxHeight: 200, fit: 'shrink',
    rich: { version: 1, runs: [{ length: 10 }, { length: 4, style: { italic: true } }] } });
  const point = convertToPointText(paragraph, layoutRichText(paragraph, { measure }));
  assert.equal(point.text, 'aaaa bbbb\ncccc');
  assert.equal(point.textMode, 'point');
  assert.equal(point.boxHeight, undefined);
  assert.equal(point.fit, undefined);
  assert.deepEqual(point.rich.runs, [{ length: 10 }, { length: 4, style: { italic: true } }]);
  const back = convertToParagraphText(point, layoutRichText(point, { measure }));
  assert.equal(back.textMode, 'paragraph');
  assert.ok(back.boxWidth >= 90 && back.boxWidth <= 110);
  assert.ok(back.boxHeight >= 48);
});

test('find & replace keeps run lengths consistent with the new text', () => {
  const frame = { layers: [layer({ text: 'red green green', rich: { version: 1, runs: [{ length: 3, style: { color: '#ff0000' } }, { length: 12 }] } })] };
  const result = replaceTextLayers(frame, { find: 'green', replace: 'blue' });
  assert.equal(result.replacements, 2);
  const replaced = result.frame.layers[0];
  assert.equal(replaced.text, 'red blue blue');
  assert.deepEqual(replaced.rich.runs, [{ length: 3, style: { color: '#ff0000' } }, { length: 10 }]);
  // Replacement text is literal ($& is not a pattern).
  assert.equal(replaceTextLayers(frame, { find: 'red', replace: '$&$&' }).frame.layers[0].text.startsWith('$&$&'), true);
});

test('type presets validate, round-trip and stay bounded', () => {
  const preset = presetFromState('Headline', { fontSize: 48, fontWeight: 700, color: '#112233', italic: 'mixed' }, { list: 'bullet' }, 'center');
  assert.deepEqual(preset.character, { fontSize: 48, fontWeight: 700, color: '#112233' });
  assert.equal(preset.paragraph.list, 'bullet');
  const raw = serializeTypePresets([preset]);
  assert.deepEqual(parseTypePresets(raw), [preset]);
  assert.deepEqual(parseTypePresets('{"version":2,"presets":[]}'), []);
  assert.deepEqual(parseTypePresets('not json'), []);
  assert.deepEqual(parseTypePresets(JSON.stringify({ version: 1, presets: [{ ...preset, character: { fontSize: -1 } }, preset] })), [preset]);
  assert.equal(validPresetName(''), false);
  assert.equal(validPresetName('a\u0007b'), false);
  assert.throws(() => presetFromState('  ', {}, undefined, 'left'));
  let list = [];
  for (let i = 0; i < MAX_TYPE_PRESETS; i++) list = upsertTypePreset(list, { ...preset, name: `P${i}` });
  assert.equal(upsertTypePreset(list, { ...preset, name: 'P3' }).length, MAX_TYPE_PRESETS);
  assert.throws(() => upsertTypePreset(list, { ...preset, name: 'overflow' }));
});
