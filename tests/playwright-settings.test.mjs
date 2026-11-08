import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PLAYWRIGHT_PORT,
  playwrightPort,
  playwrightServerSettings,
} from '../playwright.settings.mjs';

test('defaults keep the CI layout: port 4173, test-results, playwright-report', () => {
  const settings = playwrightServerSettings({ CI: 'true' });
  assert.equal(settings.port, DEFAULT_PLAYWRIGHT_PORT);
  assert.equal(settings.baseURL, 'http://127.0.0.1:4173');
  assert.equal(settings.outputDir, 'test-results');
  assert.equal(settings.reportDir, 'playwright-report');
  assert.equal(settings.webServer.url, settings.baseURL);
  assert.equal(settings.webServer.command, 'npm run preview -- --port 4173 --strictPort');
  assert.equal(settings.webServer.reuseExistingServer, false);
});

test('a local run does not reuse an existing server unless asked', () => {
  assert.equal(playwrightServerSettings({}).webServer.reuseExistingServer, false);
  assert.equal(
    playwrightServerSettings({ PLAYWRIGHT_REUSE_SERVER: '1' }).webServer.reuseExistingServer,
    true,
  );
  assert.equal(
    playwrightServerSettings({ PLAYWRIGHT_REUSE_SERVER: 'true' }).webServer.reuseExistingServer,
    false,
  );
  // CI never reuses, even if the variable leaks into the environment.
  assert.equal(
    playwrightServerSettings({ CI: '1', PLAYWRIGHT_REUSE_SERVER: '1' }).webServer
      .reuseExistingServer,
    false,
  );
});

test('PLAYWRIGHT_PORT moves the preview, base URL and strict port together', () => {
  const settings = playwrightServerSettings({ PLAYWRIGHT_PORT: '4191' });
  assert.equal(settings.port, 4191);
  assert.equal(settings.baseURL, 'http://127.0.0.1:4191');
  assert.equal(settings.webServer.url, 'http://127.0.0.1:4191');
  assert.match(settings.webServer.command, /--port 4191 --strictPort$/);
});

test('PLAYWRIGHT_OUTPUT_DIR separates artifacts and the HTML report', () => {
  const settings = playwrightServerSettings({ PLAYWRIGHT_OUTPUT_DIR: 'test-results-a' });
  assert.equal(settings.outputDir, 'test-results-a');
  assert.equal(settings.reportDir, 'test-results-a-report');
  const other = playwrightServerSettings({ PLAYWRIGHT_OUTPUT_DIR: 'test-results-b' });
  assert.notEqual(other.outputDir, settings.outputDir);
  assert.notEqual(other.reportDir, settings.reportDir);
});

test('invalid ports are rejected instead of silently falling back', () => {
  assert.equal(playwrightPort(undefined), 4173);
  assert.equal(playwrightPort(''), 4173);
  assert.equal(playwrightPort('65535'), 65535);
  for (const bad of ['0', '65536', '-1', '41.5', 'abc', '4173x', ' 4173'])
    assert.throws(() => playwrightPort(bad), /PLAYWRIGHT_PORT/);
});
