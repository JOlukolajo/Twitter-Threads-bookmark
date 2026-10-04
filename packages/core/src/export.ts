/** Human-readable exports (Markdown, CSV). JSON backups live in backup.ts. */
import type { Folder, Post } from './schema';
import { PLATFORM_LABEL } from './schema';

function iso(ms: number): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : '';
}

function quoteBlock(text: string): string {
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

export function postToMarkdown(p: Post): string {
  const lines = [`### ${p.author.name} (@${p.author.handle}) · ${iso(p.postedAt)}`, '', p.text || '_(no text)_', ''];
  for (const m of p.media) {
    lines.push(m.type === 'image' ? `![image](${m.url})` : `[${m.type}](${m.url})`);
  }
  if (p.media.length) lines.push('');
  if (p.quoted) {
    lines.push(quoteBlock(`**@${p.quoted.author.handle}:** ${p.quoted.text}\n${p.quoted.url}`), '');
  }
  lines.push(`[Open on ${PLATFORM_LABEL[p.platform]}](${p.url})`, '', '---', '');
  return lines.join('\n');
}

/** Markdown export, grouped by folder when folders are given. */
export function toMarkdown(
  title: string,
  posts: Post[],
  opts: { folders?: Folder[]; byPost?: Map<string, Set<string>> } = {},
): string {
  const out = [`# ${title}`, '', `_Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${posts.length} posts_`, ''];
  if (opts.folders?.length && opts.byPost) {
    const unfiled: Post[] = [];
    const grouped = new Map<string, Post[]>(opts.folders.map((f) => [f.id, []]));
    for (const p of posts) {
      const ids = opts.byPost.get(p.id);
      if (!ids?.size) unfiled.push(p);
      else for (const id of ids) grouped.get(id)?.push(p);
    }
    for (const f of opts.folders) {
      const list = grouped.get(f.id) ?? [];
      if (!list.length) continue;
      out.push(`## ${f.name}`, '', ...list.map(postToMarkdown));
    }
    if (unfiled.length) out.push('## Unfiled', '', ...unfiled.map(postToMarkdown));
  } else {
    out.push(...posts.map(postToMarkdown));
  }
  return out.join('\n');
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(posts: Post[], folderNames: (p: Post) => string[] = () => []): string {
  const header = ['platform', 'id', 'url', 'author_name', 'author_handle', 'posted_at', 'saved_at', 'text', 'media_urls', 'folders', 'likes', 'reposts', 'replies'];
  const rows = posts.map((p) =>
    [
      p.platform,
      p.platformId,
      p.url,
      p.author.name,
      p.author.handle,
      p.postedAt ? new Date(p.postedAt).toISOString() : '',
      new Date(p.savedAt).toISOString(),
      p.text,
      p.media.map((m) => m.url).join(' '),
      folderNames(p).join('; '),
      p.metrics?.likes ?? '',
      p.metrics?.reposts ?? '',
      p.metrics?.replies ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM so Excel opens UTF-8 correctly.
  return '﻿' + [header.join(','), ...rows].join('\r\n');
}
