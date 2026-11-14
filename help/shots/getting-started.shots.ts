import { test } from '@playwright/test';
import { highlight, openEditor, openSample, shoot } from './helpers';

test('workspace-overview', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await shoot(page, 'workspace-overview');
});

test('workspace-regions', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  await highlight(
    page.getByTestId('tool-palette'),
    page.getByRole('button', { name: 'File', exact: true }),
  );
  await shoot(page, 'workspace-regions');
});

test('workspace-mobile @mobile', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape', { w: 1200, h: 900 });
  await shoot(page, 'workspace-mobile');
});
