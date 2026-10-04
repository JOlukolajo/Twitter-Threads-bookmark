import Dexie, { type EntityTable } from 'dexie';
import type { Folder, FolderItem, Platform, Post, SyncState } from './schema';

export interface KV {
  key: string;
  value: unknown;
}

export type SaveboardDB = Dexie & {
  posts: EntityTable<Post, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  folderItems: EntityTable<FolderItem, 'id'>;
  syncState: EntityTable<SyncState, 'platform'>;
  kv: EntityTable<KV, 'key'>;
};

export const DB_NAME = 'saveboard';

export function openDB(name = DB_NAME): SaveboardDB {
  const db = new Dexie(name) as SaveboardDB;
  db.version(1).stores({
    posts: 'id, platform, [platform+sortKey], [platform+extId], updatedAt',
    folders: 'id, platform, [platform+externalId], updatedAt',
    folderItems: 'id, platform, folderId, postId, updatedAt',
    syncState: 'platform',
    kv: 'key',
  });
  return db;
}

export function emptySyncState(platform: Platform): SyncState {
  return {
    platform,
    lastSyncAt: null,
    lastSyncResult: null,
    lastSyncMessage: null,
    lastSeenAt: null,
    running: null,
    templates: {},
  };
}
