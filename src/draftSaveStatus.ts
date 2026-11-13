/**
 * Wording and status helpers for the doc bar's explicit local save actions.
 *
 * Drafts autosave to this browser's IndexedDB on every change. "Save draft"
 * flushes that same local save on demand and reports when it finished; it
 * never downloads a file and never uploads to the cloud. "Duplicate draft"
 * forks the open document into a new local bookmark, keeping the original.
 */

export const SAVED_ON_DEVICE = 'Saved on this device';

export const SAVE_DRAFT_LABEL = 'Save draft';
export const SAVE_DRAFT_DESCRIPTION =
  'Saves this draft in this browser now. Nothing is downloaded or uploaded. Changes also autosave.';

export const DUPLICATE_DRAFT_LABEL = 'Duplicate draft';
export const DUPLICATE_DRAFT_DESCRIPTION =
  'Keeps the original draft unchanged and continues on a new copy saved in this browser.';
export const DUPLICATE_DRAFT_NOTICE =
  'Draft duplicated. You are now editing the copy; the original draft is kept on this device.';

const pad = (value: number) => String(value).padStart(2, '0');

/** "Saved on this device · HH:MM" in local 24-hour time. */
export function savedOnDeviceStatus(at: Date): string {
  return `${SAVED_ON_DEVICE} · ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** True for both the plain autosave status and the timestamped manual one. */
export function isSavedOnDeviceStatus(status: string): boolean {
  return (
    status === SAVED_ON_DEVICE ||
    /^Saved on this device · \d{2}:\d{2}$/.test(status)
  );
}

/**
 * Notice shown after an explicit Save draft finished. `status` is the save
 * status the local save settled on (success, conflict, quota or failure).
 */
export function manualSaveNotice(status: string): string {
  if (isSavedOnDeviceStatus(status)) {
    const time = status.slice(SAVED_ON_DEVICE.length + 3);
    return time
      ? `Draft saved on this device at ${time}.`
      : 'Draft saved on this device.';
  }
  return `Draft not saved: ${status}`;
}
