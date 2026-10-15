import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_PREFERENCES_VERSION,
  normalizeMenuPreferences,
} from '../src/menuPreferences.ts';

test('menu preferences default to showing the capability map', () => {
  assert.deepEqual(normalizeMenuPreferences(undefined), {
    version: MENU_PREFERENCES_VERSION,
    showDisabled: true,
  });
  assert.deepEqual(
    normalizeMenuPreferences({ version: MENU_PREFERENCES_VERSION }),
    {
      version: MENU_PREFERENCES_VERSION,
      showDisabled: true,
    },
  );
});

test('menu preferences accept only the bounded hide-disabled switch', () => {
  assert.deepEqual(
    normalizeMenuPreferences({
      version: MENU_PREFERENCES_VERSION,
      showDisabled: false,
      extra: 'drop',
    }),
    { version: MENU_PREFERENCES_VERSION, showDisabled: false },
  );
  assert.deepEqual(
    normalizeMenuPreferences({
      version: MENU_PREFERENCES_VERSION,
      showDisabled: 'false',
    }),
    { version: MENU_PREFERENCES_VERSION, showDisabled: true },
  );
  assert.deepEqual(
    normalizeMenuPreferences({ version: 99, showDisabled: false }),
    {
      version: MENU_PREFERENCES_VERSION,
      showDisabled: true,
    },
  );
});
