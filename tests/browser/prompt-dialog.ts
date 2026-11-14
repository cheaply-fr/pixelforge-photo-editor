import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers for the in-app prompt dialog (src/PromptDialog.tsx) that replaced
 * every window.prompt. Values are keyed by the visible field label; strings
 * fill text/number fields or pick a select option by value, booleans set a
 * checkbox.
 */
export type PromptAnswers = Record<string, string | boolean>;

export function promptDialog(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title, exact: true });
}

export async function fillPrompt(page: Page, title: string, answers: PromptAnswers): Promise<Locator> {
  const dialog = promptDialog(page, title);
  await expect(dialog).toBeVisible();
  for (const [label, value] of Object.entries(answers)) {
    const control = dialog.getByLabel(label, { exact: true });
    if (typeof value === 'boolean') await control.setChecked(value);
    else if (await control.evaluate((element) => element.tagName === 'SELECT')) await control.selectOption(value);
    else await control.fill(value);
  }
  return dialog;
}

/** Fill the named prompt and press its submit button; waits for it to close. */
export async function answerPrompt(page: Page, title: string, answers: PromptAnswers = {}): Promise<void> {
  const dialog = await fillPrompt(page, title, answers);
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0);
}

/** Cancel the named prompt with its Cancel button; waits for it to close. */
export async function cancelPrompt(page: Page, title: string): Promise<void> {
  const dialog = promptDialog(page, title);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * Fill the prompt with an invalid value and prove it cannot be submitted:
 * the inline error shows and submit stays disabled. Leaves the dialog open.
 */
export async function expectPromptRejects(page: Page, title: string, answers: PromptAnswers, error: string | RegExp): Promise<Locator> {
  const dialog = await fillPrompt(page, title, answers);
  await expect(dialog.getByRole('alert')).toContainText(error);
  await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
  return dialog;
}

/**
 * Make any window.prompt call fail loudly and count it, so a spec can assert
 * a flow never falls back to the native prompt.
 */
export async function forbidNativePrompt(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as { __nativePromptCalls: number };
    target.__nativePromptCalls = 0;
    window.prompt = () => {
      target.__nativePromptCalls += 1;
      throw new Error('window.prompt must not be used; use the in-app prompt dialog');
    };
  });
}

export function nativePromptCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __nativePromptCalls?: number }).__nativePromptCalls ?? 0);
}
