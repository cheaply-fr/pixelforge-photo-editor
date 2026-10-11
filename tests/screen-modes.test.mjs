import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCREEN_MODES,
  cycleScreenMode,
  isScreenMode,
  normalizeScreenMode,
  screenModeClass,
  screenModeLabel,
} from '../src/screenModes.ts';

test('screen mode vocabulary is ordered like Photoshop F cycling', () => {
  assert.deepEqual([...SCREEN_MODES], ['standard', 'full-menu', 'full']);
  assert.equal(cycleScreenMode('standard'), 'full-menu');
  assert.equal(cycleScreenMode('full-menu'), 'full');
  assert.equal(cycleScreenMode('full'), 'standard');
});

test('screen mode normalization fails closed for malformed storage values', () => {
  for (const value of [undefined, null, '', 'menu', 2, {}, []]) {
    assert.equal(isScreenMode(value), false);
    assert.equal(normalizeScreenMode(value), 'standard');
  }
  for (const value of SCREEN_MODES) {
    assert.equal(isScreenMode(value), true);
    assert.equal(normalizeScreenMode(value), value);
  }
});

test('screen mode labels and CSS classes are stable and accessible', () => {
  assert.equal(screenModeLabel('standard'), 'Standard Screen Mode');
  assert.equal(screenModeLabel('full-menu'), 'Full Screen with Menu');
  assert.equal(screenModeLabel('full'), 'Full Screen');
  assert.equal(screenModeClass('standard'), '');
  assert.equal(screenModeClass('full-menu'), 'screen-mode-full-menu');
  assert.equal(screenModeClass('full'), 'screen-mode-full');
});
