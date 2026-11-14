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
It covers no tool button and never the editor's zoom control. In the editor
on wide screens it sits over the canvas area, between the toolbar and the
properties sidebar: 16 px in from the canvas area's bottom-left corner, at
most 416 px wide (narrower to fit a narrower canvas area), and lifted above
the zoom control when they would meet. If the canvas area is too narrow
(under 292 px), and on the landing page, it sits bottom-left above the status
bar instead. On phones (680 px wide and narrower) it is one compact row, about
56 px tall, fixed along the bottom of the screen 8 px from the edges: the short
message "Allow anonymous usage stats? Your photos stay on this device." with
the two buttons on its right (the title and the long message are hidden
there). That keeps the properties sheet handle above it and tappable, and it
sits below the zoom control (lifted above it if they would meet). While it
shows, the page gains room below its end equal to the bar's height, so the
last content can scroll clear of it. It stacks above the editor's own surfaces (z-index 30)
but below menus, popovers and toolbar flyouts, which therefore always open
over it. Only its buttons take pointer input. `tests/analytics-consent-banner.test.mjs` and
`tests/browser/analytics-consent-banner.spec.ts` (editor at 1280×720,
1440×900 and Pixel 7, and the landing page) cover it. CI builds carry a
measurement id, so `playwright.config.ts` starts every other browser test as
a visitor who already chose "No thanks"; the banner spec clears that and
checks the banner itself. Reproduce CI builds locally with
`VITE_CHEAPLY_GA_MEASUREMENT_ID=G-TEST123 npm run build`.
