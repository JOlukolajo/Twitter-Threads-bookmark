import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');
const CORE_FIXTURES = path.resolve(__dirname, '../../../packages/core/test/fixtures');

export function fixture(name: string): string {
  return readFileSync(path.join(CORE_FIXTURES, name), 'utf8');
}

/** Colourful placeholder image per URL, so tests never hit the network and screenshots look real. */
function placeholder(url: string): { contentType: string; body: string } {
  let h = 0;
  for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 70% 60%)"/><stop offset="1" stop-color="hsl(${b} 70% 45%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="${200 + (h % 400)}" cy="${150 + (h % 300)}" r="${80 + (h % 90)}" fill="white" opacity=".18"/></svg>`;
  return { contentType: 'image/svg+xml', body };
}

export const test = base.extend<{ context: BrowserContext; extensionId: string; appPage: (hash?: string) => Promise<Page> }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'sb-')), {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await context.route(/https:\/\/(pbs|video)\.twimg\.com\/.*/, (r) => r.fulfill({ status: 200, ...placeholder(r.request().url()) }));
    await context.route(/https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\/.*/, (r) => r.fulfill({ status: 200, ...placeholder(r.request().url()) }));
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(new URL(sw.url()).host);
  },
  appPage: async ({ context, extensionId }, use) => {
    await use(async (hash = '/') => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/app.html#${hash}`);
      return page;
    });
  },
});

export { expect } from '@playwright/test';
