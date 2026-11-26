import type { CapacitorConfig } from '@capacitor/cli';

// Ontrack for Android: a native shell around the live web app, so the phone and the PC
// always run the same version against the same account. Pushes to `main` update the app too;
// the APK itself only needs rebuilding when something in android/ or this file changes.
const config: CapacitorConfig = {
  appId: 'app.ontrack.harshy',
  appName: 'Ontrack',
  webDir: 'native-shell',
  server: {
    url: 'https://beingontrack.vercel.app/my-day',
    androidScheme: 'https',
    // every address the app has lived at stays inside the app; anything else opens in the browser.
    // (Without this, a domain redirect sends the whole app out to Chrome.)
    allowNavigation: ['beingontrack.vercel.app', 'ontrack-harshy.vercel.app', 'ontrack-harshy1.vercel.app', 'daylioforwork.vercel.app'],
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#fffbfe',
    // lets the web app know it's inside the Android app even before the native bridge loads
    appendUserAgent: 'OntrackAndroid',
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'DEFAULT' },
    LocalNotifications: { smallIcon: 'ic_stat_timer', iconColor: '#6750A4' },
  },
};

export default config;
