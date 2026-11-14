# Google Cloud deployment

Infrastructure and setup reference for production hosting. Day-to-day release, verification, rollback, cache/service-worker and incident procedures are in the [operations runbook](operations.md); the security model and data flows are in [security and privacy](security-and-privacy.md). Docs index: [README](README.md).

- Repository: `cheaply-fr/pixelforge-photo-editor`
- Owner: the Cheaply Google account (see the project's IAM page; not recorded here)
- Dedicated Google Cloud / Firebase project: `photoeditor-cheaply` (`893177923518`)
- Hosting site: `photoeditor-cheaply`
- Origin: `https://photoeditor-cheaply.web.app`
- Custom domain: `https://photoeditor.cheaply.fr`
- DNS: Cloudflare, `cheaply.fr` zone

Image editing runs client-side and Firebase Hosting serves the Vite build over HTTPS. Optional shared-session authentication and cloud project storage are provided by the existing Cheaply Marketplace backend; no account is required for editing. This migration uses the existing GitHub editor, including its menu fixes; the older Sites publication is a separate deployment.

## CI/CD

`.github/workflows/ci-cd.yml` (**CI and deploy**) checks pull requests, pushes to `main` and manual runs. Validation runs as six `Validate editor (n/6)` shards; each does lint, TypeScript, a production build, the pure Node tests (including release-version and release-artifact tests) and one sixth of the Playwright desktop/mobile suite. Failed checks prevent the deployment job. Branch protection on `main` requires a pull request but does not currently name these checks as required, so do not merge while a shard is red (see [operations](operations.md#what-main-branch-protection-actually-enforces)). Browser failure traces are retained for seven days; build artifacts for fourteen days.

Only `main` can deploy (job condition plus the `production` environment's `main`-only branch policy). Runs share the concurrency group `pixelforge-<ref>` with `cancel-in-progress: true`: a newer `main` push cancels an in-flight `main` run, including its deploy, and the newer run deploys instead. The deploy job downloads the already-tested artifact and authenticates through Google Workload Identity Federation. No long-lived Google service-account key is stored in GitHub.

The provider permits repository ID `1357642782`, owner ID `1819120`, `refs/heads/main`, and this repository's `ci-cd.yml` workflow. The dedicated service account is `github-photoeditor-deploy@photoeditor-cheaply.iam.gserviceaccount.com`, with Firebase Hosting administration and Service Usage Consumer permissions in this dedicated project.

After publication, both the Google origin and custom domain must return the expected Git commit from `/release.json` and `/api/readyz.json`. An HTTP 200 alone is not a successful deployment check. TLS errors or revision mismatches fail the workflow.

## Routine release

1. Open a pull request and wait for `Validate editor`.
2. Merge it to `main`.
3. Wait for `Deploy production`, including both live URL checks.
4. Confirm the commit at `/release.json` if investigating a cache or release issue.

The Actions `Run workflow` control can redeploy the current `main` revision. It runs all checks again.

## Release versions

Every production deploy carries a new, increasing version without any commit on `main` (no bot commits, no CI pushes, no tags). `scripts/release-version.mjs` derives it at build time; `vite.config.ts` bakes it into the bundle (next to the commit) and `scripts/write-release.mjs` writes the same value to `/release.json` and `/api/readyz.json` (served as `/health` and `/api/readyz`).

| Build | Version | Example |
| --- | --- | --- |
| `main` push or `Run workflow` on `main` (deploys) | `<major>.<minor>.<GITHUB_RUN_NUMBER>` | `0.1.512` |
| Pull request run | `<package version>-pr.<number>+<sha7>` | `0.1.0-pr.226+1a2b3c4` |
| Other Actions run | `<package version>-ci.<run>+<sha7>` | `0.1.0-ci.530+1a2b3c4` |
| Local build or dev server | `<package version>-dev+<sha7>` | `0.1.0-dev+1a2b3c4` |

- `major.minor` come from `package.json`; its patch is replaced by the run number. Bump `major.minor` there (in a normal PR) for a deliberate larger step; never lower them.
- `GITHUB_RUN_NUMBER` is per workflow and increases with every run of **CI and deploy**, so successive deploys are strictly increasing. PR runs share the counter, so production versions have gaps (`0.1.512`, then `0.1.518`). A re-run (any attempt) keeps its run number, so re-running a deploy republishes the same version. Renaming `ci-cd.yml` creates a new workflow whose numbers restart at 1: bump `minor` in the same change.
- The six validate shards build in the same run, so their artifacts carry the same version; the deploy job publishes that tested artifact unchanged.
- A main deploy run without a valid run number fails the build rather than publishing a stale version.
- `/release.json` also has `channel` (`release`, `pr`, `ci` or `dev`) next to `application`, `version`, `commit` and `builtAt`.
- In the deploy job `npm run verify:deployment` derives the expected version from the same run and requires both live URLs to report it in `/release.json` and `/api/readyz.json`, in addition to the commit. Elsewhere it checks that the two artifacts agree; set `EXPECTED_VERSION` to check a specific version by hand.
- No tag is created per deploy: that needs `contents: write` for the workflow token (the workflow is intentionally read-only) and a tag push from CI. Map a version to its commit through `/release.json` or the Actions run with that number.

## Rollback

See [operations → Rollback](operations.md#6-rollback). In short: revert through a pull request by default; for an urgent hosting-only rollback use Firebase Hosting's release history (the pinned `firebase-tools` has no `hosting:rollback` command; `hosting:clone` can promote an older version), or re-run an older run's deploy job while its artifacts are retained (14 days). Then reconcile `main` with a revert before another deployment. Do not use an old artifact without checking its embedded commit and compatibility.

## DNS and certificates

Use the exact DNS records returned by Firebase's custom-domain setup. Keep ownership verification records in place. Use DNS-only records while Firebase validates the domain and issues its certificate. Do not modify the zone apex or unrelated application records. Firebase's domain state and a successful HTTPS request are the completion checks.

## Troubleshooting

- Authentication denial: inspect the numeric repository/owner claims, branch and workflow name against the provider condition. Do not broaden the provider to all repositories to bypass an error.
- Deploy authorization: verify the dedicated account's project roles and the WIF service-account binding.
- Origin succeeds but custom domain fails: inspect Cloudflare DNS, Firebase domain/certificate state and DNS propagation.
- Build succeeds but browser tests fail: inspect the attached Playwright trace; fix the editor before deploying.
- Verification finds the wrong commit: check the target project/site and cached release metadata. Only hashed assets are cached immutably.

The editor build uses static hosting. Optional project storage runs through Marketplace in project blissful-scout-290322, using a separate private EU bucket blissful-scout-290322-pixelforge-projects. The existing Marketplace session cookie remains host-only and HttpOnly; the project API accepts only the exact photoeditor.cheaply.fr origin. Local photos upload only after an explicit save action. Cloud saves are version-checked and limited to 16 MB per document, 30 projects and 256 MB per library. Deleted cloud objects have a seven-day provider recovery period. Firebase usage quotas still apply; monitor the project's usage before scaling traffic or adding paid processing.

## Editor release status

The editor top bar displays the version of the running build (baked into the bundle, equal to `/release.json` for that build; see **Release versions**) and a compact server state derived from `/api/readyz.json`. The indicator is **Server online** only when both artifacts are valid, identify `pixelforge-photo-editor`, and report the same commit and version with `ready: true`. A readiness failure or commit mismatch is shown as **Server degraded**; an unavailable or malformed artifact falls back to **Offline · local editing** so anonymous editing remains usable. Both requests are no-store reads, time out after five seconds and are polled every 30 seconds. The service worker bypasses these paths so cached shell metadata cannot report an offline server as healthy. The baked app version remains visible when a probe fails. When a newer deploy is detected (its commit differs from the baked one) the label keeps the running version and a non-blocking **New version available (v…)** notice names the new version, with Reload and Later; mobile shows the state text as well as the coloured dot. The status has an accessible live label containing the version and current state.
