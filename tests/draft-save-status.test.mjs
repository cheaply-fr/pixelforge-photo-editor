import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUPLICATE_DRAFT_DESCRIPTION,
  DUPLICATE_DRAFT_LABEL,
  DUPLICATE_DRAFT_NOTICE,
  isSavedOnDeviceStatus,
  manualSaveNotice,
  SAVE_DRAFT_DESCRIPTION,
  SAVE_DRAFT_LABEL,
  SAVED_ON_DEVICE,
  savedOnDeviceStatus,
} from '../src/draftSaveStatus.ts';
import { LOCAL_CONFLICT, LOCAL_STORAGE_FULL } from '../src/drafts.ts';

test('saved status carries a zero-padded local 24-hour time', () => {
  assert.equal(
    savedOnDeviceStatus(new Date(2026, 10, 13, 9, 5)),
    'Saved on this device · 09:05',
  );
  assert.equal(
    savedOnDeviceStatus(new Date(2026, 10, 13, 23, 59)),
    'Saved on this device · 23:59',
  );
  assert.equal(
    savedOnDeviceStatus(new Date(2026, 10, 13, 0, 0)),
    'Saved on this device · 00:00',
  );
});

test('both autosave and timestamped statuses count as saved', () => {
  assert.equal(isSavedOnDeviceStatus(SAVED_ON_DEVICE), true);
  assert.equal(isSavedOnDeviceStatus(savedOnDeviceStatus(new Date())), true);
  assert.equal(isSavedOnDeviceStatus('Saving on this device…'), false);
  assert.equal(isSavedOnDeviceStatus(LOCAL_CONFLICT), false);
  assert.equal(isSavedOnDeviceStatus('Saved on this device · 9:5'), false);
  assert.equal(isSavedOnDeviceStatus('Saved on this device · 12:00 extra'), false);
});

test('manual save notice reports the time or the failure reason', () => {
  assert.equal(
    manualSaveNotice('Saved on this device · 14:32'),
    'Draft saved on this device at 14:32.',
  );
  assert.equal(manualSaveNotice(SAVED_ON_DEVICE), 'Draft saved on this device.');
  assert.equal(manualSaveNotice(LOCAL_CONFLICT), `Draft not saved: ${LOCAL_CONFLICT}`);
  assert.equal(
    manualSaveNotice(LOCAL_STORAGE_FULL),
    `Draft not saved: ${LOCAL_STORAGE_FULL}`,
  );
});

test('labels say what the actions do and never promise a download or upload', () => {
  assert.equal(SAVE_DRAFT_LABEL, 'Save draft');
  assert.equal(DUPLICATE_DRAFT_LABEL, 'Duplicate draft');
  assert.match(SAVE_DRAFT_DESCRIPTION, /this browser/);
  assert.match(SAVE_DRAFT_DESCRIPTION, /Nothing is downloaded or uploaded/);
  assert.match(DUPLICATE_DRAFT_DESCRIPTION, /original draft unchanged/);
  assert.match(DUPLICATE_DRAFT_DESCRIPTION, /copy/);
  assert.match(DUPLICATE_DRAFT_NOTICE, /original draft is kept/);
  for (const text of [SAVE_DRAFT_LABEL, DUPLICATE_DRAFT_LABEL]) {
    assert.doesNotMatch(text, /local copy|download|export/i);
  }
});

test('the conflict message points at the renamed Duplicate draft action', () => {
  assert.match(LOCAL_CONFLICT, /Duplicate the draft/);
  assert.doesNotMatch(LOCAL_CONFLICT, /Save a local copy/);
});

test('save texts split around "on this device" for narrow screens', async () => {
  const { compactSaveText } = await import('../src/draftSaveStatus.ts');
  assert.deepEqual(compactSaveText('Saved on this device · 09:41'), ['Saved', ' on this device', ' · 09:41']);
  assert.deepEqual(compactSaveText('Draft saved on this device at 09:41.'), ['Draft saved', ' on this device', ' at 09:41.']);
  // The plain autosave status reads "Saved" on phones too.
  assert.deepEqual(compactSaveText('Saved on this device'), ['Saved', ' on this device', '']);
  for (const text of ['Saved on this device', 'Saved on this device · 09:41', 'Draft saved on this device at 09:41.'])
    assert.equal(compactSaveText(text).join(''), text);
  // Only the exact statuses: other texts that mention the device stay whole.
  assert.equal(compactSaveText('Saved on this device · late'), undefined);
  assert.equal(compactSaveText(DUPLICATE_DRAFT_NOTICE), undefined);
  assert.equal(compactSaveText('Draft not saved: quota'), undefined);
});
