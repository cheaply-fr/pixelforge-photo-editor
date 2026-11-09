import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const block = (() => {
  const start = css.indexOf('/* Tool options rows:');
  assert.ok(start >= 0, 'tool options style block exists');
  return css.slice(start);
})();
/** Declarations of the first rule whose selector list is exactly `selector`. */
const rule = (selector) => {
  const start = block.indexOf(`\n${selector}{`);
  assert.ok(start >= 0, `rule ${selector}`);
  const open = start + selector.length + 2;
  return block.slice(open, block.indexOf('}', open));
};

test('tool option rows lay out a label and a control side by side', () => {
  const row = rule('.select-row');
  assert.match(row, /display:flex/);
  assert.match(row, /justify-content:space-between/);
  assert.match(row, /min-width:0/);
});

test('bare tool option dropdowns and number fields get the Text panel look', () => {
  const control = rule('.select-row>select:not(.text-input),.select-row>input[type=number]:not(.text-input)');
  for (const declaration of ['height:28px', 'border:1px solid #34363e', 'border-radius:6px', 'background:#202228', 'font-size:10px', 'min-width:0']) {
    assert.ok(control.includes(declaration), declaration);
  }
});

test('controls that already carry .text-input keep their own styling', () => {
  const selectors = block.match(/[^{}]+\{/g).filter((selector) => /\.select-row>(select|input)/.test(selector));
  assert.ok(selectors.length >= 3);
  for (const selector of selectors) {
    for (const part of selector.replace(/\{$/, '').replace(/^@media[^{]*\{/, '').split(',')) {
      if (/\.select-row>(select|input)/.test(part)) assert.match(part, /:not\(\.text-input\)/, part);
    }
  }
});

test('tool option buttons are bordered, hover-highlighted and dim when disabled', () => {
  const button = rule('.select-row>button,.brush-preset-actions button,.panel-body>button.secondary');
  for (const declaration of ['min-height:28px', 'border:1px solid #34363e', 'border-radius:6px', 'background:#202228', 'font-size:10px']) {
    assert.ok(button.includes(declaration), declaration);
  }
  assert.match(block, /:hover:not\(:disabled\)\{border-color:#564037;color:#ff967b\}/);
  assert.match(block, /:disabled\{opacity:\.45;cursor:not-allowed\}/);
  assert.match(rule('.panel-body>button.secondary'), /width:100%/);
});

test('touch layouts get 36px targets', () => {
  assert.match(block, /@media\(max-width:680px\)\{[^@]*height:36px[^@]*min-height:36px/);
});
