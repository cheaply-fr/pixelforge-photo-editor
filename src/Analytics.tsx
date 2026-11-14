import { useEffect } from 'react';
import { CONSENT_BANNER_ID, showConsentBanner } from './analyticsConsentBanner';

const CONSENT_KEY = 'cheaply.analytics.consent.v1';
const APP_NAME = 'cheaply-pixelforge';

type AnalyticsWindow = Window & {
  __cheaplyGaMeasurementId?: string;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  cheaplyAnalytics?: { grantConsent: () => void; denyConsent: () => void };
};

function validId(id: string) {
  return /^G-[A-Z0-9]+$/i.test(id);
}

function consent() {
  try {
    return localStorage.getItem(CONSENT_KEY) || '';
  } catch {
    return '';
  }
}

function store(value: 'granted' | 'denied') {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Respect this page's choice even if storage is unavailable.
  }
}

function load(id: string) {
  const page = window as AnalyticsWindow;
  if (!validId(id) || page.__cheaplyGaMeasurementId === id) return;
  page.__cheaplyGaMeasurementId = id;
  // Assign the queue explicitly so the production transform cannot reduce
  // this to a private local fallback that Google’s loader cannot observe.
  const dataLayer = page.dataLayer || [];
  page.dataLayer = dataLayer;
  // Google’s loader consumes the array-like `arguments` object pushed by the
  // canonical gtag snippet. Pushing a rest-parameter array looks equivalent,
  // but the loader silently ignores those entries and no `g/collect` request
  // is emitted. Keep the canonical queue shape while retaining our typed API.
  // eslint-disable-next-line prefer-rest-params
  const gtag = function gtag(..._args: unknown[]) {
    void _args;
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  page.gtag = gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_flags: 'SameSite=Lax;Secure',
    cookie_domain: 'none',
  });
  const script = document.createElement('script');
  script.async = true;
  script.src =
    'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.append(script);
  gtag('event', 'page_view', {
    app_name: APP_NAME,
    page_location: location.origin,
  });
}

export default function Analytics() {
  useEffect(() => {
    const id = String(
      import.meta.env.VITE_CHEAPLY_GA_MEASUREMENT_ID || '',
    ).trim();
    if (!validId(id)) return;

    let stopPlacing = () => {};
    const setConsent = (value: 'granted' | 'denied') => {
      store(value);
      if (value === 'granted') load(id);
      stopPlacing();
      document.getElementById(CONSENT_BANNER_ID)?.remove();
    };
    const page = window as AnalyticsWindow;
    page.cheaplyAnalytics = {
      grantConsent: () => setConsent('granted'),
      denyConsent: () => setConsent('denied'),
    };
    const onConsent = (event: Event) => {
      const granted = (event as CustomEvent<{ analytics?: boolean }>).detail
        ?.analytics;
      if (granted === true) setConsent('granted');
      if (granted === false) setConsent('denied');
    };
    window.addEventListener('cheaply:analytics-consent', onConsent);
    const value = consent();
    if (value === 'granted') {
      load(id);
    } else if (!value) {
      stopPlacing = showConsentBanner(setConsent);
    }
    return () => {
      window.removeEventListener('cheaply:analytics-consent', onConsent);
      stopPlacing();
      document.getElementById(CONSENT_BANNER_ID)?.remove();
      if (page.cheaplyAnalytics) delete page.cheaplyAnalytics;
    };
  }, []);
  return null;
}
