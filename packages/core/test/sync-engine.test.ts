import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import xBookmarks from './fixtures/x-bookmarks.json';
import xEnd from './fixtures/x-bookmarks-end.json';
import xFolders from './fixtures/x-folders.json';
import threadsSaved from './fixtures/threads-saved.json';
import {
  openDB, runApiSync, livePosts, listFolders, liveFolderItems, ingestPosts, buildXRequest, buildThreadsRequest,
  extractThreadsTokens, jazoest, type HttpRequest, type HttpResponse, type SaveboardDB, type RequestTemplate,
} from '../src';

let db: SaveboardDB;
let n = 0;
beforeEach(async () => { db = openDB(`sync-${n++}`); await db.open(); });

const noSleep = { sleep: async () => {}, pageDelayMs: 0 };
const ok = (body: unknown): HttpResponse => ({ status: 200, headers: {}, body: JSON.stringify(body) });

const xTemplate = (op: string): RequestTemplate => ({
  url: `https://x.com/i/api/graphql/QID/${op}?variables=${encodeURIComponent(JSON.stringify({ count: 20, includePromotedContent: false }))}&features=%7B%22a%22%3Atrue%7D`,
  method: 'GET',
  headers: { authorization: 'Bearer T', 'x-csrf-token': 'csrf', 'x-client-transaction-id': 'once' },
  capturedAt: 0,
});

function vars(req: HttpRequest) {
  return JSON.parse(new URL(req.url).searchParams.get('variables')!);
}

describe('request builders', () => {
  it('rewrites the X cursor, keeps features, drops one-time headers', () => {
    const req = buildXRequest(xTemplate('Bookmarks'), { cursor: 'C1', variables: { bookmark_collection_id: '9' } });
    expect(vars(req)).toEqual({ count: 20, includePromotedContent: false, cursor: 'C1', bookmark_collection_id: '9' });
    expect(new URL(req.url).searchParams.get('features')).toBe('{"a":true}');
    expect(req.headers).toEqual({ authorization: 'Bearer T', 'x-csrf-token': 'csrf' });
  });

  it('rewrites the Threads cursor and refreshes tokens', () => {
    const t: RequestTemplate = {
      url: 'https://www.threads.com/graphql/query', method: 'POST', capturedAt: 0,
      headers: { 'x-fb-lsd': 'old', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ lsd: 'old', fb_dtsg: 'oldd', doc_id: '123', variables: JSON.stringify({ after: null, first: 10 }) }).toString(),
    };
    const req = buildThreadsRequest(t, { cursor: 'NEXT', tokens: { lsd: 'new', fbDtsg: 'AB' } });
    const p = new URLSearchParams(req.body);
    expect(JSON.parse(p.get('variables')!)).toEqual({ after: 'NEXT', first: 10 });
    expect([p.get('lsd'), p.get('fb_dtsg'), p.get('jazoest'), p.get('doc_id'), req.headers['x-fb-lsd']]).toEqual(['new', 'AB', jazoest('AB'), '123', 'new']);
    expect(jazoest('AB')).toBe('2131');
    expect(extractThreadsTokens('..."LSD",[],{"token":"L1"}..."DTSGInitialData",[],{"token":"D1"}')).toEqual({ lsd: 'L1', fbDtsg: 'D1' });
  });
});

describe('runApiSync (X)', () => {
  it('pages to the end, then imports folders on a full sync', async () => {
    const calls: HttpRequest[] = [];
    const transport = {
      async fetch(req: HttpRequest) {
        calls.push(req);
        if (req.url.includes('/BookmarkFoldersSlice')) return ok(xFolders);
        if (req.url.includes('/BookmarkFolderTimeline')) {
          return vars(req).bookmark_collection_id === '1700000000000000001' && !vars(req).cursor ? ok(xBookmarks) : ok(xEnd);
        }
        return vars(req).cursor ? ok(xEnd) : ok(xBookmarks);
      },
    };
    const templates = { Bookmarks: xTemplate('Bookmarks'), BookmarkFoldersSlice: xTemplate('BookmarkFoldersSlice'), BookmarkFolderTimeline: xTemplate('BookmarkFolderTimeline') };
    const out = await runApiSync(db, 'x', 'full', templates, transport, noSleep);
    expect(out).toMatchObject({ ok: true, pages: 2, newCount: 2, reachedEnd: true, foldersImported: 2 });
    expect(vars(calls[1]).cursor).toBe('BOTTOMCURSOR');
    const folders = await listFolders(db, 'x');
    expect(folders.map((f) => f.name)).toEqual(['Design', 'Startups']);
    const items = await liveFolderItems(db, 'x');
    expect(items.map((i) => i.postId).sort()).toEqual(['x:1849000000000000000', 'x:1850000000000000001']);
    expect(items.every((i) => i.folderId === folders[0].id)).toBe(true);
  });

  it('stops an incremental sync at the first known post', async () => {
    await ingestPosts(db, 'x', [{ platform: 'x', platformId: '1849000000000000000', url: '', text: '', author: { id: '', handle: '', name: '' }, media: [], postedAt: 0 }]);
    let count = 0;
    const out = await runApiSync(db, 'x', 'incremental', { Bookmarks: xTemplate('Bookmarks') }, { async fetch() { count++; return ok(xBookmarks); } }, noSleep);
    expect(count).toBe(1);
    expect(out).toMatchObject({ ok: true, newCount: 1, reachedEnd: false });
  });

  it('reports auth problems and broken request formats', async () => {
    const auth = await runApiSync(db, 'x', 'incremental', { Bookmarks: xTemplate('Bookmarks') }, { async fetch() { return { status: 401, headers: {}, body: '' }; } }, noSleep);
    expect(auth).toMatchObject({ ok: false, authProblem: true });
    const broken = await runApiSync(db, 'x', 'incremental', { Bookmarks: xTemplate('Bookmarks') }, { async fetch() { return ok({ errors: [{ message: 'features cannot be null' }] }); } }, noSleep);
    expect(broken).toMatchObject({ ok: false, apiBroken: true });
    const none = await runApiSync(db, 'x', 'incremental', {}, { async fetch() { throw new Error('unused'); } }, noSleep);
    expect(none).toMatchObject({ ok: false, apiBroken: true });
  });

  it('waits and retries when rate limited', async () => {
    const waits: number[] = [];
    let i = 0;
    const transport = { async fetch(req: HttpRequest) { i++; if (i === 1) return { status: 429, headers: { 'retry-after': '7' }, body: '' }; return vars(req).cursor ? ok(xEnd) : ok(xBookmarks); } };
    const out = await runApiSync(db, 'x', 'full', { Bookmarks: xTemplate('Bookmarks') }, transport, { sleep: async (ms) => { waits.push(ms); }, pageDelayMs: 0 });
    expect(out.ok).toBe(true);
    expect(waits[0]).toBe(7000);
  });
});

describe('runApiSync (Threads)', () => {
  it('syncs saved posts using the page cursor', async () => {
    const t: RequestTemplate = { url: 'https://www.threads.com/graphql/query', method: 'POST', headers: {}, capturedAt: 0, body: new URLSearchParams({ variables: JSON.stringify({ after: null }) }).toString() };
    const transport = {
      async fetch(req: HttpRequest) {
        const after = JSON.parse(new URLSearchParams(req.body).get('variables')!).after;
        return after ? ok({ data: { x: { edges: [], page_info: { has_next_page: false, end_cursor: null } } } }) : ok(threadsSaved);
      },
      async threadsTokens() { return { lsd: 'L' }; },
    };
    const out = await runApiSync(db, 'threads', 'full', { saved: t }, transport, noSleep);
    expect(out).toMatchObject({ ok: true, pages: 2, newCount: 3, reachedEnd: true });
    expect((await livePosts(db, 'threads')).map((p) => p.platformId)).toEqual(['DAbcDEF1', 'DAbcDEF2', 'DAbcDEF3']);
  });
});
