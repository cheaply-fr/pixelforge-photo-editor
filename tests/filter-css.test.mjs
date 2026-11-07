import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCSS, neutral } from '../src/document.ts';

test('neutral adjustments skip the canvas filter pipeline entirely', () => {
  assert.equal(filterCSS(neutral), 'none');
  assert.equal(filterCSS({ ...neutral, filter: 'none' }), 'none');
});

test('only non-neutral basic adjustments are emitted, in the original order', () => {
  assert.equal(filterCSS({ ...neutral, brightness: 120 }), 'brightness(120%)');
  assert.equal(filterCSS({ ...neutral, blur: 3 }), 'blur(3px)');
  assert.equal(
    filterCSS({
      ...neutral,
      filter: 'grayscale(1)',
      brightness: 90,
      contrast: 110,
      saturation: 50,
      blur: 2,
    }),
    'grayscale(1) brightness(90%) contrast(110%) saturate(50%) blur(2px)',
  );
  assert.equal(filterCSS({ ...neutral, filter: 'sepia(1)' }), 'sepia(1)');
  assert.equal(filterCSS({ ...neutral, contrast: 0, saturation: 0 }), 'contrast(0%) saturate(0%)');
});
