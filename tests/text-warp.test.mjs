import test from 'node:test';
import assert from 'node:assert/strict';
import { isTextWarp, normalizeTextWarp, textWarpTransform } from '../src/textWarp.ts';

test('text warp validation and normalization stay bounded', () => {
  assert.equal(isTextWarp({ style: 'arc', bend: 40, horizontal: 0, vertical: -10 }), true);
  assert.equal(isTextWarp({ style: 'arc', bend: 140, horizontal: 0, vertical: 0 }), false);
  assert.deepEqual(normalizeTextWarp({ style: 'unknown', bend: 140, vertical: -140 }), {
    style: 'none', bend: 100, horizontal: 0, vertical: -100,
  });
});

test('warp transforms are deterministic and neutral at zero bend', () => {
  assert.deepEqual(textWarpTransform('arc', 0, .25, 48), { x: 0, y: 0, rotation: 0 });
  const first = textWarpTransform('flag', 65, .25, 48);
  assert.deepEqual(first, textWarpTransform('flag', 65, .25, 48));
  assert.notDeepEqual(first, textWarpTransform('flag', -65, .25, 48));
});
