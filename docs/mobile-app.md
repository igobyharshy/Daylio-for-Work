# Ontrack on phones + the Android app (26 Nov 2026)

## What it is
- **One app, two shells.** Below 720 px wide the web app switches to a phone layout. The Android app is a
  Capacitor shell that opens the live site (`https://ontrack-harshy.vercel.app`), so phone and PC always run
  the same code against the same Supabase account. Every push to `main` updates the phone app too.
- **Sync:** realtime subscriptions (already in `store.tsx`) merge changes from other devices instantly.
  On phones the app also refetches every time it comes back to the foreground (3 s threshold instead of
  30 s on desktop) and when the network comes back.
- **Desktop is unchanged** (pixel-identical screenshots before/after).

## Phone layout (`src/app/mobile.tsx`, `src/styles/mobile.css`)
- **Top app bar:** brand (→ My Day), search, notifications bell, avatar (account sheet: Settings, Account, theme, sign out).
- **Navigation bar (bottom):** My Day (to-do count), Projects, Journal (reflections count), Insights. Settings lives in the avatar sheet.
- **Mini player:** above the nav bar while a timer runs, on every page except My Day (which has the Now card).
  Pause/resume, Done, tap to open the focus timer.
- **Task drawer and journal day panel** open as full-screen pages.
- **Dialogs** become bottom sheets; **menus and pickers** (every `Popover`) become bottom sheets with a grab handle.
  Anchored suggestion lists (`closeOnOutside={false}`) stay anchored.
- **Touch sizes:** icon buttons 40, buttons 40, rows 56, menu items 48, inputs 16 px text (no zoom on focus).
- Board view: one swipeable column at a time. Journal calendar: compact cells. Settings cards stack.
- Projects list: one line per project (status · open · % done · tags) instead of the wide table.

## Focus timer (`src/features/focus.tsx`)
- On phones the pop-out button (`PopOutBtn`) becomes **Focus mode** (fullscreen icon). Also opens from the mini player
  and from the timer notification.
- Full screen: one big ring + time, task title, project and "done by". Pause/resume (80 px), Done, count up/down, open task.
- Buttons fade after 5 s so it's just the timer; tap anywhere to bring them back.
- Keeps the screen on (KeepAwake plugin in the app, Wake Lock API in browsers) and hides the status/navigation bars.
- Landscape: ring and title side by side.
- Closes itself when the task is finished (here or on another device). Back button closes it.

## Android app (`android/`, `capacitor.config.ts`, `native-shell/`)
- Capacitor 8. App id `app.ontrack.harshy`. `server.url` = live site; `native-shell/offline.html` shows when there's no connection.
- The web app detects the app with `Capacitor.isNativePlatform()` (+ user-agent `OntrackAndroid`) and then skips the
  PWA service worker (it would serve cached pages without the native bridge).
- Plugins: `@capacitor/app` (back button, resume), `@capacitor/local-notifications`, `@capacitor-community/keep-awake`,
  SystemBars (built into core; status-bar icons follow the theme, safe areas via `--safe-area-inset-*`).
- **Back button:** closes focus timer → sheet/menu/dialog → task or day panel → previous page → minimises the app.
- **Notifications:** while a timer runs, a silent ongoing notification ("Running · done by 3:45 pm"); an alert
  ("Estimate is up") is scheduled for when the estimate runs out. Both clear on pause/done. Tapping opens the focus timer.
- Icons: launcher (adaptive, purple + white timer), `ic_stat_timer` notification icon, light splash.

## Building the APK
- GitHub Actions `.github/workflows/android.yml` builds a release APK on pushes to `main` that touch the Android shell
  (`android/**`, `native-shell/**`, `capacitor.config.ts`, package files, the workflow) or when run by hand.
- It publishes a GitHub release `android-<run>`; stable link:
  https://github.com/igobyharshy/Daylio-for-Work/releases/latest/download/Ontrack.apk
- Signing: the keystore is never in git. Add repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` to keep one key; without them each build makes a fresh key, so a newer
  APK needs uninstall → install (data is in the account, so only a sign-in is lost).
- Ordinary web changes do **not** need a new APK.
- Local QA: `node tools/ui-test/mobile.mjs light|dark` (390×844 touch screenshots against the mock backend).

## Not built (ideas)
- A live-ticking timer in the notification shade (needs a small custom native plugin / foreground service).
- Home-screen widget, Play Store listing.
