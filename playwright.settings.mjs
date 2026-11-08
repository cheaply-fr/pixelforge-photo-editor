// Local Playwright server settings, kept apart from playwright.config.ts so
// they can be unit-tested (tests/playwright-settings.test.mjs).
//
// PLAYWRIGHT_PORT          preview port (default 4173). Give each worktree
//                          its own port to run suites side by side.
// PLAYWRIGHT_REUSE_SERVER  "1" reuses a server already listening on that
//                          port. Off by default, so a run never tests a
//                          preview started from another worktree.
// PLAYWRIGHT_OUTPUT_DIR    test artifacts directory (default "test-results");
//                          the HTML report goes next to it. Use a distinct
//                          one for concurrent runs in one worktree.

export const DEFAULT_PLAYWRIGHT_PORT = 4173;

/** Parse PLAYWRIGHT_PORT; anything other than a TCP port number is an error. */
export function playwrightPort(value) {
  if (value === undefined || value === '') return DEFAULT_PLAYWRIGHT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`PLAYWRIGHT_PORT must be a port number between 1 and 65535, got "${value}"`);
  return port;
}

/** Server, URL and output settings for the given environment. */
export function playwrightServerSettings(env = {}) {
  const port = playwrightPort(env.PLAYWRIGHT_PORT);
  const baseURL = `http://127.0.0.1:${port}`;
  const outputDir = env.PLAYWRIGHT_OUTPUT_DIR || 'test-results';
  const reportDir = outputDir === 'test-results' ? 'playwright-report' : `${outputDir}-report`;
  return {
    port,
    baseURL,
    outputDir,
    reportDir,
    webServer: {
      command: `npm run preview -- --port ${port} --strictPort`,
      url: baseURL,
      // CI always starts its own server; locally reuse is opt-in.
      reuseExistingServer: !env.CI && env.PLAYWRIGHT_REUSE_SERVER === '1',
    },
  };
}
