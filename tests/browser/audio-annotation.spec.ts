import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/audio-annotation-contract.md. Audio is generated in the test
// (a short PCM WAV) or by Chromium's fake microphone; no media is committed.

/** Mono 16-bit PCM WAV of `seconds` of a sine tone. */
function wav(seconds = 1, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + samples * 2, 4);
  bytes.write('WAVEfmt ', 8, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1)
    bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), 44 + i * 2);
  return bytes;
}

type Project = {
  history: Array<{ measurements?: Array<{ kind: string; id: string; clip?: string; label?: string; x: number; y: number }> }>;
  index: number;
  audio?: Record<string, { mime: string; bytes: number; durationMs: number; url: string }>;
};

const open = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
};

const exportPngBytes = async (page: Page) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('png');
  await expect(page.getByLabel('Encoded file size')).toHaveAttribute('data-bytes', /\d+/, { timeout: 15_000 });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return bytes;
};

const placeAt = async (page: Page, fx: number, fy: number) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  const panel = page.getByTestId('audio-note-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('audio-annotation-pending')).toBeVisible();
  return panel;
};

const attach = async (page: Page, name = 'memo.wav', buffer = wav(1)) => {
  await page.getByTestId('audio-note-file').setInputFiles({ name, mimeType: 'audio/wav', buffer });
};

const player = (page: Page) => page.getByTestId('audio-annotation-player');
const markers = (page: Page) => page.getByTestId('audio-annotation-marker');

test.beforeEach(async ({ page }) => open(page));

test('attach a WAV: marker, playback, draft reload, project file and export exclusion', async ({ page }) => {
  const before = await exportPngBytes(page);
  await selectTool(page, 'Audio Annotation');
  const panel = await placeAt(page, 0.3, 0.4);
  await expect(panel.getByRole('button', { name: 'Record' })).toBeFocused();
  await attach(page, 'client memo.wav');
  await expect(panel).toBeHidden();
  await expect(page.getByText('client memo.wav added to the draft')).toBeVisible();
  await expect(markers(page)).toHaveCount(1);
  const marker = markers(page).first();
  await expect(marker).toHaveAccessibleName(/client memo\.wav, 0:01\. Play\./);

  // Click plays through a real audio element; click again pauses.
  await marker.click();
  await expect(marker).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => player(page).evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(0.9);
  await expect.poll(() => player(page).evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  await marker.click();
  await expect(marker).toHaveAttribute('data-playing', 'false');
  expect(await player(page).evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);

  // The Tool options section lists it with keyboard-operable controls.
  const options = page.getByTestId('audio-note-options');
  await expect(options.getByRole('list', { name: 'Audio annotations' }).getByRole('listitem')).toHaveCount(1);
  await expect(options).toContainText('1/32 clips');

  // Never in exported pixels.
  expect(Buffer.compare(await exportPngBytes(page), before)).toBe(0);

  // Project file carries the clip and marker.
  const saved1 = await project(page);
  const items = saved1.history[saved1.index].measurements!.filter((item) => item.kind === 'audio');
  expect(items).toHaveLength(1);
  expect(items[0].label).toBe('client memo.wav');
  expect(saved1.audio![items[0].clip!]).toMatchObject({ mime: 'audio/wav', bytes: wav(1).byteLength, durationMs: 1000 });

  // Local draft survives reload, still playable.
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(markers(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Audio Annotation tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await markers(page).first().click();
  await expect.poll(() => player(page).evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(0.9);
  await expect(markers(page).first()).toHaveAttribute('data-playing', 'true');
});

test('undo/redo add, drag to move, keyboard nudge and delete', async ({ page }) => {
  await selectTool(page, 'Audio Annotation');
  await placeAt(page, 0.5, 0.5);
  await attach(page);
  await expect(markers(page)).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(markers(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(markers(page)).toHaveCount(1);

  const marker = markers(page).first();
  const x0 = Number(await marker.getAttribute('data-x'));
  const box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await marker.getAttribute('data-x'))).toBeGreaterThan(x0 + 20);
  // A drag moves without toggling playback.
  await expect(marker).toHaveAttribute('data-playing', 'false');
  const moved = Number(await marker.getAttribute('data-x'));
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async () => Number(await markers(page).first().getAttribute('data-x'))).toBe(x0);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect.poll(async () => Number(await markers(page).first().getAttribute('data-x'))).toBe(moved);

  await markers(page).first().focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => Number(await markers(page).first().getAttribute('data-x'))).toBe(moved + 10);

  await markers(page).first().press('Delete');
  await expect(markers(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(markers(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete memo.wav', exact: true }).click();
  await expect(markers(page)).toHaveCount(0);
});

test('limits, cancel and markers stay inert under other tools', async ({ page }) => {
  await selectTool(page, 'Audio Annotation');
  const panel = await placeAt(page, 0.2, 0.2);
  // Over 5 MB is refused before decoding; nothing is added.
  await attach(page, 'long.wav', wav(330, 8000));
  await expect(panel.getByRole('alert')).toContainText('limited to 5 MB');
  // Not audio at all.
  await page.getByTestId('audio-note-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(panel.getByRole('alert')).toContainText('Unsupported audio type');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('audio-annotation-pending')).toHaveCount(0);
  await expect(markers(page)).toHaveCount(0);

  await placeAt(page, 0.6, 0.3);
  await attach(page);
  await expect(markers(page)).toHaveCount(1);
  await selectTool(page, 'Brush');
  await expect(markers(page).first()).toHaveCSS('pointer-events', 'none');
  await expect(markers(page).first()).toHaveAttribute('tabindex', '-1');
});

test('denied microphone permission explains the attach fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Audio Annotation');
  const panel = await placeAt(page, 0.4, 0.4);
  await panel.getByRole('button', { name: 'Record' }).click();
  await expect(panel.getByRole('alert')).toContainText('Microphone permission was denied. Attach an audio file instead.');
  await attach(page);
  await expect(markers(page)).toHaveCount(1);
});

test('I-key cycling reaches Audio Annotation after Note and back', async ({ page }) => {
  await selectTool(page, 'Note');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('i');
  const audio = page.getByRole('button', { name: 'Audio Annotation tool', exact: true });
  await expect(audio).toHaveAttribute('aria-pressed', 'true');
  await expect(audio).toHaveAttribute('title', /Audio Annotation/);
  await page.keyboard.press('Shift+I');
  await expect(page.getByRole('button', { name: 'Note tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
