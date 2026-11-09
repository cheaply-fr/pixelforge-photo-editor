import { expect, type Page } from '@playwright/test';

// Contextual sidebar helpers (docs/contextual-sidebar-contract.md). Large,
// rarely used panels live behind the "More panels" strip; specs open them the
// way a user does, by their accessible name.

export type SidebarPanelLabel =
  | 'Layer details'
  | 'Adjust selected layer'
  | 'Filters'
  | 'Layer styles'
  | 'History'
  | 'Saved selections'
  | 'Transform'
  | 'Reference image'
  | 'My projects';

/** Expand the phone properties sheet when it was collapsed. */
export async function openPropertiesSheet(page: Page): Promise<void> {
  const handle = page.locator('.inspector-sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') await handle.click();
}

/** Open a "More panels" panel (no-op when it is already open). */
export async function openPanel(page: Page, label: SidebarPanelLabel): Promise<void> {
  await openPropertiesSheet(page);
  const toggle = page.getByRole('button', { name: `${label} panel`, exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sidebar-open-panel')).toBeVisible();
}

/** Close whichever panel is open. */
export async function closePanels(page: Page): Promise<void> {
  const open = page.locator('[data-sidebar-panel-toggle][aria-expanded="true"]');
  if (await open.count()) await open.click();
  await expect(open).toHaveCount(0);
}
