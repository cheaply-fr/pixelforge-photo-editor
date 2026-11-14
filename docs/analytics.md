# Cheaply PixelForge analytics

PixelForge uses a dedicated GA4 web stream. The deployment variable
`PIXELFORGE_GA_MEASUREMENT_ID` is passed to Vite as
`VITE_CHEAPLY_GA_MEASUREMENT_ID`; the value is public configuration, not a
secret. An empty variable safely disables analytics.

The browser defaults to denied consent and does not load Google's script or
send a page view until the visitor chooses **Allow**. Only an app-scoped page
view is sent. Photos, projects, file names, account details, and draft content
remain local and are never sent to GA4.

## Consent banner

Until a choice is stored (`cheaply.analytics.consent.v1` in `localStorage`),
a non-modal `region` named "Analytics consent" offers **No thanks** (outlined,
secondary) and **Allow** (filled, primary). Both are at least 40 px tall with a
visible keyboard focus ring; the banner carries its own scoped styles because
the app's global reset strips button styling (`src/analyticsConsentBanner.ts`).
It never covers the editor's zoom control: on wide screens it sits bottom-left
above the status bar (lifted above the zoom control if a narrow window puts
them in the same place). On phones (680 px wide and narrower) it is a fixed,
compact bar along the bottom of the screen, 8 px from the edges and below the
zoom control (lifted above it if they would meet); while it shows, the page
gains room below its end equal to the bar's height, so the last content can
scroll clear of it. It stacks above the editor's own surfaces (z-index 30)
but below menus, popovers and toolbar flyouts, which therefore always open
over it. Only its buttons take pointer input. `tests/analytics-consent-banner.test.mjs` and
`tests/browser/analytics-consent-banner.spec.ts` (editor at 1280×720,
1440×900 and Pixel 7, and the landing page) cover it. CI builds carry a
measurement id, so `playwright.config.ts` starts every other browser test as
a visitor who already chose "No thanks"; the banner spec clears that and
checks the banner itself. Reproduce CI builds locally with
`VITE_CHEAPLY_GA_MEASUREMENT_ID=G-TEST123 npm run build`.
