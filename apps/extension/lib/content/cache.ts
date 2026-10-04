import type { ParsedPost } from '@saveboard/core/schema';

/**
 * Remembers posts seen anywhere on the site (home feed, profiles, search...).
 * When you bookmark/save one, or file it with the "Add to folder" chip, we
 * already have its content and can store it immediately.
 */
export class PostCache {
  private byId = new Map<string, ParsedPost>();
  private byExt = new Map<string, string>();

  constructor(private max = 3000) {}

  add(posts: ParsedPost[]): void {
    for (const p of posts) {
      this.byId.delete(p.platformId);
      this.byId.set(p.platformId, p);
      if (p.extId) this.byExt.set(p.extId, p.platformId);
    }
    while (this.byId.size > this.max) {
      const oldest = this.byId.keys().next().value as string;
      const ext = this.byId.get(oldest)?.extId;
      this.byId.delete(oldest);
      if (ext) this.byExt.delete(ext);
    }
  }

  get(platformId: string): ParsedPost | undefined {
    return this.byId.get(platformId);
  }

  getByExt(extId: string): ParsedPost | undefined {
    const id = this.byExt.get(extId);
    return id ? this.byId.get(id) : undefined;
  }
}
