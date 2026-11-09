import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

// Contract: docs/text-tool-font-contract.md ("One Font control"). Runs in the
// desktop and mobile projects.

type Layer = { id: string; kind: string; fontFamily?: string };
type Project = { history: Array<{ layers: Layer[] }>; index: number; settings: { fontFamily?: string } };

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
const project = async (page: Page): Promise<Project> => {
  await saved(page);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  return (await downloadedProject((await (await pending).path())!)) as Project;
};
const textLayers = (value: Project) => value.history[value.index].layers.filter((layer) => layer.kind === 'text');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('the Text section has one Font control that sets new-type defaults and restyles the selected layer', async ({ page }) => {
  await selectTool(page, 'Horizontal Type');
  await page.getByLabel('Text content', { exact: true }).fill('Audit');
  const font = page.getByLabel('Text tool font', { exact: true });
  await expect(font).toBeVisible();
  await expect(page.getByTestId('font-control-note')).toContainText('sets the font for new type and restyles the selected type layer');
  // The Character panel no longer carries a second font-family picker.
  const character = page.getByTestId('type-panels').locator('details', { has: page.locator('summary', { hasText: 'Character' }) });
  if (!(await character.evaluate((element) => (element as HTMLDetailsElement).open)))
    await character.locator('summary').click();
  await expect(page.getByLabel('Character font style', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Character font family', { exact: true })).toHaveCount(0);

  // Default for new type.
  await font.selectOption('Georgia');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.keyboard.press(`${mod}+Enter`);
  await expect.poll(async () => textLayers(await project(page)).map((layer) => layer.fontFamily)).toEqual(['Georgia']);

  // The same control restyles the selected layer and becomes the new default.
  await expect(font).toHaveValue('Georgia');
  await font.selectOption('Verdana');
  await expect.poll(async () => textLayers(await project(page))[0].fontFamily).toBe('Verdana');
  expect((await project(page)).settings.fontFamily).toBe('Verdana');

  // The Layers panel picker is clearly scoped to the whole layer.
  await expect(page.locator('.layer-field', { hasText: 'Layer font (whole layer)' })).toHaveCount(1);
  await expect(page.getByLabel('Layer font', { exact: true })).toHaveValue('Verdana');
});
