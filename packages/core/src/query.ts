/** In-memory filtering and search over a platform's posts. */
import MiniSearch from 'minisearch';
import type { FolderItem, MediaType, Post } from './schema';

export type FolderFilter = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; folderId: string };

export interface PostFilters {
  folder: FolderFilter;
  search: string;
  author: string;
  media: 'any' | 'none' | MediaType | 'with-media';
  /** Inclusive ms timestamps on postedAt. */
  from?: number;
  to?: number;
}

export const DEFAULT_FILTERS: PostFilters = { folder: { kind: 'all' }, search: '', author: '', media: 'any' };

export function folderIndex(items: FolderItem[]): Map<string, Set<string>> {
  const byPost = new Map<string, Set<string>>();
  for (const i of items) {
    if (i.deletedAt) continue;
    let s = byPost.get(i.postId);
    if (!s) byPost.set(i.postId, (s = new Set()));
    s.add(i.folderId);
  }
  return byPost;
}

export function folderCounts(posts: Post[], byPost: Map<string, Set<string>>): { counts: Map<string, number>; unfiled: number } {
  const counts = new Map<string, number>();
  let unfiled = 0;
  for (const p of posts) {
    const f = byPost.get(p.id);
    if (!f || f.size === 0) unfiled++;
    else for (const id of f) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, unfiled };
}

export class PostSearch {
  private index = new MiniSearch<{ id: string; text: string; name: string; handle: string; quoted: string }>({
    fields: ['text', 'name', 'handle', 'quoted'],
    searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND', boost: { handle: 2, name: 2 } },
  });
  private indexed = new Map<string, number>();

  /** Brings the index in line with `posts` (adds new / updated, removes gone). */
  sync(posts: Post[]): void {
    const live = new Set<string>();
    for (const p of posts) {
      live.add(p.id);
      const v = this.indexed.get(p.id);
      if (v === p.updatedAt) continue;
      if (v !== undefined) this.index.discard(p.id);
      this.index.add({
        id: p.id,
        text: p.text,
        name: p.author.name,
        handle: p.author.handle,
        quoted: p.quoted ? `${p.quoted.text} ${p.quoted.author.handle}` : '',
      });
      this.indexed.set(p.id, p.updatedAt);
    }
    for (const id of [...this.indexed.keys()]) {
      if (!live.has(id)) {
        this.index.discard(id);
        this.indexed.delete(id);
      }
    }
  }

  search(q: string): Set<string> {
    return new Set(this.index.search(q).map((r) => String(r.id)));
  }
}

export function filterPosts(posts: Post[], f: PostFilters, byPost: Map<string, Set<string>>, search?: PostSearch): Post[] {
  const q = f.search.trim();
  const hits = q && search ? search.search(q) : null;
  const author = f.author.trim().replace(/^@/, '').toLowerCase();
  return posts.filter((p) => {
    if (f.folder.kind === 'unfiled' && (byPost.get(p.id)?.size ?? 0) > 0) return false;
    if (f.folder.kind === 'folder' && !byPost.get(p.id)?.has(f.folder.folderId)) return false;
    if (hits && !hits.has(p.id)) return false;
    if (q && !search && !p.text.toLowerCase().includes(q.toLowerCase())) return false;
    if (author && !p.author.handle.toLowerCase().includes(author) && !p.author.name.toLowerCase().includes(author)) return false;
    if (f.media === 'none' && p.media.length) return false;
    if (f.media === 'with-media' && !p.media.length) return false;
    if ((f.media === 'image' || f.media === 'video' || f.media === 'gif') && !p.media.some((m) => m.type === f.media)) return false;
    if (f.from && p.postedAt < f.from) return false;
    if (f.to && p.postedAt > f.to) return false;
    return true;
  });
}
