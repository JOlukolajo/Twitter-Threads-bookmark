// Renders store/assets/icon.svg to the PNG sizes browsers and stores need.
// Usage: pnpm --filter @saveboard/extension icons
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const svg = readFileSync(path.join(root, 'store/assets/icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(path.join(root, 'apps/extension/public/icon'), { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  const png = await page.screenshot({ omitBackground: true });
  writeFileSync(path.join(root, `apps/extension/public/icon/${size}.png`), png);
}
// Store promo tile (440x280).
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;gap:22px;padding:0 36px;box-sizing:border-box;
  background:linear-gradient(135deg,#0b1220,#1e1b4b);color:#fff;font:600 15px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  h1{font-size:34px;margin:0 0 8px}p{margin:0;opacity:.85;font-weight:500}</style>
  ${svg.replace('<svg ', '<svg width="112" height="112" style="flex:none" ')}<div><h1>Saveboard</h1><p>Folders, search and downloads for your X bookmarks and Threads saves.</p></div>`);
writeFileSync(path.join(root, 'store/assets/promo-440x280.png'), await page.screenshot());
await browser.close();
console.log('Icons rendered.');
