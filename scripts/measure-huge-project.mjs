// Local measurement harness for huge layered projects (not part of CI).
//
//   node scripts/measure-huge-project.mjs <baseUrl> <project.pixelforge>
//
// Opens the editor in Chromium, imports the project, and reports import,
// render, paint, draft-save, reload and portable-export timings together with
// JS heap and browser working-set memory. Numbers are local evidence for one
// machine only; they are not a performance guarantee.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [baseUrl, projectPath] = process.argv.slice(2);
if (!baseUrl || !projectPath) {
  console.error('usage: node scripts/measure-huge-project.mjs <baseUrl> <project.pixelforge>');
  process.exit(2);
}

/** Sum of working sets of the browser process tree (Windows) in MiB. */
function treeMemoryMiB(rootPid) {
  if (process.platform !== 'win32' || !rootPid) return undefined;
  const script = `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize;` +
    `$ids = @(${rootPid}); $changed = $true; while ($changed) { $changed = $false; foreach ($p in $all) { if ($ids -contains $p.ParentProcessId -and -not ($ids -contains $p.ProcessId)) { $ids += $p.ProcessId; $changed = $true } } }` +
    `($all | Where-Object { $ids -contains $_.ProcessId } | Measure-Object -Property WorkingSetSize -Sum).Sum`;
  const bytes = Number(execFileSync('powershell', ['-NoProfile', '-Command', script]).toString().trim());
  return Math.round(bytes / 1048576);
}

const server = await chromium.launchServer({ args: ['--enable-precise-memory-info'] });
const rootPid = server.process().pid;
const browser = await chromium.connect(server.wsEndpoint());
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.on('crash', () => console.error('PAGE CRASHED'));
page.on('console', (message) => { if (message.type() === 'error' || message.text().startsWith('PFTIME')) console.error('console:', message.text().slice(0, 200)); });
await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
  route.fulfill({ json: { authenticated: false } }),
);
const client = await context.newCDPSession(page);
await client.send('Performance.enable');
const heapMiB = async () => {
  const { metrics } = await client.send('Performance.getMetrics');
  const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  return Math.round(used / 1048576);
};
const canvas = page.getByTestId('editor-canvas');
const settled = () => page.waitForFunction(
  () => document.querySelector('[data-testid="editor-canvas"]')?.getAttribute('data-rendering') === 'false',
  undefined,
  { timeout: 600_000, polling: 50 },
);
const saved = () => page.getByRole('status', { name: 'Draft save status' }).filter({ hasText: 'Saved on this device' }).waitFor({ timeout: 600_000 });
const footer = page.locator('footer');
const time = async (label, run) => {
  const start = performance.now();
  const value = await run();
  const ms = Math.round(performance.now() - start);
  results[label] = ms;
  return value;
};
const results = { project: projectPath, archiveMiB: +(fs.statSync(projectPath).size / 1048576).toFixed(1) };

await page.goto(`${baseUrl}/editor?new=1`);
await page.getByRole('application').and(page.locator('[aria-busy="false"]')).waitFor();
await saved();
results.baselineHeapMiB = await heapMiB();
results.baselineBrowserMiB = treeMemoryMiB(rootPid);

await time('importAndFirstRenderMs', async () => {
  // Playwright copies the file into the browser before the input fires;
  // report that harness cost separately from the editor's own import.
  const transferStart = performance.now();
  await page.getByTestId('project-input').setInputFiles(projectPath);
  results.harnessFileTransferMs = Math.round(performance.now() - transferStart);
  const done = footer.filter({ hasText: /Project opened|could not|exceed|Invalid/i });
  const started = performance.now();
  while (!(await done.isVisible())) {
    if (performance.now() - started > 1_200_000) throw new Error('Import did not finish within 20 minutes');
    await page.waitForTimeout(30_000);
    console.error(`[${Math.round((performance.now() - started) / 1000)} s] ${(await footer.innerText({ timeout: 600_000 })).replace(/\s+/g, ' ').slice(0, 160)} heap ${await heapMiB()} MiB browser ${treeMemoryMiB(rootPid)} MiB`);
  }
  await settled();
});
results.importNotice = (await footer.innerText({ timeout: 600_000 })).split('\n').find((line) => /Project|exceed|Invalid/.test(line));
results.layersHeading = await page.getByRole('heading', { name: /^Layers \d+ \/ \d+$/ }).innerText();
results.budgetReadout = await page.getByTestId('layer-pixel-budget').innerText().catch(() => undefined);
results.afterImportHeapMiB = await heapMiB();
results.afterImportBrowserMiB = treeMemoryMiB(rootPid);
await time('firstDraftSaveMs', saved);

// A full re-render (no pixel edit): toggle the active layer's visibility twice.
const eye = page.getByRole('checkbox', { name: 'Visible', exact: true });
await time('rerenderHideMs', async () => {
  await eye.click();
  await settled();
});
await time('rerenderShowMs', async () => {
  await eye.click();
  await settled();
});

// Paint one stroke on the active (top, sparse) layer: expansion, stroke,
// render and the automatic content-bounds storage pass.
await page.getByTestId('tool-palette').getByRole('button', { name: 'Brush tool', exact: true }).click();
const box = await canvas.boundingBox();
await canvas.evaluate((element) => {
  element.setPointerCapture = () => undefined;
});
const at = (fx, fy) => ({ clientX: box.x + box.width * fx, clientY: box.y + box.height * fy });
await time('strokeToRenderedMs', async () => {
  const common = { pointerId: 7, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas.dispatchEvent('pointerdown', { ...common, ...at(0.3, 0.3), buttons: 1 });
  await page.waitForTimeout(50);
  await canvas.dispatchEvent('pointermove', { ...common, ...at(0.35, 0.32), buttons: 1 });
  await canvas.dispatchEvent('pointerup', { ...common, ...at(0.35, 0.32), buttons: 0 });
  // The commit (layer growth, encode, content-bounds storage) finishes after
  // the pointer events; wait for its notice before the final render.
  await footer.filter({ hasText: /Paint layer updated|budget|could not/i }).waitFor({ timeout: 600_000 });
  await settled();
});
results.afterStrokeNotice = (await footer.innerText({ timeout: 600_000 })).split('\n')[0];
await time('strokeDraftSaveMs', async () => {
  await page.waitForTimeout(400);
  await saved();
});
results.afterStrokeHeapMiB = await heapMiB();
results.afterStrokeBrowserMiB = treeMemoryMiB(rootPid);

await time('reloadRestoreMs', async () => {
  await page.reload();
  await page.getByRole('heading', { name: results.layersHeading, exact: true }).waitFor({ timeout: 600_000 });
  await settled();
});
results.afterReloadHeapMiB = await heapMiB();

await time('portableExportMs', async () => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download', { timeout: 600_000 });
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const saved = `${projectPath}.export.pixelforge`;
  await download.saveAs(saved);
  results.exportedMiB = +(fs.statSync(saved).size / 1048576).toFixed(1);
  fs.rmSync(saved, { force: true });
});
results.peakBrowserMiB = treeMemoryMiB(rootPid);
console.log(JSON.stringify(results, null, 2));
await browser.close();
await server.close();
