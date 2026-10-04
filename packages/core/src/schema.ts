/**
 * Data model shared by the extension and (later) the web viewer.
 *
 * Every record is scoped to one platform so the X and Threads modes never mix,
 * and every record carries createdAt / updatedAt / deletedAt so it can be
 * merged across devices (last-write-wins) without a migration.
 */

export type Platform = 'x' | 'threads';

export const PLATFORMS: Platform[] = ['x', 'threads'];

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: 'X',
  threads: 'Threads',
};

export interface SyncFields {
  createdAt: number;
  updatedAt: number;
  /** Soft-delete tombstone. Hidden from the UI but kept so deletes can sync. */
  deletedAt: number | null;
}

export type MediaType = 'image' | 'video' | 'gif';

export interface MediaItem {
  type: MediaType;
  /** Best-quality URL (original image / highest-bitrate mp4). */
  url: string;
  /** Still image to show in the UI (same as url for images). */
  previewUrl: string;
  width?: number;
  height?: number;
}

export interface Author {
  id: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface QuotedPost {
  platformId: string;
  url: string;
  text: string;
  author: Author;
  media: MediaItem[];
}

export interface Post extends SyncFields {
  /** Stable id `${platform}:${platformId}` so the same post dedupes everywhere. */
  id: string;
  platform: Platform;
  /** Tweet id on X, post shortcode on Threads. */
  platformId: string;
  /** Secondary platform id (Threads numeric media pk), used to match save/unsave actions. */
  extId?: string;
  url: string;
  text: string;
  author: Author;
  media: MediaItem[];
  quoted?: QuotedPost;
  /** Original publish time (ms). */
  postedAt: number;
  /** When we first captured it as saved (ms). */
  savedAt: number;
  /** Lexicographic sort key, newest-saved first when sorted descending. */
  sortKey: string;
  metrics?: { likes?: number; reposts?: number; replies?: number; views?: number };
}

export interface Folder extends SyncFields {
  id: string;
  platform: Platform;
  name: string;
  /** Folder id on the platform (X bookmark folders), when imported. */
  externalId?: string;
  order: number;
}

export interface FolderItem extends SyncFields {
  /** `${folderId}|${postId}` */
  id: string;
  platform: Platform;
  folderId: string;
  /** May reference a post that has not been captured yet. */
  postId: string;
}

/** What the importer/parsers produce before we assign sync fields. */
export type ParsedPost = Omit<Post, 'id' | 'savedAt' | 'sortKey' | keyof SyncFields> & {
  /** Platform-provided ordering hint (X timeline sortIndex). */
  sortIndex?: string;
};

export interface RequestTemplate {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  capturedAt: number;
}

export interface SyncState {
  platform: Platform;
  lastSyncAt: number | null;
  lastSyncResult: 'ok' | 'error' | 'partial' | null;
  lastSyncMessage: string | null;
  /** Last time we saw any authenticated traffic from the site (proxy for "logged in"). */
  lastSeenAt: number | null;
  running: { startedAt: number; kind: SyncKind; progress: number } | null;
  /** Captured request templates keyed by GraphQL operation name. */
  templates: Record<string, RequestTemplate>;
}

export type SyncKind = 'incremental' | 'full';

export function postId(platform: Platform, platformId: string): string {
  return `${platform}:${platformId}`;
}

export function folderItemId(folderId: string, pid: string): string {
  return `${folderId}|${pid}`;
}

export function uuid(): string {
  return globalThis.crypto.randomUUID();
}

/** Pads a non-negative integer string so it sorts lexicographically. */
export function padSortKey(n: string | number | bigint): string {
  return String(n).padStart(24, '0');
}
