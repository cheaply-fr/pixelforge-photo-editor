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
them in the same place); on phones it sits at the top of the canvas stage,
clear of the menus and the properties sheet. Only its buttons take pointer
input. `tests/analytics-consent-banner.test.mjs` and
`tests/browser/analytics-consent-banner.spec.ts` (editor at 1280×720,
1440×900 and Pixel 7, and the landing page) cover it.
