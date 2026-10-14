import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTypeStyle, normalizeTypeStyle, typeStyleFromLayer, validTypeStyle } from '../src/typeStyles.ts';

const text = {
  id: 'text', kind: 'text', fontFamily: 'Arial', fontSize: 40, color: '#112233', bold: true,
  boxWidth: 240, textAlign: 'center', lineHeight: 1.4, letterSpacing: 2, orientation: 'vertical',
};

test('captures a complete editable text style without text content', () => {
  const style = typeStyleFromLayer(text);
  assert.deepEqual(style, {
    fontFamily: 'Arial', fontSize: 40, color: '#112233', bold: true, boxWidth: 240,
    textAlign: 'center', lineHeight: 1.4, letterSpacing: 2, orientation: 'vertical',
  });
  assert.equal(validTypeStyle(style), true);
});

test('applies a style immutably and preserves layer identity/content', () => {
  const source = { ...text, text: 'Keep me', name: 'Headline' };
  const style = typeStyleFromLayer(source);
  const changed = applyTypeStyle(source, { ...style, fontSize: 72, color: '#abcdef' });
  assert.equal(changed.text, 'Keep me');
  assert.equal(changed.name, 'Headline');
  assert.equal(changed.fontSize, 72);
  assert.equal(source.fontSize, 40);
});

test('normalizes valid styles and rejects unsafe or non-text values', () => {
  const style = normalizeTypeStyle(typeStyleFromLayer(text));
  assert.deepEqual(style, typeStyleFromLayer(text));
  for (const patch of [
    { fontFamily: 'Unknown' },
    { color: '#12' },
    { fontSize: 0 },
    { boxWidth: Infinity },
    { textAlign: 'justify' },
    { lineHeight: 9 },
    { letterSpacing: -101 },
    { orientation: 'diagonal' },
  ]) {
    assert.equal(validTypeStyle({ ...style, ...patch }), false);
  }
  assert.equal(typeStyleFromLayer({ ...text, kind: 'raster' }), undefined);
  assert.throws(() => applyTypeStyle({ ...text, kind: 'raster' }, style), /text layer/);
});
