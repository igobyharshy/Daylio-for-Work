// Undo (Ctrl+Z), pasting a list (tasks + steps), phone row details, landscape phone, spell check.
// usage: node tools/ui-test/features.mjs
import { createRequire } from 'node:module';
import { createMock } from './mock.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const out = 'tools/ui-test/shots/f-';
const problems = [];
const expect = (c, m) => { if (!c) problems.push(m); };
async function open(opts) {
  const ctx = await browser.newContext(opts);
  const mock = createMock();
  await ctx.route(/supabase\.co\/(auth|rest)\//, r => mock.handle(r));
  await ctx.route(/supabase\.co\/realtime/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  await page.goto('http://localhost:4173');
  await page.fill('input[name=email]', 'a@b.c'); await page.fill('input[name=password]', 'test-password');
  await page.click('button[type=submit]'); await page.waitForSelector('.content'); await page.waitForTimeout(900);
  return { ctx, page, mock };
}
const paste = (page, sel, text) => page.evaluate(([sel, text]) => {
  const el = document.querySelector(sel); el.focus();
  const dt = new DataTransfer(); dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, [sel, text]);
const titles = page => page.evaluate(() => [...document.querySelectorAll('.task-row .title')].map(x => x.textContent.trim()));
const LIST = '- Draft the outline\n- Collect references\n  * Ask Ravi for logos\n1. Book the meeting room\n\n• Send the agenda';

// ---------- desktop ----------
{
  const { ctx, page, mock } = await open({ viewport: { width: 1300, height: 860 } });
  expect(await page.evaluate(() => document.documentElement.spellcheck), 'spell check not on');
  // paste a list into the composer
  await page.click('.add-bar'); await page.waitForTimeout(200);
  await paste(page, '.add-panel input', LIST); await page.waitForTimeout(200);
  expect(await page.locator('.paste-items li').count() === 5, 'desktop composer preview should list 5, got ' + await page.locator('.paste-items li').count());
  await page.screenshot({ path: out + 'd-1-paste.png' });
  await page.locator('.paste-items li').nth(2).locator('button').click(); // leave one out
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  let t = await titles(page);
  for (const x of ['Draft the outline', 'Collect references', 'Book the meeting room', 'Send the agenda']) expect(t.includes(x), 'missing pasted task ' + x);
  expect(!t.includes('Ask Ravi for logos'), 'removed line was still added');
  await page.screenshot({ path: out + 'd-2-added.png' });
  // Ctrl+Z takes back the whole paste (one step)
  await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 700, y: 20 } }); await page.waitForTimeout(900);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
  t = await titles(page);
  expect(!t.includes('Draft the outline') && !t.includes('Send the agenda'), 'undo did not remove the pasted tasks');
  expect(!mock.db.tasks.some(r => r.title === 'Draft the outline'), 'undo did not delete pasted tasks in the database');
  await page.screenshot({ path: out + 'd-3-undo.png' });
  // redo brings them back
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(700);
  t = await titles(page);
  expect(t.includes('Draft the outline'), 'redo did not bring the tasks back');
  expect(mock.db.tasks.some(r => r.title === 'Draft the outline'), 'redo not saved');
  // several steps: finish a task, then delete another; undo twice restores both
  const first = (await titles(page)).find(x => x === 'Client A: homepage hero');
  await page.locator('.task-row:has-text("Client A: homepage hero") .check').click(); await page.waitForTimeout(1000);
  await page.locator('.task-row:has-text("Reply to studio emails")').click(); await page.waitForSelector('.drawer, .sheet');
  await page.locator('[aria-label="Delete task"]').first().click().catch(() => problems.push('no delete button in drawer'));
  await page.waitForTimeout(400);
  const dlg = page.locator('.dialog .btn:has-text("Delete")'); if (await dlg.count()) await dlg.first().click();
  await page.waitForTimeout(1000);
  await page.locator('body').click({ position: { x: 700, y: 20 } }); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  expect(!(await titles(page)).includes('Reply to studio emails'), 'delete did not happen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  expect((await titles(page)).includes('Reply to studio emails'), 'undo did not restore the deleted task');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  const doneNow = await page.evaluate(() => !!document.querySelector('.task-row.done .title') && [...document.querySelectorAll('.task-row.done .title')].some(x => x.textContent.includes('Client A')));
  expect(first && !doneNow, 'second undo did not reopen the finished task');
  await page.screenshot({ path: out + 'd-4-undo2.png' });
  await page.waitForTimeout(7500); // past the delete undo window: the restored task must survive
  expect(mock.db.tasks.some(r => r.title === 'Reply to studio emails'), 'restored task was deleted after the undo window');
  // Ctrl+Z inside a text box is normal text undo, not app undo
  await page.click('.add-bar'); await page.keyboard.type('abc'); await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  expect((await titles(page)).includes('Draft the outline'), 'Ctrl+Z in a text box triggered app undo');
  await page.keyboard.press('Escape');
  // steps: paste a list into "Add a step"
  await page.locator('.task-row:has-text("Draft the outline")').click(); await page.waitForTimeout(500);
  await paste(page, 'input[aria-label="Add a step"]', 'Intro\nMain points\nWrap up'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + 'd-5-steps-paste.png' });
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  expect(await page.locator('.step-row').count() === 3, 'steps added: ' + await page.locator('.step-row').count());
  await ctx.close();
}

// ---------- phone ----------
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.screenshot({ path: out + 'p-1-rows-default.png' });
  const line = await page.locator('.task-row.phone:has-text("Follow up with Ravi") .line').innerText().catch(() => '');
  expect(/Brand refresh/.test(line), 'phone row should show the project by default: ' + line);
  // view options: hide project, show steps, move due first
  await page.locator('.ibtn[aria-label="View and filter"]').first().tap().catch(() => problems.push('no view options button'));
  await page.waitForSelector('.rf-list');
  await page.screenshot({ path: out + 'p-2-view-options.png' });
  await page.locator('[aria-label="Move due up"]').tap(); await page.locator('[aria-label="Move due up"]').tap();
  await page.locator('[aria-label="Hide project"]').tap();
  await page.locator('[aria-label="Show steps"]').tap();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + 'p-3-view-options-changed.png' });
  await page.keyboard.press('Escape'); await page.locator('.scrim').first().tap().catch(() => {}); await page.waitForTimeout(400);
  const line2 = await page.locator('.task-row.phone:has-text("Follow up with Ravi") .line').innerText().catch(() => '');
  expect(!/Brand refresh/.test(line2), 'project still shown after hiding: ' + line2);
  expect(/^Overdue|^Due|^Today|^Tomorrow/i.test(line2.trim()), 'due should come first now: ' + line2);
  await page.screenshot({ path: out + 'p-4-rows-changed.png' });
  // paste a list in the phone composer
  await page.locator('.fab, .add-bar').first().tap(); await page.waitForTimeout(300);
  await paste(page, '.add-panel input', 'Milk\nEggs\nBread'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + 'p-5-paste.png' });
  await page.locator('.add-panel .send').tap(); await page.waitForTimeout(800);
  for (const x of ['Milk', 'Eggs', 'Bread']) expect((await titles(page)).includes(x), 'phone paste missing ' + x);
  await ctx.close();
}

// ---------- phone held sideways in a browser: keeps the phone layout ----------
{
  const { ctx, page } = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  expect(await page.locator('.bottom-nav, .bnav, nav.bottom').count() > 0 || await page.locator('.task-row.phone').count() > 0, 'landscape phone switched to the PC layout');
  await page.screenshot({ path: out + 'p-6-landscape.png' });
  await ctx.close();
}
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no problems');
await browser.close();
