import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import xBookmarks from './fixtures/x-bookmarks.json';
import threadsSaved from './fixtures/threads-saved.json';
import {
  openDB, ingestPosts, livePosts, markUnsaved, reconcileFullSync, createFolder, setFolderMembership, moveToFolder,
  liveFolderItems, deleteFolder, listFolders, upsertExternalFolders, exportBackup, importBackup, filterPosts,
  folderIndex, folderCounts, PostSearch, DEFAULT_FILTERS, toCSV, toMarkdown, planDownloads, buildZip,
  xParser, threadsParser, type SaveboardDB, type ParsedPost,
} from '../src';
import { unzipSync } from 'fflate';

let db: SaveboardDB;
let n = 0;
beforeEach(async () => { db = openDB(`test-${n++}`); await db.open(); });
afterEach(async () => { db.close(); });

const xPosts = () => xParser.parseTimeline(xBookmarks).posts;
const thPosts = () => threadsParser.collectThreadsPosts(threadsSaved);

function fakeThreads(code: string): ParsedPost {
  return { platform: 'threads', platformId: code, url: `https://www.threads.com/@a/post/${code}`, text: code, author: { id: '1', handle: 'a', name: 'A' }, media: [], postedAt: 1 };
}

describe('ingest', () => {
  it('inserts, dedupes and keeps platform scoping', async () => {
    const r1 = await ingestPosts(db, 'x', xPosts());
    expect(r1).toMatchObject({ newCount: 2, knownCount: 0 });
    const r2 = await ingestPosts(db, 'x', xPosts());
    expect(r2).toMatchObject({ newCount: 0, knownCount: 2, updatedCount: 0 });
    await ingestPosts(db, 'threads', thPosts());
    expect((await livePosts(db, 'x')).map((p) => p.platformId)).toEqual(['1850000000000000001', '1849000000000000000']);
    expect((await livePosts(db, 'threads')).every((p) => p.platform === 'threads')).toBe(true);
  });

  it('orders posts without a native sort index by capture position', async () => {
    await ingestPosts(db, 'threads', [fakeThreads('B'), fakeThreads('C')]);
    await ingestPosts(db, 'threads', [fakeThreads('A'), fakeThreads('B')], { position: 'top' });
    await ingestPosts(db, 'threads', [fakeThreads('D'), fakeThreads('E')], { position: 'bottom' });
    expect((await livePosts(db, 'threads')).map((p) => p.platformId)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('unsaves and revives', async () => {
    await ingestPosts(db, 'threads', thPosts());
    expect(await markUnsaved(db, 'threads', { extId: '3400000000000000001' })).toBe(true);
    expect((await livePosts(db, 'threads')).map((p) => p.platformId)).toEqual(['DAbcDEF2', 'DAbcDEF3']);
    const r = await ingestPosts(db, 'threads', thPosts());
    expect(r.updatedCount).toBe(1);
    expect(await livePosts(db, 'threads')).toHaveLength(3);
  });

  it('reconciles a full sync but refuses suspicious mass removals', async () => {
    const many = Array.from({ length: 20 }, (_, i) => fakeThreads(`P${i}`));
    await ingestPosts(db, 'threads', many, { now: 1000 });
    const seenMost = new Set(many.slice(0, 18).map((p) => p.platformId));
    expect(await reconcileFullSync(db, 'threads', seenMost, 2000)).toEqual({ removed: 2, skipped: false });
    expect(await reconcileFullSync(db, 'threads', new Set(['P0']), 2000)).toMatchObject({ skipped: true });
    expect(await livePosts(db, 'threads')).toHaveLength(18);
  });
});

describe('folders', () => {
  it('adds, moves, removes, and deletes folders', async () => {
    await ingestPosts(db, 'x', xPosts());
    const a = await createFolder(db, 'x', 'Design');
    const b = await createFolder(db, 'x', 'Later');
    const [p1, p2] = (await livePosts(db, 'x')).map((p) => p.id);
    await setFolderMembership(db, 'x', a.id, [p1, p2], true);
    await setFolderMembership(db, 'x', b.id, [p1], true);
    let idx = folderIndex(await liveFolderItems(db, 'x'));
    expect([...idx.get(p1)!].sort()).toEqual([a.id, b.id].sort());
    await moveToFolder(db, 'x', b.id, [p2]);
    idx = folderIndex(await liveFolderItems(db, 'x'));
    expect([...idx.get(p2)!]).toEqual([b.id]);
    await deleteFolder(db, b.id);
    idx = folderIndex(await liveFolderItems(db, 'x'));
    expect(idx.get(p2)).toBeUndefined();
    expect((await listFolders(db, 'x')).map((f) => f.name)).toEqual(['Design']);
    const posts = await livePosts(db, 'x');
    expect(folderCounts(posts, idx)).toEqual({ counts: new Map([[a.id, 1]]), unfiled: 1 });
  });

  it('imports external X folders idempotently', async () => {
    await upsertExternalFolders(db, 'x', [{ externalId: '1', name: 'Design' }]);
    await upsertExternalFolders(db, 'x', [{ externalId: '1', name: 'Design 2' }, { externalId: '2', name: 'New' }]);
    expect((await listFolders(db, 'x')).map((f) => f.name)).toEqual(['Design 2', 'New']);
    expect(await listFolders(db, 'threads')).toEqual([]);
  });
});

describe('backup, search, export, download', () => {
  it('round-trips a backup with last-write-wins', async () => {
    await ingestPosts(db, 'x', xPosts());
    const f = await createFolder(db, 'x', 'Keep');
    await setFolderMembership(db, 'x', f.id, [(await livePosts(db, 'x'))[0].id], true);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db, 'x')));
    const other = openDB(`test-${n++}`);
    const stats = await importBackup(other, backup);
    expect(stats.posts.inserted).toBe(2);
    expect(stats.folderItems.inserted).toBe(1);
    const again = await importBackup(other, backup);
    expect(again.posts).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(await livePosts(other, 'x')).toEqual(await livePosts(db, 'x'));
    other.close();
    await expect(importBackup(db, { nope: true } as never)).rejects.toThrow(/not a Saveboard backup/);
  });

  it('filters and searches', async () => {
    await ingestPosts(db, 'x', xPosts());
    const posts = await livePosts(db, 'x');
    const search = new PostSearch();
    search.sync(posts);
    const idx = folderIndex([]);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, search: 'shipp' }, idx, search).map((p) => p.platformId)).toEqual(['1850000000000000001']);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, search: 'linus' }, idx, search)).toHaveLength(1);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, media: 'gif' }, idx)).toHaveLength(1);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, media: 'video' }, idx)).toHaveLength(1);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, author: '@ADA' }, idx)).toHaveLength(1);
    expect(filterPosts(posts, { ...DEFAULT_FILTERS, folder: { kind: 'unfiled' } }, idx)).toHaveLength(2);
  });

  it('exports CSV/Markdown and plans downloads into a zip', async () => {
    await ingestPosts(db, 'x', xPosts());
    const posts = await livePosts(db, 'x');
    const csv = toCSV(posts);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"Shipping & learning https://example.com/post"'.replace(/"/g, '') );
    const md = toMarkdown('X bookmarks', posts);
    expect(md).toContain('### Ada Lovelace (@ada)');
    expect(md).toContain('![image](https://pbs.twimg.com/media/AAA?format=jpg&name=orig)');
    const plan = planDownloads(posts, 'Design/Stuff');
    expect(plan.map((p) => p.path)).toEqual([
      'Saveboard/X/Design_Stuff/ada_1850000000000000001_1.jpg',
      'Saveboard/X/Design_Stuff/ada_1850000000000000001_2.mp4',
      'Saveboard/X/Design_Stuff/linus_1849000000000000000_1.mp4',
    ]);
    const zipped = await buildZip(plan.map((p) => ({ path: p.path, data: new Uint8Array([1, 2, 3]) })));
    expect(Object.keys(unzipSync(zipped))).toEqual(plan.map((p) => p.path.replace('Saveboard/', '')));
  });
});
