# Contributing to PixelForge

Thanks for helping improve PixelForge. This page is the short version; the detail lives in the [developer guide](docs/developer-guide.md) and [testing guide](docs/testing.md).

## Ground rules

- **Local-first.** Editing must work anonymously and offline. Nothing the user creates may leave the device without an explicit action (see [security and privacy](docs/security-and-privacy.md)).
- **No secrets or private data** in code, tests, fixtures, docs, issues or PRs: no credentials, tokens, cookies, personal account details or private images. Test images are generated synthetically.
- **Honest scope.** Describe bounded local approximations as such; do not claim Photoshop parity.
- **Accessible, responsive UI.** Keep the compact toolbar families, icons and flyouts usable with keyboard and on desktop and mobile.

## Workflow

1. Branch from an up-to-date `main` with a focused name (`feat/…`, `fix/…`, `perf/…`, `docs/…`).
2. Set up with Node 22.13+ and `npm ci` ([setup](docs/developer-guide.md#1-setup)).
3. Put logic in a pure module under `src/` and keep `app/page.tsx` wiring thin ([conventions](docs/developer-guide.md#4-coding-conventions)).
4. Add tests: a pure `tests/<feature>.test.mjs` **and** a Playwright spec in `tests/browser/` that passes on both the desktop and mobile projects ([writing good specs](docs/testing.md#4-writing-good-specs)).
5. Add or update the feature's `docs/<feature>-contract.md` and link it from the [docs index](docs/README.md). User-visible features also need a Help Center article ([knowledge base](docs/knowledge-base.md)).
6. Run the checks locally:

   ```sh
   npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e
   ```

7. Open a pull request against `main`. Describe what changed, how it was verified (local vs CI), and any limits. All six `Validate editor` shards must be green and conversations resolved before merge.
8. After merge, `main` deploys automatically. Confirm the new commit at `/release.json` ([verifying a release](docs/operations.md)).

## Reporting security issues

Do not open a public issue. Use GitHub's private vulnerability reporting on the repository; see [security and privacy](docs/security-and-privacy.md).
