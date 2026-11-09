import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/audio-annotation-contract.md. Chromium's fake capture device
// supplies a synthetic tone; the fake UI flag auto-accepts the permission
// prompt. Launch options are worker-scoped, so this lives in its own file.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
});

type Project = {
  history: Array<{ measurements?: Array<{ kind: string; clip?: string; label?: string }> }>;
  index: number;
  audio?: Record<string, { mime: string; bytes: number; durationMs: number }>;
};

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const markers = (page: Page) => page.getByTestId('audio-annotation-marker');
const player = (page: Page) => page.getByTestId('audio-annotation-player');
const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
};
const placeAt = async (page: Page, fx: number, fy: number) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  const panel = page.getByTestId('audio-note-panel');
  await expect(panel).toBeVisible();
  return panel;
};

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Record then Stop stores a playable clip that survives reload', async ({ page }) => {
  let asked = 0;
  await page.exposeFunction('__audioPermissionAsked', () => {
    asked += 1;
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => {
      (window as unknown as { __audioPermissionAsked: () => void }).__audioPermissionAsked();
      return original(constraints);
    };
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Audio Annotation');
  const panel = await placeAt(page, 0.45, 0.55);
  expect(asked, 'no microphone request before an explicit Record click').toBe(0);
  await panel.getByRole('button', { name: 'Record' }).click();
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(panel.locator('output')).toContainText(/Recording 0:0[2-9]/, { timeout: 5_000 });
  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel).toBeHidden();
  expect(asked).toBe(1);
  await expect(markers(page)).toHaveCount(1);
  const data = await project(page);
  const item = data.history[data.index].measurements!.find((entry) => entry.kind === 'audio')!;
  expect(item.label).toBe('Audio note 1');
  const clip = data.audio![item.clip!];
  expect(['audio/webm', 'audio/ogg', 'audio/mp4']).toContain(clip.mime);
  expect(clip.bytes).toBeGreaterThan(100);
  expect(clip.durationMs).toBeGreaterThanOrEqual(900);

  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await markers(page).first().click();
  await expect(markers(page).first()).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => player(page).evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(0);
});
