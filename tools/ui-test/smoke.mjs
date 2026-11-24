// Smoke test against the in-memory mock backend (no real Supabase needed).
// usage: npm run build && npx vite preview --port 4173 &   then   node tools/ui-test/smoke.mjs [light|dark]
// Screenshots land in tools/ui-test/shots/ (git-ignored). Prints any page errors.
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
const ctx = await browser.newContext({ viewport: { width: 1420, height: 900 } });
const mock = createMock();
await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
await ctx.route(/supabase\.co\/realtime/, r => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime/.test(m.text())) errs.push(m.text()); });

await page.goto(base);
await page.fill('input[name=email]', 'ontrack-test@example.com');
await page.fill('input[name=password]', 'test-password');
await page.click('button[type=submit]');
await page.waitForSelector('aside.side', { timeout: 15000 });
await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
await page.waitForTimeout(1200);

for (const p of ['/my-day', '/projects', '/journal', '/insights', '/settings/work-day']) {
  await page.goto(base + p); await page.waitForSelector('aside.side');
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(800);
  const name = `${theme}-${p.replace(/\//g, '_').slice(1)}`;
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
await browser.close();
