import { defineConfig, devices } from '@playwright/test';

// Captures the Help Center screenshots into help/img/ (docs/knowledge-base.md).
//
//   npm run help:shots                      every shot, against production
//   npm run help:shots -- -g "light-rays"   only matching shots
//   HELP_SHOTS_BASE_URL=http://127.0.0.1:4173 npm run help:shots
//
// Shots tagged @mobile run on a phone viewport; all others on a 1440×900
// desktop. Images are synthetic (generated in the page), never personal files.
const baseURL = process.env.HELP_SHOTS_BASE_URL || 'https://photoeditor.cheaply.fr';

export default defineConfig({
  testDir: './shots',
  testMatch: '**/*.shots.ts',
  outputDir: '../test-results/help-shots',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: Number.parseInt(process.env.HELP_SHOTS_WORKERS || '3', 10),
  reporter: [['list']],
  use: {
    baseURL,
    contextOptions: { reducedMotion: 'reduce' },
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    { name: 'mobile', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
  ],
});
