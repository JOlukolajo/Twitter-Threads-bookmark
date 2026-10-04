/** Plans media downloads (file names and paths) and builds zips. */
import { zip, type Zippable } from 'fflate';
import type { Post } from './schema';
import { PLATFORM_LABEL } from './schema';
import { extFromUrl, sanitizeFilename } from './util';

export interface DownloadItem {
  url: string;
  /** Relative path, e.g. `Saveboard/X/Design/naval_1234_1.jpg`. */
  path: string;
}

export const DOWNLOAD_ROOT = 'Saveboard';

export function planDownloads(posts: Post[], folderName?: string): DownloadItem[] {
  const items: DownloadItem[] = [];
  const used = new Set<string>();
  for (const p of posts) {
    const dir = [DOWNLOAD_ROOT, PLATFORM_LABEL[p.platform], sanitizeFilename(folderName ?? 'All')].join('/');
    p.media.forEach((m, i) => {
      const ext = extFromUrl(m.url, m.type === 'image' ? 'jpg' : 'mp4');
      let base = `${sanitizeFilename(p.author.handle || 'unknown', 40)}_${sanitizeFilename(p.platformId, 40)}_${i + 1}`;
      while (used.has(`${dir}/${base}.${ext}`)) base += '_';
      used.add(`${dir}/${base}.${ext}`);
      items.push({ url: m.url, path: `${dir}/${base}.${ext}` });
    });
  }
  return items;
}

/** Zips already-fetched files. Paths inside the zip drop the root folder. */
export function buildZip(files: { path: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const tree: Zippable = {};
  for (const f of files) {
    const inner = f.path.split('/').slice(1).join('/');
    // Media is already compressed; store without deflate to save CPU.
    tree[inner] = [f.data, { level: 0 }];
  }
  return new Promise((resolve, reject) => zip(tree, (err, data) => (err ? reject(err) : resolve(data))));
}
