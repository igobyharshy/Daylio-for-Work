// Repeating tasks + time log + themes: a focused check on desktop and phone.
import { createRequire } from 'node:module';
import { createMock } from './mock.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const out = 'tools/ui-test/shots/';
for (const phone of [false, true]) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1300, height: 860 } });
  const mock = createMock();
  await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
  await ctx.route(/supabase\.co\/realtime/, r => r.abort());
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const tag = phone ? 'p' : 'd';
  const click = sel => phone ? page.locator(sel).first().tap() : page.locator(sel).first().click();
  await page.goto('http://localhost:4173');
  await page.fill('input[name=email]', 'ontrack-test@example.com'); await page.fill('input[name=password]', 'test-password');
  await page.click('button[type=submit]'); await page.waitForSelector('.content'); await page.waitForTimeout(800);
  await click('.add-bar'); await page.keyboard.type('Standup notes daily 15m');
  await page.screenshot({ path: out + `r-${tag}-1-typed.png` });
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  if (phone) await page.locator('.add-scrim').tap().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + `r-${tag}-2-row.png` });
  await click('.task-row:has-text("Standup notes")'); await page.waitForSelector('.sheet');
  await click('.sheet .prop-row:has-text("Repeat") button');
  await page.screenshot({ path: out + `r-${tag}-3-picker.png` });
  await click('.menu-item:has-text("Custom")'); await page.waitForTimeout(300);
  await click('.dialog .seg button:has-text("week")'); await click('.wd-btn[aria-label="Wednesday"]');
  await page.screenshot({ path: out + `r-${tag}-4-custom.png` });
  await click('.dialog .btn:has-text("Done")'); await page.waitForTimeout(300);
  await page.screenshot({ path: out + `r-${tag}-5-drawer.png` });
  // monthly: tap Monthly, pick the 15th on the day calendar
  await click('.sheet .prop-row:has-text("Repeat") button');
  await page.screenshot({ path: out + `r-${tag}-5b-picker-again.png` });
  await click('.menu-item:has-text("Monthly")'); await page.waitForSelector('.md-grid');
  await click('.md-btn:text-is("15")'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + `r-${tag}-5c-monthly.png` });
  await click('.dialog .btn:has-text("Done")'); await page.waitForTimeout(300);
  const rep1 = await page.locator('.sheet .prop-row:has-text("Repeat")').innerText();
  if (!/Monthly on the 15th/.test(rep1)) errs.push('monthly label: ' + rep1);
  // custom: every 3 months on the last day
  await click('.sheet .prop-row:has-text("Repeat") button'); await click('.menu-item:has-text("Custom")'); await page.waitForTimeout(300);
  await click('.dialog [aria-label="More"]'); await click('.dialog [aria-label="More"]');
  await page.waitForSelector('.md-grid'); await click('.md-last');
  await page.screenshot({ path: out + `r-${tag}-5d-custom-months.png` });
  await click('.dialog .btn:has-text("Done")'); await page.waitForTimeout(300);
  const rep2 = await page.locator('.sheet .prop-row:has-text("Repeat")').innerText();
  if (!/Every 3 months on the last day/.test(rep2)) errs.push('custom months label: ' + rep2);
  // set back to daily, then finish it
  await click('.sheet .prop-row:has-text("Repeat") button'); await click('.menu-item:has-text("Daily")'); await page.waitForTimeout(300);
  await click('.sheet .title-row .check'); await page.waitForTimeout(600);
  const tasks = await page.evaluate(() => [...document.querySelectorAll('.task-row .title')].map(x => x.textContent));
  console.log(tag, 'rows after finishing:', tasks.filter(x => x.includes('Standup')).length, 'errors:', errs);
  await page.screenshot({ path: out + `r-${tag}-6-finished.png` });
  // time log: tap a stretch on a started task
  await page.keyboard.press('Escape'); await page.locator('.sheet [aria-label="Close"]').first().click().catch(() => {});
  await click('.task-row:has-text("Export motion")'); await page.waitForSelector('.sheet');
  await page.locator('.log-row').first().scrollIntoViewIfNeeded();
  await click('.log-row'); await page.waitForTimeout(300);
  await page.locator('.log-edit').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + `r-${tag}-7-log-edit.png` });
  await page.goto('http://localhost:4173/settings/appearance'); await page.waitForSelector('.content'); await page.waitForTimeout(500);
  await click('.accent-sw[aria-label="Green"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: out + `r-${tag}-8-appearance.png` });
  await ctx.close();
}
await browser.close();
