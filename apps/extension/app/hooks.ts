import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import {
  DEFAULT_SETTINGS,
  countLivePosts,
  folderIndex,
  getSettings,
  getSyncState,
  listFolders,
  liveFolderItems,
  livePosts,
  updateSettings,
  type Platform,
  type Settings,
} from '@saveboard/core';
import { db } from '@/lib/db';
import { sendToBackground } from '@/lib/messages';

export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>] {
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS);
  const update = async (patch: Partial<Settings>) => {
    await updateSettings(db, patch);
    await sendToBackground({ type: 'settings:changed' }).catch(() => {});
  };
  return [settings, update];
}

export function useSyncState(platform: Platform) {
  return useLiveQuery(() => getSyncState(db, platform), [platform]);
}

export function usePostCount(platform: Platform): number | undefined {
  return useLiveQuery(() => countLivePosts(db, platform), [platform]);
}

export function useLibrary(platform: Platform) {
  const posts = useLiveQuery(() => livePosts(db, platform), [platform]);
  const folders = useLiveQuery(() => listFolders(db, platform), [platform]);
  const items = useLiveQuery(() => liveFolderItems(db, platform), [platform]);
  const byPost = useMemo(() => folderIndex(items ?? []), [items]);
  return { posts, folders, items, byPost, loading: posts === undefined || folders === undefined || items === undefined };
}

export function timeAgo(ms: number | null | undefined): string {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(ms).toLocaleDateString();
}
