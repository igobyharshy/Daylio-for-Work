# Ontrack

Promise a time. Keep it. Learn when you don’t.

Ontrack is a personal task timer and journal. Every task gets an **estimate**, the timer counts that estimate down, and when a task runs over you write a line about what happened. Daily check-ins and trackers (sleep, energy, severity, cause…) feed **Insights → Patterns**.

Design source: Penpot file “Daylio for Work”, page **Hi-fi v1 · Material 3 New**.

## Stack
- React 19 + TypeScript, Vite, React Router
- Supabase (Postgres + Auth, email & password, row-level security per user)
- Plain CSS with Material 3 tokens (`src/styles/tokens.css`)
- PWA (installable on Windows; Windows notifications while the app is open)

## Run locally
```
npm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm run dev
```

## Accounts
Sign-up is off. Accounts are created in Supabase → Authentication → Users → Add user (tick *Auto Confirm User*).

## Deploy
Vercel builds every branch as a preview; `main` is production.
