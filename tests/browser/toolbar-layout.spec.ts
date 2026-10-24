import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

async function openEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

test('tool palette keeps two columns and usable touch targets', async ({
  page,
}) => {
  await openEditor(page);
  const palette = page.getByTestId('tool-palette');
  const layout = await palette.evaluate((element) => {
    const styles = getComputedStyle(element);
    const buttons = [...element.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !button.closest('[role="menu"]');
    });
    const xPositions = [...new Set(
      buttons.map((button) => Math.round(button.getBoundingClientRect().x)),
    )];
    return {
      display: styles.display,
      columns: styles.gridTemplateColumns.split(' ').length,
      xPositions,
      labels: buttons.map((button) => button.getAttribute('aria-label')),
      touchTargets: buttons.every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
    };
  });
  expect(layout.display).toBe('grid');
  expect(layout.columns).toBe(2);
  expect(layout.xPositions.length).toBe(2);
  expect(layout.touchTargets).toBe(true);
  expect(layout.labels).toContain('Move tool');
  expect(layout.labels).toContain('Selection Brush tool');
  expect(layout.labels).toContain('Quick Mask mode');
});

test('wide editor palette expands to three columns without losing focus targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page);
  const palette = page.getByTestId('tool-palette');
  const layout = await palette.evaluate((element) => {
    const styles = getComputedStyle(element);
    const buttons = [...element.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !button.closest('[role="menu"]');
    });
    return {
      columns: styles.gridTemplateColumns.split(' ').length,
      xPositions: [...new Set(
        buttons.map((button) => Math.round(button.getBoundingClientRect().x)),
      )],
    };
  });
  expect(layout.columns).toBe(3);
  // Compact one-slot categories can share a row with another category, while
  // two-slot categories retain two global tracks. The packed layout therefore
  // exposes up to five distinct button x positions without placeholder cells.
  expect(layout.xPositions.length).toBeGreaterThanOrEqual(3);
  expect(layout.xPositions.length).toBeLessThanOrEqual(5);

  const pen = page.getByRole('button', { name: 'Pen tool', exact: true });
  await pen.focus();
  await expect(pen).toBeFocused();
  await expect(pen).toHaveAttribute('title', /Pen \(P\).*press and hold/i);
  await expect(
    page.getByRole('button', { name: 'Crop tool', exact: true }),
  ).toHaveAttribute('title', /press and hold/i);
});

test('family tools show Photoshop-style submenu arrows while singleton tools stay clean', async ({
  page,
}) => {
  await openEditor(page);

  for (const label of [
    'Select tool',
    'Lasso tool',
    'Crop tool',
    'Brush tool',
    'Clone tool',
  ]) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button.locator('.tool-subtool-arrow')).toHaveCount(1);
    await expect(button.locator('.tool-subtool-arrow')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  }

  for (const label of ['Move tool', 'Text tool']) {
    await expect(
      page.getByRole('button', { name: label, exact: true }).locator(
        '.tool-subtool-arrow',
      ),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole('button', { name: 'Pen tool', exact: true }).locator(
      '.tool-subtool-arrow',
    ),
  ).toHaveCount(1);
});

test('Pen family exposes icon-bearing subtools and keeps one compact slot', async ({ page }) => {
  await openEditor(page);
  const pen = page.getByRole('button', { name: 'Pen tool', exact: true });
  await expect(pen.locator('.tool-subtool-arrow')).toHaveCount(1);
  await pen.focus();
  await page.keyboard.press('ArrowDown');
  const flyout = page.locator('[role="menu"]:visible');
  for (const label of ['Pen', 'Freeform Pen', 'Curvature Pen']) {
    const item = flyout.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeVisible();
    await expect(item.locator('svg')).toHaveCount(1);
    await expect(item.locator('kbd')).toHaveText('P');
  }
  await flyout.getByRole('menuitem', { name: 'Curvature Pen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Curvature Pen tool', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pen tool', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Freeform Pen tool', exact: true })).toHaveCount(0);
});

test('short keyboard activation selects while directional keys and context menu open one anchored flyout', async ({
  page,
}) => {
  await openEditor(page);
  const crop = page.getByRole('button', { name: 'Crop tool', exact: true });

  await crop.focus();
  await page.keyboard.press('Enter');
  await expect(crop).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);

  await page.keyboard.press('ArrowDown');
  const flyout = page.locator('[role="menu"]:visible');
  await expect(flyout).toHaveCount(1);
  await expect(flyout).toHaveCSS('position', 'fixed');
  await expect(flyout).toHaveAttribute('aria-label', /subtools/i);
  const anchorId = await flyout.getAttribute('aria-labelledby');
  expect(anchorId).toBeTruthy();
  await expect(page.locator(`#${anchorId}`)).toHaveCount(1);

  const items = flyout.getByRole('menuitem');
  await expect(items).toHaveCount(5);
  await expect(items.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label')),
  )).resolves.toEqual([
    'Crop',
    'Perspective Crop',
    'Slice',
    'Slice Select',
    'Frame',
  ]);
  for (const item of await items.all()) {
    await expect(item).toHaveAttribute('aria-label', /.+/);
  }
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
  await expect(crop).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await crop.click({ button: 'right' });
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(1);

  const bounds = await flyout.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);

  await page.locator('.docbar').click();
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
});

test('a touch press held for 420 ms opens one family and touch can choose a subtool', async ({
  page,
}) => {
  await openEditor(page);
  const crop = page.getByRole('button', { name: 'Crop tool', exact: true });
  await crop.dispatchEvent('pointerdown', {
    bubbles: true,
    pointerId: 9,
    pointerType: 'touch',
    buttons: 1,
    clientX: 40,
    clientY: 160,
  });
  await page.waitForTimeout(450);
  await expect(page.locator('[role="menu"]:visible')).toHaveCount(1);
  await crop.dispatchEvent('pointerup', {
    bubbles: true,
    pointerId: 9,
    pointerType: 'touch',
    buttons: 0,
    clientX: 40,
    clientY: 160,
  });

  const flyout = page.locator('[role="menu"]:visible');
  await flyout.getByRole('menuitem', { name: 'Perspective Crop', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Perspective Crop tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('M/L/W flyouts retain Photoshop tool names and shortcuts', async ({ page }) => {
  await openEditor(page);

  const marquee = page.getByRole('button', { name: 'Select tool', exact: true });
  await marquee.focus();
  await page.keyboard.press('ArrowDown');
  let flyout = page.locator('[role="menu"]:visible');
  const rectangular = flyout.getByRole('menuitem', { name: 'Rectangular Marquee', exact: true });
  const elliptical = flyout.getByRole('menuitem', { name: 'Elliptical Marquee', exact: true });
  await expect(rectangular).toBeVisible();
  await expect(elliptical).toBeVisible();
  await expect(rectangular.locator('svg')).toBeVisible();
  await expect(rectangular.locator('kbd')).toHaveText('M');
  await expect(elliptical.locator('kbd')).toHaveText('M');
  await page.keyboard.press('Escape');

  const lasso = page.getByRole('button', { name: 'Lasso tool', exact: true });
  await lasso.focus();
  await page.keyboard.press('ArrowDown');
  flyout = page.locator('[role="menu"]:visible');
  const freeform = flyout.getByRole('menuitem', { name: 'Freeform Lasso', exact: true });
  const magnetic = flyout.getByRole('menuitem', { name: 'Magnetic Lasso', exact: true });
  await expect(freeform).toBeVisible();
  await expect(magnetic).toBeVisible();
  await expect(magnetic.locator('svg')).toBeVisible();
  await expect(freeform.locator('kbd')).toHaveText('L');
  await expect(magnetic.locator('kbd')).toHaveText('L');
  await page.keyboard.press('Escape');

  const selectionBrush = page.getByRole('button', { name: 'Selection Brush tool', exact: true });
  await expect(selectionBrush.locator('.tool-subtool-arrow')).toHaveCount(0);
  await selectionBrush.click();
  const quickParent = page.getByRole('button', { name: 'Quick Selection tool', exact: true });
  await quickParent.focus();
  await page.keyboard.press('ArrowDown');
  flyout = page.locator('[role="menu"]:visible');
  const quick = flyout.getByRole('menuitem', { name: 'Quick Selection', exact: true });
  const wand = flyout.getByRole('menuitem', { name: 'Magic Wand', exact: true });
  await expect(quick).toBeVisible();
  await expect(wand).toBeVisible();
  await expect(quick.locator('svg')).toBeVisible();
  await expect(quick.locator('kbd')).toHaveText('W');
  await expect(wand.locator('kbd')).toHaveText('W');
});

test('family variants occupy one category slot without duplicate toolbar ids', async ({ page }) => {
  await openEditor(page);
  const palette = page.getByTestId('tool-palette');
  const ids = await palette.locator(':scope > .tool-category .tool-button-wrap > button').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('data-tool-id')),
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain('magic-wand');
  expect(ids).toContain('selection-brush');
  expect(ids).toContain('lasso');
  expect(ids).not.toContain('polygonal-lasso');
});

test('measure tools and Selection Brush keep independent toolbar slots', async ({ page }) => {
  await openEditor(page);
  for (const label of ['Eyedropper', 'Color Sampler', 'Ruler', 'Note', 'Count', 'Selection Brush']) {
    await expect(page.getByRole('button', { name: `${label} tool`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Eyedropper tool', exact: true }).locator('.tool-subtool-arrow')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Selection Brush tool', exact: true }).locator('.tool-subtool-arrow')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quick Selection tool', exact: true }).locator('.tool-subtool-arrow')).toHaveCount(1);
});

test('family slots remember the last chosen subtool after switching tools', async ({ page }) => {
  await openEditor(page);
  const lasso = page.getByRole('button', { name: 'Lasso tool', exact: true });
  await lasso.focus();
  await page.keyboard.press('ArrowDown');
  await page
    .locator('[role="menu"]:visible')
    .getByRole('menuitem', { name: 'Magnetic Lasso', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Magnetic Lasso tool', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Magnetic Lasso tool', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lasso tool', exact: true })).toHaveCount(0);
});

test('family subtool choice survives a reload through the local preference envelope', async ({ page }) => {
  await openEditor(page);
  const lasso = page.getByRole('button', { name: 'Lasso tool', exact: true });
  await lasso.focus();
  await page.keyboard.press('ArrowDown');
  await page
    .locator('[role="menu"]:visible')
    .getByRole('menuitem', { name: 'Magnetic Lasso', exact: true })
    .click();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Magnetic Lasso tool', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lasso tool', exact: true })).toHaveCount(0);
});

test('compact categories pack across tracks while larger categories keep full rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page);
  const layout = await page.getByTestId('tool-palette').evaluate((element) => {
    const categories = [...element.querySelectorAll<HTMLElement>(':scope > .tool-category')];
    const rects = categories.map((category) => {
      const rect = category.getBoundingClientRect();
      const grid = category.querySelector<HTMLElement>('.tool-category-grid');
      const className = [...category.classList].find((item) => item.startsWith('tool-category--')) ?? '';
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        className,
        gridColumn: getComputedStyle(category).gridColumn,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        gridClass: grid ? [...grid.classList].find((item) => item.startsWith('tool-category-grid--')) : undefined,
      };
    });
    return { rects, palette: element.getBoundingClientRect().toJSON() };
  });
  expect(layout.rects.length).toBeGreaterThan(4);
  expect(new Set(layout.rects.map((rect) => rect.left)).size).toBeGreaterThan(1);
  expect(layout.rects.every((rect) => rect.top >= layout.palette.top && rect.bottom <= layout.palette.bottom)).toBe(true);
  expect(layout.rects.every((rect, index) => layout.rects.every((other, otherIndex) => (
    index === otherIndex || rect.right <= other.left || other.right <= rect.left ||
      rect.bottom <= other.top || other.bottom <= rect.top
  )))).toBe(true);
  expect(layout.rects.every((rect) => rect.gridColumns === (
    rect.gridClass === 'tool-category-grid--one' ? 1 :
      rect.gridClass === 'tool-category-grid--two' ? 2 : 3
  ))).toBe(true);
  expect(layout.rects.every((rect) => {
    const expected = rect.className === 'tool-category--one' ? 'span 1'
      : rect.className === 'tool-category--two' ? 'span 2' : '1 / -1';
    return rect.gridColumn === expected;
  })).toBe(true);
  const packed = layout.rects.filter((rect) => rect.className.endsWith('--one'));
  expect(packed.length).toBeGreaterThan(1);
  expect(new Set(packed.map((rect) => rect.top)).size).toBeLessThan(packed.length);
});

test('category grids size to their compact tool count without trailing empty slots', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page);
  const layouts = await page.getByTestId('tool-palette').locator(':scope > .tool-category').evaluateAll((categories) =>
    categories.map((category) => {
      const grid = category.querySelector<HTMLElement>('.tool-category-grid');
      const className = [...category.classList].find((item) => item.startsWith('tool-category--')) ?? '';
      return {
        className,
        itemCount: grid?.children.length ?? 0,
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      };
    }),
  );
  expect(layouts.length).toBeGreaterThan(4);
  for (const layout of layouts) {
    const expected = layout.className === 'tool-category--one' ? 1 : layout.className === 'tool-category--two' ? 2 : 3;
    expect(layout.columns).toBe(expected);
    expect(layout.itemCount).toBeGreaterThan(0);
  }
});

test('toolbar tool icons use a uniform box and dense packing', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page);
  const metrics = await page.getByTestId('tool-palette').locator('.tool-icon').evaluateAll((icons) => {
    const boxes = icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      const style = getComputedStyle(icon);
      return { width: Math.round(rect.width), height: Math.round(rect.height), flexBasis: style.flexBasis };
    });
    return { boxes, buttons: [...document.querySelectorAll<HTMLElement>('[data-testid="tool-palette"] .tool-button-wrap')].map((item) => item.getBoundingClientRect().height) };
  });
  expect(new Set(metrics.boxes.map((box) => `${box.width}x${box.height}`)).size).toBe(1);
  expect(metrics.boxes.every((box) => box.flexBasis === '26px')).toBe(true);
  expect(metrics.buttons.every((height) => height >= 56)).toBe(true);
});
