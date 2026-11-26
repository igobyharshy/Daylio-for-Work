// Phone-size smoke test against the in-memory mock backend.
// usage: npm run build && npx vite preview --port 4173 &   then   node tools/ui-test/mobile.mjs [light|dark] [only-step]
// Screenshots land in tools/ui-test/shots/m-*.png. Prints any page errors.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMock } from './mock.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'shots'); fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:4173';
const theme = process.argv[2] || 'light';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const mock = createMock();
await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
await ctx.route(/supabase\.co\/realtime/, r => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime/.test(m.text())) errs.push(m.text()); });
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `m-${theme}-${name}.png`) }); console.log('shot', name); };
const setTheme = () => page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);

await page.goto(base);
await shot('signin');
await page.fill('input[name=email]', 'ontrack-test@example.com');
await page.fill('input[name=password]', 'test-password');
await page.click('button[type=submit]');
await page.waitForSelector('.content', { timeout: 15000 });
await setTheme();
await page.waitForTimeout(1200);

for (const p of ['/my-day', '/projects', '/journal', '/insights', '/settings/work-day']) {
  await page.goto(base + p); await page.waitForSelector('.content'); await setTheme();
  await page.waitForTimeout(700);
  await shot(p.replace(/\//g, '_').slice(1));
}
const tryStep = async (name, fn) => { try { await fn(); await shot(name); } catch (e) { errs.push(`step ${name}: ${e.message.split('\n')[0]}`); } };
const back = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };

await page.goto(base + '/my-day'); await page.waitForSelector('.content'); await setTheme();
await tryStep('board', async () => { await page.click('[aria-label="Board"]'); });
await tryStep('timeline', async () => { await page.click('[aria-label="Timeline"]'); });
await page.click('[aria-label="List"]');
await tryStep('task-open', async () => { await page.locator('.task-row').first().click(); await page.waitForSelector('.sheet'); });
await tryStep('task-project-menu', async () => { await page.locator('.sheet-head .val-btn').click(); });
await back();
await page.click('.sheet [aria-label="Close"]').catch(() => {});
await tryStep('task-menu', async () => { await page.locator('.task-row [aria-label="More"], .task-row .row-more').first().click(); });
await back();
await tryStep('add-task', async () => { await page.click('.add-bar'); await page.keyboard.type('Write spec 30m'); });
await page.keyboard.press('Enter'); await back();
await tryStep('start-timer', async () => {
  const row = page.locator('.task-row').filter({ hasText: 'Write spec' }).first();
  await row.locator('[aria-label^="Start"], [aria-label="Start timer"]').first().click();
});
await tryStep('focus', async () => { await page.click('[aria-label="Focus mode"]'); await page.waitForSelector('.focus'); });
await page.waitForTimeout(4500); await shot('focus-calm');
await back();
await tryStep('mini-player', async () => { await page.goto(base + '/projects'); await page.waitForSelector('.content'); await setTheme(); });
await tryStep('search', async () => { await page.click('[aria-label="Search"]'); });
await back();
await tryStep('profile', async () => { await page.click('[aria-label="Account menu"]'); });
await back();
await tryStep('notifs', async () => { await page.click('[aria-label="Notifications"]'); });
await back();
await tryStep('journal-day', async () => { await page.goto(base + '/journal'); await page.waitForSelector('.content'); await setTheme(); await page.locator('.jcal-day:not(.out):not(.future)').first().click(); });
await back();
await tryStep('project-page', async () => { await page.goto(base + '/projects'); await page.waitForSelector('.content'); await setTheme(); await page.locator('.proj-row, .proj-card').first().click(); });
await tryStep('settings-statuses', async () => { await page.goto(base + '/settings/statuses'); await page.waitForSelector('.content'); await setTheme(); });

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
await browser.close();
