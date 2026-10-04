/**
 * Runs the real extension against stand-in x.com / threads.com pages whose API
 * responses are the parser fixtures. Covers: passive capture, request-template
 * learning, the automatic first sync (replay through the tab), unsave capture,
 * the "Add to folder" chip, and per-mode separation in the library.
 */
import { expect, fixture, test } from './fixtures';

const X_BOOKMARKS = fixture('x-bookmarks.json');
const X_END = fixture('x-bookmarks-end.json');
const THREADS_SAVED = fixture('threads-saved.json');

const X_PAGE = `<!doctype html><html><body>
<article data-testid="tweet">
  <a href="/ada/status/1850000000000000001"><time>Oct 27</time></a>
  <p>Shipping &amp; learning</p>
  <div role="group"><button data-testid="removeBookmark">bm</button></div>
</article>
<button id="unbookmark">Unbookmark</button>
<script>
  const vars = encodeURIComponent(JSON.stringify({ count: 20, includePromotedContent: true }));
  const headers = { authorization: 'Bearer TEST', 'x-csrf-token': 'abc', 'x-twitter-auth-type': 'OAuth2Session' };
  fetch('/i/api/graphql/QID1/Bookmarks?variables=' + vars + '&features=%7B%22f%22%3Atrue%7D', { headers, credentials: 'include' });
  document.getElementById('unbookmark').onclick = () => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/i/api/graphql/QID2/DeleteBookmark');
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send(JSON.stringify({ variables: { tweet_id: '1849000000000000000' }, queryId: 'QID2' }));
  };
</script></body></html>`;

const THREADS_PAGE = `<!doctype html><html><body>
<script type="application/json">${THREADS_SAVED.replace(/</g, '\\u003c')}</script>
<script>
  const body = new URLSearchParams({ fb_api_req_friendly_name: 'BarcelonaSavedPostsQuery', doc_id: '42', lsd: 'L', variables: JSON.stringify({ after: null, first: 10 }) });
  fetch('/graphql/query', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': 'L' }, body });
</script></body></html>`;

test('X: captures bookmarks, auto-syncs, files via chip, captures unbookmark', async ({ context, appPage }) => {
  const apiCalls: string[] = [];
  await context.route('https://x.com/i/bookmarks', (r) => r.fulfill({ contentType: 'text/html', body: X_PAGE }));
  await context.route(/https:\/\/x\.com\/i\/api\/graphql\/QID1\/Bookmarks.*/, (r) => {
    const vars = JSON.parse(new URL(r.request().url()).searchParams.get('variables')!);
    apiCalls.push(vars.cursor ?? 'first');
    return r.fulfill({ contentType: 'application/json', body: vars.cursor ? X_END : X_BOOKMARKS });
  });
  await context.route(/https:\/\/x\.com\/i\/api\/graphql\/QID2\/DeleteBookmark/, (r) => r.fulfill({ contentType: 'application/json', body: '{"data":{"tweet_bookmark_delete":"Done"}}' }));

  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');

  // The first captured page teaches the extension the request; it then runs a full sync on its own.
  await expect.poll(() => apiCalls.join(','), { timeout: 30_000 }).toContain('BOTTOMCURSOR');

  const app = await appPage('/x');
  await expect(app.getByTestId('post')).toHaveCount(2);
  await expect(app.getByText('Shipping & learning')).toBeVisible();
  await expect(app.getByTestId('sync-message')).toContainText(/bookmarks/);

  // "Add to folder" chip on the site creates a folder containing the tweet.
  await site.bringToFront();
  const chip = site.locator('[data-saveboard-chip="1850000000000000001"]');
  await expect(chip).toBeVisible();
  await chip.click();
  await site.getByPlaceholder('New folder…').fill('Design');
  await site.getByPlaceholder('New folder…').press('Enter');
  await expect(site.getByRole('checkbox', { name: 'Design' })).toBeChecked();
  await site.keyboard.press('Escape');
  await expect(site.getByPlaceholder('New folder…')).toHaveCount(0);

  await app.bringToFront();
  await app.getByTestId('folder-row').filter({ hasText: 'Design' }).click();
  await expect(app.getByTestId('scope-title')).toContainText('Design · 1');

  // Unbookmarking on X removes it from the library.
  await site.bringToFront();
  await site.click('#unbookmark');
  await app.bringToFront();
  await app.getByRole('button', { name: /All/ }).first().click();
  await expect(app.getByTestId('post')).toHaveCount(1);
});

test('Threads: imports saved posts and keeps modes separate', async ({ context, appPage }) => {
  const bodies: string[] = [];
  await context.route('https://www.threads.com/saved', (r) => r.fulfill({ contentType: 'text/html', body: THREADS_PAGE }));
  await context.route('https://www.threads.com/graphql/query', (r) => {
    const params = new URLSearchParams(r.request().postData() ?? '');
    const after = JSON.parse(params.get('variables') ?? '{}').after;
    bodies.push(after ?? 'first');
    return r.fulfill({ contentType: 'application/json', body: after ? '{"data":{"x":{"edges":[],"page_info":{"has_next_page":false}}}}' : THREADS_SAVED });
  });

  const site = await context.newPage();
  await site.goto('https://www.threads.com/saved');
  await expect.poll(() => bodies.join(','), { timeout: 30_000 }).toContain('CURSOR_A');

  const app = await appPage('/threads');
  await expect(app.getByTestId('post')).toHaveCount(3);
  await expect(app.getByText('Hello Threads')).toBeVisible();

  await app.getByTestId('switch-mode').click();
  await app.getByTestId('mode-x').click();
  await expect(app.getByTestId('empty-state')).toBeVisible();
});
