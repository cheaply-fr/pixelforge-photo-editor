import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import HomePage from './HomePage';
import Analytics from './Analytics';
import '../app/globals.css';

const editor = location.pathname === '/editor' || location.hash.startsWith('#draft=');
createRoot(document.getElementById('root')!).render(
  <>
    <Analytics />
    {editor ? <Home /> : <HomePage />}
  </>,
);

// Keep development hot reload independent from the production offline shell.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Offline support is best-effort; editing and local drafts do not depend on it.
    });
  });
}
