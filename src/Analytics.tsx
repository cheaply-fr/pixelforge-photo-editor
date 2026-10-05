import { useEffect } from 'react';

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
  const dataLayer = (page.dataLayer ||= []);
  const gtag = (...args: unknown[]) => dataLayer.push(args);
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
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
  gtag('event', 'page_view', {
    app_name: APP_NAME,
    page_location: location.origin,
  });
}

export default function Analytics() {
  useEffect(() => {
    const id = String(import.meta.env.VITE_CHEAPLY_GA_MEASUREMENT_ID || '').trim();
    if (!validId(id)) return;

    const setConsent = (value: 'granted' | 'denied') => {
      store(value);
      if (value === 'granted') load(id);
      document.getElementById('cheaply-analytics-consent')?.remove();
    };
    const page = window as AnalyticsWindow;
    page.cheaplyAnalytics = {
      grantConsent: () => setConsent('granted'),
      denyConsent: () => setConsent('denied'),
    };
    const onConsent = (event: Event) => {
      const granted = (event as CustomEvent<{ analytics?: boolean }>).detail?.analytics;
      if (granted === true) setConsent('granted');
      if (granted === false) setConsent('denied');
    };
    window.addEventListener('cheaply:analytics-consent', onConsent);
    const value = consent();
    if (value === 'granted') {
      load(id);
    } else if (!value) {
      const banner = document.createElement('aside');
      banner.id = 'cheaply-analytics-consent';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', 'Analytics consent');
      banner.innerHTML =
        '<strong>Help improve Cheaply Photo Editor</strong><p>Allow anonymous usage statistics to improve PixelForge. Your photos, projects, and file names never leave this device.</p><div><button type="button" data-choice="deny">No thanks</button><button type="button" data-choice="accept">Allow</button></div>';
      banner.style.cssText =
        'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:1000;max-width:34rem;padding:1rem;border:1px solid #d8dee8;border-radius:12px;background:#fff;color:#172033;box-shadow:0 10px 30px #17203322;font:14px system-ui,sans-serif';
      banner.querySelector('[data-choice="deny"]')?.addEventListener('click', () => setConsent('denied'));
      banner.querySelector('[data-choice="accept"]')?.addEventListener('click', () => setConsent('granted'));
      document.body.append(banner);
    }
    return () => {
      window.removeEventListener('cheaply:analytics-consent', onConsent);
      if (page.cheaplyAnalytics) delete page.cheaplyAnalytics;
    };
  }, []);
  return null;
}
