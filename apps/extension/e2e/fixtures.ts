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

// 1x1 transparent PNG for every media request, so tests never hit the network.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export const test = base.extend<{ context: BrowserContext; extensionId: string; appPage: (hash?: string) => Promise<Page> }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'sb-')), {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await context.route(/https:\/\/(pbs|video)\.twimg\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await context.route(/https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\/.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
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
