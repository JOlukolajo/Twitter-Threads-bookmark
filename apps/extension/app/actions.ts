import { browser } from 'wxt/browser';
import {
  PLATFORM_LABEL,
  buildZip,
  exportBackup,
  importBackup,
  planDownloads,
  sanitizeFilename,
  toCSV,
  toMarkdown,
  type Folder,
  type Platform,
  type Post,
} from '@saveboard/core';
import { db } from '@/lib/db';

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Saves a blob via a temporary link (lands in the browser's download folder). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportJSON(scope: Platform | 'all'): Promise<number> {
  const backup = await exportBackup(db, scope);
  saveBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `saveboard-${scope}-backup-${stamp()}.json`);
  return backup.posts.length;
}

export async function importJSONFile(file: File): Promise<string> {
  const data = JSON.parse(await file.text());
  const r = await importBackup(db, data);
  return `Imported ${r.posts.inserted} new and ${r.posts.updated} updated posts, ${r.folders.inserted} new folders.`;
}

export function exportMarkdown(platform: Platform, title: string, posts: Post[], folders: Folder[], byPost: Map<string, Set<string>>): void {
  const md = toMarkdown(title, posts, { folders, byPost });
  saveBlob(new Blob([md], { type: 'text/markdown' }), `saveboard-${platform}-${sanitizeFilename(title, 40)}-${stamp()}.md`);
}

export function exportCSV(platform: Platform, title: string, posts: Post[], folders: Folder[], byPost: Map<string, Set<string>>): void {
  const names = new Map(folders.map((f) => [f.id, f.name]));
  const csv = toCSV(posts, (p) => [...(byPost.get(p.id) ?? [])].map((id) => names.get(id) ?? '').filter(Boolean));
  saveBlob(new Blob([csv], { type: 'text/csv' }), `saveboard-${platform}-${sanitizeFilename(title, 40)}-${stamp()}.csv`);
}

export interface DownloadProgress {
  done: number;
  total: number;
  failed: number;
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Downloads every image/video of the given posts at best quality, either as
 * separate files under Downloads/Saveboard/<Platform>/<Folder>/ or as one zip.
 */
export async function downloadMedia(
  platform: Platform,
  posts: Post[],
  folderName: string,
  mode: 'files' | 'zip',
  onProgress: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  const plan = planDownloads(posts, folderName);
  const progress: DownloadProgress = { done: 0, total: plan.length, failed: 0 };
  onProgress(progress);
  if (!plan.length) return progress;

  if (mode === 'files') {
    for (const item of plan) {
      try {
        await browser.downloads.download({ url: item.url, filename: item.path, conflictAction: 'uniquify', saveAs: false });
      } catch {
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
    return progress;
  }

  const files: { path: string; data: Uint8Array }[] = [];
  await pool(plan, 4, async (item) => {
    try {
      const res = await fetch(item.url, { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(String(res.status));
      files.push({ path: item.path, data: new Uint8Array(await res.arrayBuffer()) });
    } catch {
      progress.failed++;
    }
    progress.done++;
    onProgress({ ...progress });
  });
  if (files.length) {
    const zip = await buildZip(files);
    saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `saveboard-${PLATFORM_LABEL[platform].toLowerCase()}-${sanitizeFilename(folderName, 40)}-${stamp()}.zip`);
  }
  return progress;
}
