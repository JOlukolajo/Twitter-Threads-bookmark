/**
 * Generates the Chrome Web Store screenshots (1280x800) from the real UI with
 * demo data. Run with: pnpm --filter @saveboard/extension screenshots
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { demoBackup } from './seed';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../store/assets/screenshots');

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to regenerate store screenshots.');

test('store screenshots', async ({ context, appPage }) => {
  const page = await appPage('/x');
  await page.getByTestId('import-input').setInputFiles({ name: 'demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demoBackup({ withFolders: true }))) });
  await expect(page.getByTestId('scope-title')).toContainText('All · 24');
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 6000 });
  await page.screenshot({ path: `${OUT}/2-x-library.png` });

  await page.getByRole('button', { name: 'Gallery view' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-gallery.png` });
  await page.getByRole('button', { name: 'List view' }).click();

  await page.getByTestId('folder-row').filter({ hasText: 'Engineering' }).click();
  await page.getByTestId('post').getByLabel('Select post').nth(0).click();
  await page.getByTestId('post').getByLabel('Select post').nth(1).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/4-folders-bulk.png` });

  await page.getByTestId('switch-mode').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/1-mode-picker.png` });

  await page.getByTestId('mode-threads').click();
  await expect(page.getByTestId('scope-title')).toContainText('All · 14');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/5-threads.png` });

  // The "Add to folder" chip on a stand-in X page.
  await context.route('https://x.com/home', (r) =>
    r.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000;color:#e7e9ea;font:15px system-ui">
      <div style="max-width:600px;margin:0 auto;border-left:1px solid #2f3336;border-right:1px solid #2f3336;min-height:100vh">
      <div style="padding:16px;font-weight:700;font-size:20px;border-bottom:1px solid #2f3336">Home</div>
      ${[0, 1, 2]
        .map(
          (i) => `<article data-testid="tweet" style="padding:12px 16px;border-bottom:1px solid #2f3336;display:flex;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:hsl(${i * 90 + 200} 60% 50%);flex:none"></div>
        <div style="flex:1"><div><b>${['Paul Graham', 'Sarah Chen', 'Devon Park'][i]}</b> <span style="color:#71767b">@${['paulg', 'sarah_designs', 'devon_codes'][i]} · <a style="color:#71767b" href="/u/status/18500000000000${i}"><time>2h</time></a></span></div>
        <div style="margin:4px 0 12px">${['Startups do things that do not scale — and then they make the things that worked scale.', 'Design systems are products, not projects.', 'We migrated 4M rows to Postgres with zero downtime. Here is exactly how.'][i]}</div>
        <div role="group" style="display:flex;justify-content:space-between;color:#71767b;max-width:420px;align-items:center"><span>💬 12</span><span>🔁 48</span><span>♥ 310</span><button data-testid="removeBookmark" style="background:none;border:0;color:#1d9bf0">🔖</button></div></div></article>`,
        )
        .join('')}</div></body></html>`,
    }),
  );
  const site = await context.newPage();
  await site.goto('https://x.com/home');
  const chip = site.locator('[data-saveboard-chip="185000000000001"]');
  await chip.click();
  await site.waitForTimeout(500);
  await site.screenshot({ path: `${OUT}/6-add-to-folder-on-x.png` });
});
