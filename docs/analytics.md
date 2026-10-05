# Cheaply PixelForge analytics

PixelForge uses a dedicated GA4 web stream. The deployment variable
`PIXELFORGE_GA_MEASUREMENT_ID` is passed to Vite as
`VITE_CHEAPLY_GA_MEASUREMENT_ID`; the value is public configuration, not a
secret. An empty variable safely disables analytics.

The browser defaults to denied consent and does not load Google's script or
send a page view until the visitor chooses **Allow**. Only an app-scoped page
view is sent. Photos, projects, file names, account details, and draft content
remain local and are never sent to GA4.
