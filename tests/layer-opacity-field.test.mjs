import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layerOpacityChange,
  layerOpacityPercent,
  parseLayerOpacityPercent,
} from '../src/layerOpacity.ts';

test('the label and the slider show the same whole percentage of the stored opacity', () => {
  assert.equal(layerOpacityPercent(1), 100);
  assert.equal(layerOpacityPercent(0), 0);
  assert.equal(layerOpacityPercent(0.654), 65);
  assert.equal(layerOpacityPercent(0.655), 66);
  assert.equal(layerOpacityPercent(1.4), 100, 'clamped');
  assert.equal(layerOpacityPercent(-0.2), 0, 'clamped');
  assert.equal(layerOpacityPercent(Number.NaN), 100);
});

test('slider values parse as clamped whole percentages', () => {
  assert.equal(parseLayerOpacityPercent('0'), 0);
  assert.equal(parseLayerOpacityPercent('42'), 42);
  assert.equal(parseLayerOpacityPercent(42.6), 43);
  assert.equal(parseLayerOpacityPercent('150'), 100);
  assert.equal(parseLayerOpacityPercent('-3'), 0);
  for (const raw of ['', '  ', 'abc', null, undefined, {}, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(parseLayerOpacityPercent(raw), undefined, JSON.stringify(raw) ?? typeof raw);
});

test('a changed value is applied once even when a native event and onChange both report it', () => {
  const layer = { id: 'a', opacity: 1 };
  // A script sets the slider to 0: the native listener sees it first.
  assert.equal(layerOpacityChange('0', layer, null), 0);
  const requested = { id: 'a', value: 0 };
  // React's onChange (or the following change event) reports the same value.
  assert.equal(layerOpacityChange('0', layer, requested), undefined);
  // A further move before the layer state catches up is still applied.
  assert.equal(layerOpacityChange('10', layer, requested), 10);
});

test('the current opacity is not re-applied, and another layer ignores a stale request', () => {
  assert.equal(layerOpacityChange('65', { id: 'a', opacity: 0.65 }, null), undefined);
  assert.equal(layerOpacityChange('65', { id: 'b', opacity: 1 }, { id: 'a', value: 65 }), 65);
  assert.equal(layerOpacityChange('not a number', { id: 'a', opacity: 1 }, null), undefined);
});
