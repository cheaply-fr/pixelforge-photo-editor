import { expect, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export { selectTool } from '../../tests/browser/tool-selection';
export { openPanel, closePanels, openPropertiesSheet } from '../../tests/browser/sidebar-panels';

const IMG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'img');

/** Open a fresh, signed-out editor and wait until it is ready. */
export async function openEditor(page: Page, path = '/editor?new=1'): Promise<void> {
  // Screenshots always show the anonymous editor; never reach the account service.
  await page.route('https://marketplace.cheaply.fr/**', (route) => route.fulfill({ json: { authenticated: false } }));
  // Answer the analytics consent banner up front ("No thanks") so it never covers a shot.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cheaply.analytics.consent.v1', 'denied');
    } catch {
      // Storage may be unavailable; the banner then appears and is closed below.
    }
  });
  await page.goto(path);
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await dismissNotices(page);
}

export type SampleKind = 'landscape' | 'portrait' | 'city';

/**
 * Open a generated sample picture (no personal images): a sunset landscape,
 * a soft studio "portrait" composition or a night city skyline.
 */
export async function openSample(page: Page, kind: SampleKind = 'landscape', size = { w: 1600, h: 1000 }): Promise<void> {
  const base64 = await page.evaluate(({ kind, w, h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d')!;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (kind === 'landscape') {
      const sky = c.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, '#1d3a63');
      sky.addColorStop(0.55, '#c86b5a');
      sky.addColorStop(1, '#f3b77a');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd9a0';
      c.beginPath();
      c.arc(w * 0.68, h * 0.5, h * 0.09, 0, Math.PI * 2);
      c.fill();
      const ridge = (y: number, amp: number, color: string) => {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += w / 40) c.lineTo(x, y - Math.abs(Math.sin(x / (w / 7)) * amp) - rand() * amp * 0.25);
        c.lineTo(w, h);
        c.fill();
      };
      ridge(h * 0.6, h * 0.22, '#5a3f5c');
      ridge(h * 0.66, h * 0.14, '#33304a');
      const lake = c.createLinearGradient(0, h * 0.68, 0, h);
      lake.addColorStop(0, '#e59a72');
      lake.addColorStop(1, '#203350');
      c.fillStyle = lake;
      c.fillRect(0, h * 0.68, w, h * 0.32);
      c.fillStyle = '#ffffff22';
      for (let i = 0; i < 60; i += 1) c.fillRect(w * 0.55 + rand() * w * 0.26, h * 0.7 + rand() * h * 0.25, 30 + rand() * 90, 2);
      c.fillStyle = '#141826';
      for (let i = 0; i < 26; i += 1) {
        const x = rand() * w * 0.4;
        const t = h * (0.1 + rand() * 0.12);
        c.beginPath();
        c.moveTo(x, h * 0.74 - t);
        c.lineTo(x - t * 0.25, h * 0.74);
        c.lineTo(x + t * 0.25, h * 0.74);
        c.fill();
      }
    } else if (kind === 'portrait') {
      const bg = c.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.5, w * 0.7);
      bg.addColorStop(0, '#3f5f7a');
      bg.addColorStop(1, '#141c26');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9a184';
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.42, w * 0.11, h * 0.2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2b1d19';
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.3, w * 0.13, h * 0.13, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#7a3a4a';
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.95, w * 0.28, h * 0.3, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = '#e8d5c7';
      for (let i = 0; i < 18; i += 1) c.fillRect(w * 0.42 + rand() * w * 0.16, h * 0.3 + rand() * h * 0.25, 3, 3);
    } else {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1030');
      sky.addColorStop(1, '#3a2a5e');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i += 1) {
        c.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
        c.fillRect(rand() * w, rand() * h * 0.5, 2, 2);
      }
      for (let x = 0; x < w; ) {
        const bw = 60 + rand() * 120;
        const bh = h * (0.2 + rand() * 0.45);
        c.fillStyle = `hsl(${230 + rand() * 30},25%,${12 + rand() * 10}%)`;
        c.fillRect(x, h - bh, bw - 6, bh);
        c.fillStyle = '#ffd27a';
        for (let y = h - bh + 12; y < h - 12; y += 22) for (let wx = x + 8; wx < x + bw - 20; wx += 18) if (rand() > 0.55) c.fillRect(wx, y, 8, 10);
        x += bw;
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { kind, w: size.w, h: size.h });
  await page.getByTestId('file-input').setInputFiles({ name: `sample-${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', String(size.w));
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await dismissNotices(page);
}

/** Open a top menu (File, Edit, Image, …) and optionally click one of its items. */
export async function menu(page: Page, top: string, item?: string): Promise<void> {
  await page.getByRole('button', { name: top, exact: true }).click();
  if (item) await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** Close menus, dialogs' transient toasts and notices that would clutter a shot. */
export async function dismissNotices(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** Draw an accent ring around elements to point at them in a screenshot. */
export async function highlight(...targets: Locator[]): Promise<void> {
  for (const target of targets) {
    const box = await target.boundingBox();
    if (!box) continue;
    await target.page().evaluate((b) => {
      const ring = document.createElement('div');
      ring.className = 'help-shot-ring';
      Object.assign(ring.style, {
        position: 'fixed', left: `${b.x - 4}px`, top: `${b.y - 4}px`, width: `${b.width + 8}px`, height: `${b.height + 8}px`,
        border: '3px solid #ff6b43', borderRadius: '8px', boxShadow: '0 0 0 4px #ff6b4355', zIndex: '2147483647', pointerEvents: 'none',
      });
      document.body.append(ring);
    }, box);
  }
}

export async function clearHighlights(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('.help-shot-ring').forEach((ring) => ring.remove()));
}

/**
 * Save help/img/<name>.jpg. With a target, captures that element plus `pad`
 * pixels around it (clamped to the viewport); otherwise the whole viewport.
 */
export async function shoot(page: Page, name: string, target?: Locator, { pad = 12 } = {}): Promise<void> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`Shot names are kebab-case: ${name}`);
  await page.waitForTimeout(250);
  const path = join(IMG_DIR, `${name}.jpg`);
  if (!target) {
    await page.screenshot({ path, type: 'jpeg', quality: 82, animations: 'disabled', caret: 'hide' });
    return;
  }
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Nothing to capture for ${name}`);
  const viewport = page.viewportSize()!;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const clip = { x, y, width: Math.min(viewport.width - x, box.width + pad * 2), height: Math.min(viewport.height - y, box.height + pad * 2) };
  await page.screenshot({ path, type: 'jpeg', quality: 86, clip, animations: 'disabled', caret: 'hide' });
}

/** Drag on the canvas between two points given as fractions of the canvas box. */
export async function dragOnCanvas(page: Page, from: [number, number], to: [number, number], steps = 12): Promise<void> {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps });
  await page.mouse.up();
}

/** Click on the canvas at a point given as fractions of the canvas box. */
export async function clickCanvas(page: Page, at: [number, number]): Promise<void> {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
}
