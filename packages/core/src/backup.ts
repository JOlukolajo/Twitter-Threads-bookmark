/**
 * Full-fidelity JSON backup. Import merges record-by-record with
 * last-write-wins on `updatedAt` — the same rule the v1.1 cloud sync will use.
 */
import type { Table } from 'dexie';
import type { SaveboardDB } from './db';
import type { Folder, FolderItem, Platform, Post, SyncFields } from './schema';

export const BACKUP_FORMAT = 'saveboard-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  scope: Platform | 'all';
  posts: Post[];
  folders: Folder[];
  folderItems: FolderItem[];
}

export async function exportBackup(db: SaveboardDB, scope: Platform | 'all', includeDeleted = true): Promise<Backup> {
  const pick = async <T extends { platform: Platform } & SyncFields>(table: { toArray(): Promise<T[]>; where(i: string): { equals(v: string): { toArray(): Promise<T[]> } } }) => {
    const rows = scope === 'all' ? await table.toArray() : await table.where('platform').equals(scope).toArray();
    return includeDeleted ? rows : rows.filter((r) => !r.deletedAt);
  };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    scope,
    posts: await pick<Post>(db.posts),
    folders: await pick<Folder>(db.folders),
    folderItems: await pick<FolderItem>(db.folderItems),
  };
}

export function isBackup(v: unknown): v is Backup {
  const b = v as Backup;
  return Boolean(b && b.format === BACKUP_FORMAT && Array.isArray(b.posts) && Array.isArray(b.folders) && Array.isArray(b.folderItems));
}

export interface MergeStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Last-write-wins merge of records into a table. */
export async function mergeRecords<T extends { id: string; updatedAt: number }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: Table<T, string, any>,
  incoming: T[],
): Promise<MergeStats> {
  const stats: MergeStats = { inserted: 0, updated: 0, unchanged: 0 };
  const CHUNK = 2000;
  for (let i = 0; i < incoming.length; i += CHUNK) {
    const chunk = incoming.slice(i, i + CHUNK);
    const current = await table.bulkGet(chunk.map((r) => r.id));
    const writes: T[] = [];
    chunk.forEach((row, j) => {
      const cur = current[j];
      if (!cur) {
        stats.inserted++;
        writes.push(row);
      } else if ((row.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
        stats.updated++;
        writes.push(row);
      } else {
        stats.unchanged++;
      }
    });
    if (writes.length) await table.bulkPut(writes);
  }
  return stats;
}

export async function importBackup(db: SaveboardDB, backup: Backup): Promise<{ posts: MergeStats; folders: MergeStats; folderItems: MergeStats }> {
  if (!isBackup(backup)) throw new Error('This file is not a Saveboard backup.');
  if (backup.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version. Please update the extension.');
  return db.transaction('rw', db.posts, db.folders, db.folderItems, async () => ({
    posts: await mergeRecords<Post>(db.posts, backup.posts),
    folders: await mergeRecords<Folder>(db.folders, backup.folders),
    folderItems: await mergeRecords<FolderItem>(db.folderItems, backup.folderItems),
  }));
}
