/**
 * All reads and writes go through here so the background worker, the app UI
 * and the tests share one set of rules (sort order, tombstones, platform scoping).
 */
import { emptySyncState, type SaveboardDB } from './db';
import {
  folderItemId,
  padSortKey,
  postId,
  uuid,
  type Folder,
  type FolderItem,
  type ParsedPost,
  type Platform,
  type Post,
  type SyncState,
} from './schema';

/** Where a page of posts sits relative to what we already have. */
export type PagePosition = 'top' | 'bottom';

export interface IngestResult {
  newCount: number;
  knownCount: number;
  updatedCount: number;
  newIds: string[];
}

/** Base for generated sort keys (platforms without a native ordering, i.e. Threads). */
const GENERATED_BASE = 10n ** 15n;

async function sortKeyBounds(db: SaveboardDB, platform: Platform): Promise<{ min: bigint; max: bigint } | null> {
  const range = db.posts.where('[platform+sortKey]').between([platform, ''], [platform, '￿']);
  const first = await range.first();
  const last = await range.last();
  if (!first || !last) return null;
  return { min: BigInt(first.sortKey), max: BigInt(last.sortKey) };
}

function contentSignature(p: Pick<Post, 'text' | 'media' | 'author' | 'quoted' | 'url'>): string {
  return JSON.stringify([p.text, p.url, p.media.map((m) => m.url), p.author.handle, p.author.name, p.author.avatarUrl, p.quoted?.platformId]);
}

/**
 * Upserts captured posts. Posts within `parsed` must be ordered newest-saved first
 * (the order platforms return them in).
 */
export async function ingestPosts(
  db: SaveboardDB,
  platform: Platform,
  parsed: ParsedPost[],
  opts: { position?: PagePosition; now?: number } = {},
): Promise<IngestResult> {
  const now = opts.now ?? Date.now();
  const position = opts.position ?? 'top';
  const result: IngestResult = { newCount: 0, knownCount: 0, updatedCount: 0, newIds: [] };
  const items = parsed.filter((p) => p.platform === platform);
  if (!items.length) return result;

  await db.transaction('rw', db.posts, async () => {
    const ids = items.map((p) => postId(platform, p.platformId));
    const existing = await db.posts.bulkGet(ids);
    const bounds = await sortKeyBounds(db, platform);
    const unknownWithoutIndex = items.filter((p, i) => !existing[i] && !p.sortIndex).length;
    let topCursor = (bounds?.max ?? GENERATED_BASE) + BigInt(unknownWithoutIndex);
    let bottomCursor = bounds?.min ?? GENERATED_BASE;
    const writes: Post[] = [];

    items.forEach((p, i) => {
      const prev = existing[i];
      const { sortIndex, ...fields } = p;
      if (prev) {
        result.knownCount++;
        const changed = contentSignature(prev) !== contentSignature(p);
        const revived = prev.deletedAt !== null;
        if (!changed && !revived && !(sortIndex && padSortKey(sortIndex) !== prev.sortKey)) return;
        result.updatedCount++;
        writes.push({
          ...prev,
          ...fields,
          id: prev.id,
          sortKey: sortIndex ? padSortKey(sortIndex) : prev.sortKey,
          savedAt: revived ? now : prev.savedAt,
          deletedAt: null,
          updatedAt: now,
        });
        return;
      }
      let sortKey: string;
      if (sortIndex) sortKey = padSortKey(sortIndex);
      else if (position === 'top') sortKey = padSortKey(topCursor--);
      else sortKey = padSortKey(--bottomCursor);
      result.newCount++;
      result.newIds.push(ids[i]);
      writes.push({ ...fields, id: ids[i], sortKey, savedAt: now, createdAt: now, updatedAt: now, deletedAt: null });
    });
    if (writes.length) await db.posts.bulkPut(writes);
  });
  return result;
}

export async function markUnsaved(
  db: SaveboardDB,
  platform: Platform,
  ref: { platformId?: string; extId?: string },
  now = Date.now(),
): Promise<boolean> {
  let post: Post | undefined;
  if (ref.platformId) post = await db.posts.get(postId(platform, ref.platformId));
  else if (ref.extId) post = await db.posts.where('[platform+extId]').equals([platform, ref.extId]).first();
  if (!post || post.deletedAt) return false;
  await db.posts.update(post.id, { deletedAt: now, updatedAt: now });
  return true;
}

/**
 * After a complete sync, removes posts that are no longer saved on the platform.
 * Refuses to remove more than `maxRatio` of the library in one go, in case the
 * sync silently stopped early.
 */
export async function reconcileFullSync(
  db: SaveboardDB,
  platform: Platform,
  seenPlatformIds: Set<string>,
  syncStartedAt: number,
  maxRatio = 0.5,
): Promise<{ removed: number; skipped: boolean }> {
  const live = (await db.posts.where('platform').equals(platform).toArray()).filter((p) => !p.deletedAt);
  const missing = live.filter((p) => !seenPlatformIds.has(p.platformId) && p.savedAt < syncStartedAt);
  if (live.length > 10 && missing.length / live.length > maxRatio) return { removed: 0, skipped: true };
  const now = Date.now();
  await db.posts.bulkPut(missing.map((p) => ({ ...p, deletedAt: now, updatedAt: now })));
  return { removed: missing.length, skipped: false };
}

export async function livePosts(db: SaveboardDB, platform: Platform): Promise<Post[]> {
  const rows = await db.posts.where('[platform+sortKey]').between([platform, ''], [platform, '￿']).reverse().toArray();
  return rows.filter((p) => !p.deletedAt);
}

export async function countLivePosts(db: SaveboardDB, platform: Platform): Promise<number> {
  return db.posts.where('platform').equals(platform).filter((p) => !p.deletedAt).count();
}

// ---------------------------------------------------------------- folders

export async function listFolders(db: SaveboardDB, platform: Platform): Promise<Folder[]> {
  const rows = await db.folders.where('platform').equals(platform).toArray();
  return rows.filter((f) => !f.deletedAt).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createFolder(db: SaveboardDB, platform: Platform, name: string, externalId?: string): Promise<Folder> {
  const now = Date.now();
  const existing = await listFolders(db, platform);
  const folder: Folder = {
    id: uuid(),
    platform,
    name: name.trim() || 'Untitled',
    externalId,
    order: existing.length ? Math.max(...existing.map((f) => f.order)) + 1 : 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(db: SaveboardDB, folderId: string, name: string): Promise<void> {
  await db.folders.update(folderId, { name: name.trim() || 'Untitled', updatedAt: Date.now() });
}

export async function deleteFolder(db: SaveboardDB, folderId: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.folders, db.folderItems, async () => {
    await db.folders.update(folderId, { deletedAt: now, updatedAt: now });
    const items = await db.folderItems.where('folderId').equals(folderId).toArray();
    await db.folderItems.bulkPut(items.filter((i) => !i.deletedAt).map((i) => ({ ...i, deletedAt: now, updatedAt: now })));
  });
}

export async function reorderFolders(db: SaveboardDB, orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.folders, async () => {
    for (const [i, id] of orderedIds.entries()) await db.folders.update(id, { order: i, updatedAt: now });
  });
}

/** Adds or removes posts from a folder. Post ids are `${platform}:${platformId}`. */
export async function setFolderMembership(
  db: SaveboardDB,
  platform: Platform,
  folderId: string,
  postIds: string[],
  member: boolean,
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.folderItems, async () => {
    const ids = postIds.map((pid) => folderItemId(folderId, pid));
    const existing = await db.folderItems.bulkGet(ids);
    const writes: FolderItem[] = [];
    postIds.forEach((pid, i) => {
      const prev = existing[i];
      if (member) {
        if (prev && !prev.deletedAt) return;
        writes.push(
          prev
            ? { ...prev, deletedAt: null, updatedAt: now }
            : { id: ids[i], platform, folderId, postId: pid, createdAt: now, updatedAt: now, deletedAt: null },
        );
      } else if (prev && !prev.deletedAt) {
        writes.push({ ...prev, deletedAt: now, updatedAt: now });
      }
    });
    if (writes.length) await db.folderItems.bulkPut(writes);
  });
}

/** Moves posts into `folderId`, removing them from every other folder of the platform. */
export async function moveToFolder(db: SaveboardDB, platform: Platform, folderId: string, postIds: string[]): Promise<void> {
  const now = Date.now();
  const set = new Set(postIds);
  await db.transaction('rw', db.folderItems, async () => {
    const items = await db.folderItems.where('platform').equals(platform).toArray();
    const removals = items.filter((i) => !i.deletedAt && set.has(i.postId) && i.folderId !== folderId);
    await db.folderItems.bulkPut(removals.map((i) => ({ ...i, deletedAt: now, updatedAt: now })));
  });
  await setFolderMembership(db, platform, folderId, postIds, true);
}

export async function liveFolderItems(db: SaveboardDB, platform: Platform): Promise<FolderItem[]> {
  const rows = await db.folderItems.where('platform').equals(platform).toArray();
  return rows.filter((i) => !i.deletedAt);
}

/** Creates local folders for X bookmark folders we have not seen before; renames changed ones. */
export async function upsertExternalFolders(
  db: SaveboardDB,
  platform: Platform,
  folders: { externalId: string; name: string }[],
): Promise<Folder[]> {
  const out: Folder[] = [];
  for (const f of folders) {
    const prev = await db.folders.where('[platform+externalId]').equals([platform, f.externalId]).first();
    if (prev && !prev.deletedAt) {
      if (prev.name !== f.name) await renameFolder(db, prev.id, f.name);
      out.push({ ...prev, name: f.name });
    } else if (!prev) {
      out.push(await createFolder(db, platform, f.name, f.externalId));
    }
  }
  return out;
}

export async function folderByExternalId(db: SaveboardDB, platform: Platform, externalId: string): Promise<Folder | undefined> {
  const f = await db.folders.where('[platform+externalId]').equals([platform, externalId]).first();
  return f && !f.deletedAt ? f : undefined;
}

/** Soft-deletes posts locally (and their folder memberships). */
export async function deletePostsLocally(db: SaveboardDB, ids: string[]): Promise<void> {
  const now = Date.now();
  const set = new Set(ids);
  await db.transaction('rw', db.posts, db.folderItems, async () => {
    const posts = (await db.posts.bulkGet(ids)).filter((p): p is Post => Boolean(p));
    await db.posts.bulkPut(posts.map((p) => ({ ...p, deletedAt: now, updatedAt: now })));
    const items = await db.folderItems.where('postId').anyOf(ids).toArray();
    await db.folderItems.bulkPut(items.filter((i) => set.has(i.postId)).map((i) => ({ ...i, deletedAt: now, updatedAt: now })));
  });
}

/** Removes every record of a platform from this browser (not a tombstone; a hard reset). */
export async function clearPlatform(db: SaveboardDB, platform: Platform): Promise<void> {
  await db.transaction('rw', [db.posts, db.folders, db.folderItems, db.syncState], async () => {
    await db.posts.where('platform').equals(platform).delete();
    await db.folders.where('platform').equals(platform).delete();
    await db.folderItems.where('platform').equals(platform).delete();
    await db.syncState.delete(platform);
  });
}

// ---------------------------------------------------------------- sync state

export async function getSyncState(db: SaveboardDB, platform: Platform): Promise<SyncState> {
  return (await db.syncState.get(platform)) ?? emptySyncState(platform);
}

export async function patchSyncState(
  db: SaveboardDB,
  platform: Platform,
  patch: Partial<SyncState> | ((s: SyncState) => Partial<SyncState>),
): Promise<SyncState> {
  return db.transaction('rw', db.syncState, async () => {
    const cur = await getSyncState(db, platform);
    const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), platform };
    await db.syncState.put(next);
    return next;
  });
}

// ---------------------------------------------------------------- settings

export interface Settings {
  /** Minutes between automatic syncs; 0 disables. */
  syncIntervalMin: number;
  /** Open an inactive tab of the site when auto-sync runs and none is open. */
  allowBackgroundTab: boolean;
  /** Download as one zip or as separate files under a folder path. */
  downloadMode: 'files' | 'zip';
  /** Always show the mode picker instead of reopening the last mode. */
  alwaysShowPicker: boolean;
  lastMode: Platform | null;
  /** Show the "Add to folder" chip on x.com / threads.com. */
  showChips: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  syncIntervalMin: 60,
  allowBackgroundTab: true,
  downloadMode: 'files',
  alwaysShowPicker: false,
  lastMode: null,
  showChips: true,
};

export async function getSettings(db: SaveboardDB): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function updateSettings(db: SaveboardDB, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...patch };
  await db.kv.put({ key: 'settings', value: next });
  return next;
}
