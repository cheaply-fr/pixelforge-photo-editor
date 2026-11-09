import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { deriveReleaseVersion, resolveBuildCommit } from './scripts/release-version.mjs';

// The commit and version this bundle is built from: the same values
// scripts/write-release.mjs writes to /release.json, so the top bar shows the
// running build and a long-open tab can notice a newer deploy.
const buildCommit = resolveBuildCommit(process.env);
const buildVersion = deriveReleaseVersion({
  packageVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
  env: process.env,
  commit: buildCommit,
}).version;

export default defineConfig({
  plugins: [react()],
  define: {
    __PIXELFORGE_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __PIXELFORGE_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'dist', sourcemap: false },
  server: { watch: { usePolling: true } },
});
