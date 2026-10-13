/**
 * End-to-end browser test (Playwright, real Chromium):
 *   register → save recovery key → upload (multi-chunk + text) → preview →
 *   download & decrypt (byte-exact check) → create password share link →
 *   open link in a fresh browser → public download & decrypt (byte-exact) →
 *   wrong password rejected → checks the browser console stays error-free.
 *
 * Requires API on :5100 and Vite on :5174.  Run: npm run e2e
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.E2E_BASE || 'http://localhost:5174';
const exe = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-e2e-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let passed = 0; let failed = 0;
const errors = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); passed++; console.log(`  ✓ ${name} (${Date.now() - t}ms)`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); await globalThis.__page?.screenshot({ path: '/tmp/e2e-fail.png' }).catch(() => {}); throw e; }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const watch = (page, label) => {
  page.on('console', (m) => {
    // The only expected network error: the deliberate wrong-password attempt (401) on the public page.
    const expected = label === 'public' && /status of 401/.test(m.text());
    if (m.type() === 'error' && !expected) errors.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
};

// Test files: 10 MiB random binary (2 chunks) + a text file.
const big = crypto.randomBytes(10 * 1024 * 1024 + 123);
const bigPath = path.join(tmp, 'big-archive.bin'); fs.writeFileSync(bigPath, big);
const txt = Buffer.from('Hello from the SecureVault e2e test ✓\nLine 2\n');
const txtPath = path.join(tmp, 'notes.txt'); fs.writeFileSync(txtPath, txt);

const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage(); watch(page, 'owner'); globalThis.__page = page;
const email = `e2e-${Date.now()}@example.com`;
const password = 'Correct-Horse-42!';
let shareUrl;

console.log('SecureVault e2e');
try {
  await step('landing page renders', async () => {
    await page.goto(BASE);
    await page.getByText('Encrypted. Everywhere.').waitFor();
  });
  await step('register + recovery key', async () => {
    await page.goto(`${BASE}/signup`);
    await page.fill('#name', 'E2E Tester'); await page.fill('#email', email); await page.fill('#password', password);
    await page.click('#ack');
    await page.click('button:has-text("Create secure vault")');
    await page.getByTestId('recovery-key').waitFor({ timeout: 30000 });
    const words = await page.getByTestId('recovery-key').locator('div').count();
    assert(words === 13, `expected 13 key groups, got ${words}`);
    await page.click('#saved-switch');
    await page.click('button:has-text("Continue to my vault")');
    await page.getByTestId('page-title').waitFor();
  });
  await step('upload multi-chunk binary + text file', async () => {
    await page.click('main >> button:has-text("Upload")');
    await page.getByTestId('file-input').setInputFiles([bigPath, txtPath]);
    await page.locator('[data-testid=upload-row] >> text=Done').nth(1).waitFor({ timeout: 60000 });
    await page.click('button:has-text("Done")');
    await page.getByTestId('file-card').filter({ hasText: 'big-archive.bin' }).waitFor();
    await page.getByTestId('file-card').filter({ hasText: 'notes.txt' }).waitFor();
  });
  await step('preview decrypts text in browser', async () => {
    await page.getByTestId('file-card').filter({ hasText: 'notes.txt' }).click();
    await page.getByTestId('preview-text').waitFor();
    const t = await page.getByTestId('preview-text').innerText();
    assert(t.includes('Hello from the SecureVault e2e test'), 'preview text mismatch');
    await page.click('button[aria-label="Close details"]');
  });
  await step('download + decrypt is byte-exact (2 chunks)', async () => {
    await page.getByTestId('file-card').filter({ hasText: 'big-archive.bin' }).click();
    await page.getByTestId('details-panel').waitFor();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-testid=details-panel] >> button:has-text("Download")')]);
    const out = fs.readFileSync(await dl.path());
    assert(out.length === big.length, `size ${out.length} != ${big.length}`);
    assert(sha(out) === sha(big), 'sha256 mismatch');
  });
  await step('create password-protected share link', async () => {
    await page.click('[data-testid=details-panel] >> button:has-text("Share")');
    await page.locator('[role=switch][aria-label="Password protection"]').click();
    await page.getByTestId('share-password').fill('link-pass-1');
    await page.click('button:has-text("Create link")');
    await page.getByTestId('share-url').waitFor({ timeout: 30000 });
    shareUrl = await page.getByTestId('share-url').innerText();
    assert(/\/s\/[A-Za-z0-9_-]+#k=/.test(shareUrl), `bad share url ${shareUrl}`);
    await page.click('button:has-text("Done")');
  });
  await step('public page: wrong password rejected, right password decrypts byte-exact', async () => {
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p2 = await anon.newPage(); watch(p2, 'public');
    await p2.goto(shareUrl);
    await p2.getByTestId('public-name').waitFor();
    assert((await p2.getByTestId('public-name').innerText()) === 'big-archive.bin', 'public filename not decrypted');
    await p2.getByTestId('public-password').fill('wrong');
    await p2.click('button:has-text("Decrypt & download")');
    await p2.getByText('Incorrect password').waitFor({ timeout: 30000 });
    await p2.getByTestId('public-password').fill('link-pass-1');
    const [dl] = await Promise.all([p2.waitForEvent('download', { timeout: 60000 }), p2.click('button:has-text("Decrypt & download")')]);
    const out = fs.readFileSync(await dl.path());
    assert(sha(out) === sha(big), 'public download sha mismatch');
    await anon.close();
  });
  await step('navigate Shared, Recent, Trash, Settings tabs (in-app, vault stays unlocked)', async () => {
    const nav = async (label, expect) => {
      await page.locator('aside.sb').getByRole('link', { name: new RegExp(`^${label}`) }).click();
      await page.getByText(expect).first().waitFor({ timeout: 10000 });
    };
    if (await page.getByTestId('details-panel').isVisible()) await page.click('button[aria-label="Close details"]');
    await nav('Shared', 'Shared links');
    assert(await page.getByTestId('share-row').count() === 1, 'expected 1 share row');
    await nav('Recent', 'Recent');
    await nav('Trash', 'Trash is empty');
    await nav('Settings', 'Full name');
    for (const [tab, expect] of [['Security', 'Two-factor authentication'], ['Devices', 'Signed-in devices'], ['Activity', 'Activity log'], ['Appearance', 'Theme']]) {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByText(expect).first().waitFor({ timeout: 10000 });
      if (tab === 'Activity') await page.getByTestId('activity-row').nth(3).waitFor({ timeout: 10000 });
      if (tab === 'Devices') await page.getByText('This device').waitFor();
    }
  });
  await step('reload locks the vault; unlock with password restores it', async () => {
    await page.goto(`${BASE}/app`);
    await page.getByText('Unlock your vault').waitFor();
    await page.fill('#password', password);
    await page.click('button:has-text("Unlock")');
    await page.getByTestId('file-card').first().waitFor();
  });
  await step('no browser console errors', async () => { assert(errors.length === 0, errors.join('\n')); });
} catch { /* reported above */ }
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
