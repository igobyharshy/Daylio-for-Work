// Deep phone walkthrough: every page plus the main interactions, at 390×844 (touch).
// usage: npm run build && npx vite preview --port 4173 &   then   node tools/ui-test/mobile-deep.mjs [light|dark]
// Shots: tools/ui-test/shots/d-<theme>-NN-name.png. Prints page errors and failed steps.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMock } from './mock.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'shots'); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.startsWith('d-')) fs.unlinkSync(path.join(out, f));
const base = process.env.BASE || 'http://localhost:4173';
const theme = process.argv[2] || 'light';
const only = process.argv[3];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const mock = createMock();
await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
await ctx.route(/supabase\.co\/realtime/, r => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime/.test(m.text())) errs.push('console: ' + m.text()); });
let n = 0;
const shot = async name => { await page.waitForTimeout(350); n++; await page.screenshot({ path: path.join(out, `d-${theme}-${String(n).padStart(2, '0')}-${name}.png`) }); };
const setTheme = () => page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
const go = async p => { await page.goto(base + p); await page.waitForSelector('.content'); await setTheme(); await page.waitForTimeout(500); };
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
const tap = sel => page.locator(sel).first().tap({ timeout: 4000 });
const step = async (name, fn) => {
  if (only && !name.startsWith(only)) return;
  try { await fn(); await shot(name); } catch (e) { errs.push(`step ${name}: ${e.message.split('\n')[0]}`); await shot(name + '-FAILED'); }
};
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
/** hold at (x,y) for `hold` ms, then slide to (x2,y2) in steps and lift */
const touchDrag = async (x, y, x2, y2, hold = 520, steps = 12) => {
  await touch('touchStart', [[x, y]]); await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x + (x2 - x) * i / steps, y + (y2 - y) * i / steps]]); await page.waitForTimeout(30); }
  await touch('touchEnd', []); await page.waitForTimeout(400);
};
const center = async sel => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const closeSheet = async () => { await page.locator('.sheet [aria-label="Close"]').first().tap({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(250); };
const tall = async (name, h = 2200) => { await page.setViewportSize({ width: 390, height: h }); await page.waitForTimeout(400); await shot(name); await page.setViewportSize({ width: 390, height: 844 }); };

await page.goto(base);
await page.fill('input[name=email]', 'ontrack-test@example.com');
await page.fill('input[name=password]', 'test-password');
await page.click('button[type=submit]');
await page.waitForSelector('.content', { timeout: 15000 });
await setTheme();

// ---------- My Day ----------
await go('/my-day');
await step('myday', async () => {});
await step('myday-tall', async () => { await tall('myday-full'); });
await step('add-open', async () => { await tap('.add-bar'); });
await step('add-typed', async () => { await page.keyboard.type('Call Ravi tomorrow 30m'); });
await step('add-kb', async () => { await page.setViewportSize({ width: 390, height: 500 }); });
await page.setViewportSize({ width: 390, height: 844 });
await step('add-due', async () => { await tap('.add-panel .chip:has-text("Tomorrow"), .add-panel .chip:has-text("today")'); });
await esc();
await step('add-est', async () => { await tap('.add-panel .chip:has-text("30m"), .add-panel .chip:has-text("Estimate")'); });
await esc();
await step('add-submit', async () => { await tap('.add-panel .send'); });
await page.locator('.add-scrim').tap().catch(() => {});

// task drawer + its pickers
await step('drawer', async () => { await tap('.task-row:has-text("Reply to studio")'); await page.waitForSelector('.sheet'); });
await step('drawer-tall', async () => { await tall('drawer-full', 1500); });
const row = async (label) => { await page.locator('.sheet .prop-row', { hasText: label }).first().locator('button').first().tap({ timeout: 4000 }); };
await step('drawer-status', async () => { await row('Status'); }); await esc();
await step('drawer-due', async () => { await row('Due'); }); await esc();
await step('drawer-estimate', async () => { await row('Estimate'); }); await esc();
await step('drawer-remind', async () => { await row('Remind'); }); await esc();
await step('drawer-step', async () => { await tap('.sheet .step-add input'); await page.keyboard.type('First step'); await page.keyboard.press('Enter'); });
await step('drawer-more', async () => { await tap('.sheet [aria-label="Task options"]'); }); await esc();
await step('drawer-start', async () => { await tap('.sheet .start-block'); });
await closeSheet();
await step('estimate-first', async () => { await page.locator('.task-row:has-text("Follow up") .play, .task-row:has-text("Follow up") [aria-label="Start timer"]').first().tap(); });
await esc();
await step('runcard', async () => { await page.evaluate(() => document.querySelector('.main')?.scrollTo(0, 0)); });
await step('runcard-tap-opens-task', async () => { await tap('.run-card .rc-top'); await page.waitForSelector('.sheet', { timeout: 3000 }); });
await closeSheet();
await step('longpress-menu', async () => { const [x, y] = await center('.task-row:has-text("Client A")'); await touch('touchStart', [[x, y]]); await page.waitForTimeout(600); await touch('touchEnd', []); await page.waitForTimeout(400); }); await esc();
await step('touch-drag-reorder', async () => { const [x, y] = await center('.task-row:has-text("Reply to studio")'); const [, y2] = await center('.task-row:has-text("Client A")'); await touchDrag(x - 60, y, x - 60, y2 - 20); });
await step('touch-drag-to-group', async () => { const [x, y] = await center('.task-row:has-text("Client A")'); const [, y2] = await center('.group-head:has-text("In progress")'); await touchDrag(x - 60, y, x - 60, y2 + 40); });
await step('touch-scroll-not-drag', async () => { const [x, y] = await center('.task-row'); await touchDrag(x, y, x, y - 200, 40, 8); });
await step('view-sheet', async () => { await tap('[aria-label="View and filter"]'); });
await step('filter', async () => { await tap('.view-opts [aria-label="Filter tasks"]'); }); await esc(); await esc();

// board
await step('board', async () => { await tap('[aria-label="View and filter"]'); await tap('[aria-label="Board"]'); await esc(); });
await step('board-swipe', async () => { await page.evaluate(() => { const b = document.querySelector('.board'); if (b) b.scrollLeft = b.clientWidth * 0.85; }); });

// timeline
await step('timeline', async () => { await tap('[aria-label="View and filter"]'); await tap('[aria-label="Timeline"]'); await esc(); });
await step('timeline-tall', async () => { await tall('timeline-full', 1600); });
await step('timeline-scroll', async () => { await page.evaluate(() => { const s = document.querySelector('.tl-scroll'); if (s) s.scrollLeft += 200; }); });
await step('timeline-plan-next', async () => { await tap('.tl-chip [aria-label="Plan in the next free slot"]'); });
await step('timeline-bar-drag', async () => { const [x, y] = await center('.tl-bar.plan'); await touch('touchStart', [[x, y]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[x + i * 8, y]]); await page.waitForTimeout(30); } await touch('touchEnd', []); await page.waitForTimeout(400); });
await step('timeline-bar-tap', async () => { await tap('.tl-bar.act'); }); await closeSheet(); await esc();
await step('timeline-add-block', async () => { await tap('.tl-toolbar .btn:has-text("Meeting"), .tl-toolbar [aria-label*="eeting"]'); });
await esc();
await step('timeline-next-day', async () => { await tap('[aria-label="Next day"]'); });
await step('timeline-actual', async () => { await tap('.tl-toolbar .seg button:has-text("Actual")'); });
await tap('[aria-label="View and filter"]').catch(() => {}); await tap('[aria-label="List"]').catch(() => {}); await esc();

// focus timer
await step('board-touch-drag', async () => { await tap('[aria-label="View and filter"]'); await tap('[aria-label="Board"]'); await esc(); const [x, y] = await center('.board-col .kcard'); await touchDrag(x, y, x + 280, y + 40); });
await tap('[aria-label="View and filter"]').catch(() => {}); await tap('[aria-label="List"]').catch(() => {}); await esc();
await step('focus', async () => { await go('/my-day'); await tap('.run-card .btn.text'); await page.waitForSelector('.focus'); });
await step('focus-landscape', async () => { await page.setViewportSize({ width: 844, height: 390 }); });
await page.setViewportSize({ width: 390, height: 844 }); await esc();

// ---------- Projects ----------
await go('/projects');
await step('projects', async () => {});
await step('projects-more', async () => { await tap('.proj-row [aria-label="More"], .proj-row .ibtn'); }); await esc();
await step('projects-new', async () => { await tap('.page-head .btn:has-text("New"), [aria-label="New project"]'); }); await esc();
await step('project-page', async () => { await tap('.proj-row:has-text("Client")'); });
await step('project-page-tall', async () => { await tall('project-full', 1600); });
await step('project-dates', async () => { await tap('.content .select-btn.outlined'); }); await esc();
await step('project-more', async () => { await tap('.page-head [aria-label="More"], .page-head .ibtn:has(svg)'); }); await esc();

// ---------- Journal ----------
await go('/journal');
await step('journal', async () => {});
await step('journal-tall', async () => { await tall('journal-full', 1600); });
await step('journal-new', async () => { await tap('.fab'); });
await step('journal-new-tall', async () => { await tall('journal-new-full', 1400); });
await step('journal-write', async () => { await tap('.sheet textarea'); await page.keyboard.type('Brief took longer because the client changed scope.'); await tap('.sheet .btn:has-text("Save")'); });
await closeSheet();
await step('journal-day', async () => { await tap('.jcal-day:not(.out):not(.future)'); });
await closeSheet();
await step('checkin-continue', async () => { await tap('.checkin-bar .btn, .content .btn:has-text("Continue")'); });
await closeSheet();
await step('journal-list', async () => { await tap('.page-head [aria-label="List"], .page-head .seg button:nth-child(2)'); });
await step('journal-review', async () => { await go('/journal/review'); });
await step('review-write', async () => { await tap('.content textarea'); await page.keyboard.type('Scope creep, will pad estimates.'); });

// ---------- Insights / settings / search / notifications ----------
await step('insights', async () => { await go('/insights'); });
await step('insights-tall', async () => { await tall('insights-full', 2400); });
for (const tab of ['work-day', 'default-tags', 'trackers', 'statuses', 'notifications', 'account']) {
  await step('settings-' + tab, async () => { await go('/settings/' + tab); await tall('settings-' + tab + '-full', 1500); });
}
await step('search', async () => { await go('/my-day'); await tap('[aria-label="Search"]'); await page.keyboard.type('re'); }); await esc();
await step('notifs', async () => { await tap('[aria-label="Notifications"]'); }); await esc();
await step('profile', async () => { await tap('[aria-label="Account menu"]'); }); await esc();
await step('mini-player', async () => { await go('/insights'); });
await step('delete-undo', async () => { await go('/my-day'); await tap('[aria-label="View and filter"]'); await tap('[aria-label="List"]'); await esc(); await tap('.task-row:has-text("Reply to studio")'); await tap('.sheet [aria-label="Delete task"]'); });
await step('settings-status-menu', async () => { await go('/settings/statuses'); await tap('.content [aria-label*="options"], .content .ibtn'); }); await esc();
await step('projects-normal-more', async () => { await go('/projects'); await page.locator('.proj-row:has-text("Motion") .ibtn').first().tap(); }); await esc();
await step('project-archive', async () => { await page.locator('.proj-row:has-text("Motion") .ibtn').first().tap(); await tap('.menu-item:has-text("Archive")'); });

console.log(errs.length ? 'PROBLEMS:\n' + errs.join('\n') : 'no problems');
await browser.close();
