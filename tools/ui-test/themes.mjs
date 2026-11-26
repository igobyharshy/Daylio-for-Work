// Screenshot every colour theme in light + dark (phone size, My Day with a running timer).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createMock } from './mock.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const ids = ['purple', 'blue', 'teal', 'green', 'olive', 'amber', 'orange', 'rose', 'brown', 'slate', 'mono', 'midnight'];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
const mock = createMock();
await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
await ctx.route(/supabase\.co\/realtime/, r => r.abort());
const page = await ctx.newPage();
await page.goto('http://localhost:4173');
await page.fill('input[name=email]', 'ontrack-test@example.com'); await page.fill('input[name=password]', 'test-password');
await page.click('button[type=submit]'); await page.waitForSelector('.content'); await page.waitForTimeout(800);
await page.locator('.task-row:has-text("Reply to studio") [aria-label="Start timer"]').first().tap().catch(() => {});
await page.waitForTimeout(500);
fs.mkdirSync('tools/ui-test/shots', { recursive: true });
for (const mode of ['light', 'dark']) for (const id of ids) {
  await page.evaluate(([id, mode]) => { const h = document.documentElement; h.dataset.theme = mode; if (id === 'purple') delete h.dataset.accent; else h.dataset.accent = id; }, [id, mode]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `tools/ui-test/shots/t-${mode}-${id}.png` });
}
await browser.close();
