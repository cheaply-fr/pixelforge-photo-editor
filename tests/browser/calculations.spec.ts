import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { answerPrompt, cancelPrompt, expectPromptRejects, promptDialog } from './prompt-dialog';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Image > Calculations applies a local blend mode with one undoable commit', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Calculations…', exact: true }).click();
  await answerPrompt(page, 'Calculations', { 'Blend mode': 'screen', Opacity: '60' });
  await expect(page.locator('footer')).toContainText('Calculations applied screen at 60%');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history.length).toBeGreaterThanOrEqual(2);
  expect(project.history.at(-1)?.layers[0]?.kind).toBe('raster');
});

test('Image > Calculations offers only supported modes and blocks invalid opacity without changing history', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Calculations…', exact: true }).click();
  // Unsupported modes cannot be chosen: the mode is a fixed list.
  await expect(promptDialog(page, 'Calculations').getByLabel('Blend mode', { exact: true }).locator('option')).toHaveText(
    ['Multiply', 'Screen', 'Add', 'Subtract', 'Difference', 'Overlay'],
  );
  await expect(promptDialog(page, 'Calculations').getByLabel('Blend mode', { exact: true }).locator('option[value="vivid"]')).toHaveCount(0);
  await expectPromptRejects(page, 'Calculations', { Opacity: '150' }, 'Enter a number from 0 to 100.');
  await cancelPrompt(page, 'Calculations');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});
