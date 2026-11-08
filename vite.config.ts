import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

// The commit this bundle is built from (the same one scripts/write-release.mjs
// writes to /release.json), so a long-open tab can notice a newer deploy.
const buildCommit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();

export default defineConfig({
  plugins: [react()],
  define: { __PIXELFORGE_BUILD_COMMIT__: JSON.stringify(buildCommit) },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'dist', sourcemap: false },
  server: { watch: { usePolling: true } },
});
