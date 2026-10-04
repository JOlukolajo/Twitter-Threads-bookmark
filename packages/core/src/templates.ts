import type { Platform } from './schema';

/** Request templates we capture from the sites and replay to sync, per platform. */
export const TEMPLATE_KEYS = {
  x: { bookmarks: 'Bookmarks', folders: 'BookmarkFoldersSlice', folderTimeline: 'BookmarkFolderTimeline' },
  threads: { saved: 'saved' },
} as const;

export function primaryTemplateKey(platform: Platform): string {
  return platform === 'x' ? TEMPLATE_KEYS.x.bookmarks : TEMPLATE_KEYS.threads.saved;
}
