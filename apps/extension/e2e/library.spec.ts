import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { expect, test } from './fixtures';
import { demoBackup } from './seed';

async function importDemo(page: import('@playwright/test').Page) {
  await page.getByTestId('import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demoBackup())) });
  await expect(page.getByRole('status')).toContainText('Imported 38 new');
}

test('library: folders, drag and drop, search, bulk move, gallery, exports', async ({ appPage }) => {
  const page = await appPage('/x');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await importDemo(page);
  await expect(page.getByTestId('scope-title')).toContainText('All · 24');

  // Create a folder from the sidebar.
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Design');
  await page.getByLabel('Folder name').press('Enter');
  const design = page.getByTestId('folder-row').filter({ hasText: 'Design' });
  await expect(design).toBeVisible();

  // Drag a post onto the folder.
  await page.getByTestId('post').first().dragTo(design);
  await expect(page.getByRole('status')).toContainText('Added 1 post');
  await expect(design).toContainText('1');

  // Search.
  await page.getByLabel('Search').fill('rust');
  await expect(page.getByTestId('scope-title')).toContainText('All · 2');
  await page.getByLabel('Search').fill('');

  // Select two posts and move them into the folder.
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Later');
  await page.getByLabel('Folder name').press('Enter');
  const boxes = page.getByTestId('post').getByLabel('Select post');
  await boxes.nth(1).click();
  await boxes.nth(2).click();
  await expect(page.getByTestId('bulk-bar')).toContainText('2 selected');
  await page.getByTestId('bulk-bar').getByRole('button', { name: 'Move to' }).click();
  await page.getByRole('menuitem', { name: 'Later' }).click();
  await page.getByTestId('folder-row').filter({ hasText: 'Later' }).click();
  await expect(page.getByTestId('scope-title')).toContainText('Later · 2');

  // Unfiled excludes filed posts.
  await page.getByRole('button', { name: /Unfiled/ }).click();
  await expect(page.getByTestId('scope-title')).toContainText('Unfiled · 21');

  // Filters: videos only.
  await page.getByRole('button', { name: /All/ }).first().click();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Media type').selectOption('video');
  await expect(page.getByTestId('scope-title')).toContainText('All · 4');
  await page.getByLabel('Media type').selectOption('any');

  // Gallery view.
  await page.getByRole('button', { name: 'Gallery view' }).click();
  await expect(page.getByTestId('gallery').locator('img').first()).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();

  // Markdown export of the current view.
  await page.getByTestId('folder-row').filter({ hasText: 'Design' }).click();
  await page.getByRole('button', { name: /Export/ }).click();
  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Markdown/ }).click()]);
  const text = readFileSync((await md.path())!, 'utf8');
  expect(text).toContain('# Design');
  expect(text).toContain('[Open on X]');
});

test('settings + zip download + mode separation', async ({ appPage }) => {
  const page = await appPage('/settings');
  await page.getByLabel('Media downloads').selectOption('zip');

  await page.goto(page.url().replace('#/settings', '#/threads'));
  await importDemo(page);
  await expect(page.getByTestId('scope-title')).toContainText('All · 14');

  const [zipDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all' }).click()]);
  const zip = unzipSync(new Uint8Array(readFileSync((await zipDl.path())!)));
  const names = Object.keys(zip);
  expect(names.length).toBeGreaterThan(5);
  expect(names.every((n) => n.startsWith('Threads/All/'))).toBe(true);

  await page.getByTestId('switch-mode').click();
  await expect(page.getByTestId('mode-x')).toContainText('24');
  await expect(page.getByTestId('mode-threads')).toContainText('14');
});
