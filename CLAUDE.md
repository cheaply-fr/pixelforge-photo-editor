# PixelForge: Claude Code project guide

This is the code repository for the PixelForge browser photo editor. Read
[`docs/claude-code-handoff.md`](docs/claude-code-handoff.md) before planning or
changing features. It carries the product decisions, architecture, release
process, and outstanding work from the previous development chat. Recheck
live/repository state before relying on any dated status in that handoff.

## First steps

1. Confirm `git status`, branch, `origin`, and the current `origin/main` SHA.
   The canonical repository is `cheaply-fr/pixelforge-photo-editor`.
2. Read `README.md`, `docs/product-scope.md`,
   `docs/roadmap-progress-rubric.md`, and the relevant `docs/*-contract.md`.
   Some historical prose is stale; source, tests, current CI, and live revision
   evidence take precedence.
3. Use Node 22.13+; run `npm ci`, `npm run lint`, `npm run typecheck`,
   `npm run build`, `npm test`, and `npm run test:e2e` as appropriate.
4. Work in focused branches. Every implemented feature needs substantial
   pure and desktop/mobile browser tests. Validate locally, then check the
   protected PR workflow before merge. Only `main` deploys.
5. Confirm `/release.json` and `/health` or `/api/readyz.json` identify the
   expected deployed commit. Keep local, CI, deployment, and live functional
   verification distinct in reports.

Editing is local-first and anonymous use must remain functional. Never place
credentials, tokens, cookies, personal account details, or private images in
repository files or chat. Optional cloud saves require explicit user action.
Preserve accessible compact toolbar families, icons, flyouts, and responsive
desktop/mobile behavior. Do not claim Photoshop parity for bounded local
approximations or flattened interchange.
