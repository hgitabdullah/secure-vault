/**
 * Capture 1440x900 screenshots of the main screens using the seeded demo
 * account, and fail if any page logs a console error.  Run: node tests/e2e/screenshots.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.E2E_BASE || 'http://localhost:5174';
const OUT = path.resolve(process.env.SHOTS_DIR || '../docs/screenshots');
const exe = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} ${m.text()}`));
page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`));
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  📸', name); };

await page.goto(BASE); await page.getByText('Encrypted. Everywhere.').waitFor(); await shot('01-landing');
await page.goto(`${BASE}/signup`); await page.fill('#name', 'Jo Alex'); await page.fill('#email', 'jo.alex@example.com'); await page.fill('#password', 'correct-horse-battery-42!'); await shot('02-signup');
await page.goto(`${BASE}/login?demo=1`); await shot('03-login');
await page.click('button:has-text("Continue")');
await page.getByTestId('file-card').first().waitFor({ timeout: 30000 });
await shot('04-dashboard');

// Upload modal with real progress rows
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-shots-'));
const files = [['quarterly-report.pdf', 300000], ['meeting-recording.mp4', 2_000_000], ['design-mockups.png', 120000]].map(([n, size]) => {
  const p = path.join(tmp, n); fs.writeFileSync(p, Buffer.alloc(size, 7)); return p;
});
await page.click('main >> button:has-text("Upload")');
await page.getByTestId('file-input').setInputFiles(files);
await page.locator('[data-testid=upload-row] >> text=Done').nth(2).waitFor({ timeout: 30000 });
await shot('05-upload');
await page.click('.modal >> button:has-text("Done")');

// Preview: open an image in the Photos folder
await page.getByTestId('folder-card').filter({ hasText: 'Photos' }).click();
await page.getByTestId('file-card').first().click();
await page.getByTestId('preview-image').waitFor();
await shot('06-preview');
// Share dialog with a created link
await page.click('[data-testid=details-panel] >> button:has-text("Share")');
await page.locator('[role=switch][aria-label="Password protection"]').click();
await page.getByTestId('share-password').fill('client-2026');
await page.fill('#dl-limit', '5'); await page.fill('#share-label', 'Client review');
await page.click('button:has-text("Create link")');
await page.getByTestId('share-url').waitFor();
const shareUrl = await page.getByTestId('share-url').innerText();
await shot('07-share');
await page.click('.modal >> button:has-text("Done")');
await page.click('button[aria-label="Close details"]');

await page.locator('aside.sb').getByRole('link', { name: /^My Files/ }).click();
await page.getByRole('button', { name: 'List view' }).click(); await shot('08-dashboard-list');
await page.getByRole('button', { name: 'Grid view' }).click();
await page.locator('aside.sb').getByRole('link', { name: /^Settings/ }).click();
await page.getByRole('tab', { name: 'Security' }).click();
await page.click('button:has-text("Set up 2FA")'); await page.getByTestId('totp-secret').waitFor();
await shot('09-settings');
await page.getByRole('tab', { name: 'Devices' }).click(); await page.getByTestId('device-row').first().waitFor(); await shot('10-settings-devices');
await page.getByRole('tab', { name: 'Activity' }).click(); await page.getByTestId('activity-row').first().waitFor(); await shot('11-activity');
await page.locator('aside.sb').getByRole('link', { name: /^Shared/ }).click(); await page.getByTestId('share-row').first().waitFor(); await shot('12-shared');
await page.locator('aside.sb').getByRole('link', { name: /^My Files/ }).click();
await page.click('button[aria-label="Toggle theme"]'); await page.getByTestId('file-card').first().waitFor(); await shot('13-dashboard-light');
await page.click('button[aria-label="Toggle theme"]');

const pub = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
pub.on('console', (m) => m.type() === 'error' && errors.push(`public ${m.text()}`));
await pub.goto(shareUrl); await pub.getByTestId('public-name').waitFor(); await pub.waitForTimeout(600);
await pub.screenshot({ path: path.join(OUT, '14-public-share.png') }); console.log('  📸 14-public-share');

await browser.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('All screenshots captured, no console errors.');
