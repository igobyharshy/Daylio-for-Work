import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/app.css';
import './styles/mobile.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { isNative } from './lib/native';

if (isNative) document.documentElement.classList.add('native');

// The Android app always loads the live site through Capacitor, which needs real network loads
// (a service worker would serve a cached page without the native bridge). Browsers keep the PWA.
const inApp = isNative || navigator.userAgent.includes('OntrackAndroid');
if (inApp) navigator.serviceWorker?.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
else registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
