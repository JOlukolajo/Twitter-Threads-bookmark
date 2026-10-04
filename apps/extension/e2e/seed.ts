/** Deterministic demo library (also used for store screenshots). */
import type { Backup, Folder, FolderItem, Platform, Post } from '@saveboard/core';

const AUTHORS = [
  { handle: 'naval', name: 'Naval' },
  { handle: 'paulg', name: 'Paul Graham' },
  { handle: 'rauchg', name: 'Guillermo Rauch' },
  { handle: 'sarah_designs', name: 'Sarah Chen' },
  { handle: 'devon_codes', name: 'Devon Park' },
  { handle: 'amara.builds', name: 'Amara Okafor' },
];

const TEXTS = [
  'The best way to learn Rust is to build something you actually need. Here is my 10-step plan 🧵',
  'Design systems are products, not projects. Treat them that way and they will outlive every redesign.',
  'Write the docs first. If you cannot explain it simply, the API is not ready.',
  'Startups do things that do not scale — and then they make the things that worked scale.',
  'Color palette inspiration for dark mode dashboards 🎨',
  'Shipped a new onboarding flow today. Activation up 23%. Lessons learned below.',
  'Hot take: most performance problems are data-shape problems.',
  'A thread on pricing pages that convert (with examples) 👇',
  'Typography tip: line length between 60 and 75 characters reads best.',
  'We migrated 4M rows to Postgres with zero downtime. Here is exactly how.',
  'Weekend project: a tiny CLI that turns screenshots into alt text.',
  'The compounding effect of small daily improvements is underrated.',
];

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 8, 30);

function makePosts(platform: Platform, n: number): Post[] {
  return Array.from({ length: n }, (_, i) => {
    const a = AUTHORS[i % AUTHORS.length];
    const id = platform === 'x' ? String(1850000000000000000n + BigInt(i * 1000)) : `DEMO${String(i).padStart(4, '0')}`;
    const mediaCount = i % 3 === 0 ? 0 : i % 4 === 1 ? 2 : 1;
    const host = platform === 'x' ? 'https://pbs.twimg.com/media/' : 'https://scontent.cdninstagram.com/v/';
    const media = Array.from({ length: mediaCount }, (_, k) => {
      const url = `${host}demo-${platform}-${i}-${k}.jpg`;
      return i % 5 === 2 && k === 0 ? { type: 'video' as const, url: url.replace('.jpg', '.mp4'), previewUrl: url } : { type: 'image' as const, url, previewUrl: url };
    });
    const t = BASE - i * DAY * 1.7;
    return {
      id: `${platform}:${id}`,
      platform,
      platformId: id,
      url: platform === 'x' ? `https://x.com/${a.handle}/status/${id}` : `https://www.threads.com/@${a.handle}/post/${id}`,
      text: TEXTS[i % TEXTS.length],
      author: { id: String(i % AUTHORS.length), handle: a.handle, name: a.name, avatarUrl: `${host}avatar-${a.handle}.jpg`, verified: i % 4 === 0 },
      media,
      postedAt: t,
      savedAt: t + DAY / 3,
      sortKey: String(10n ** 15n + BigInt(n - i)).padStart(24, '0'),
      metrics: { likes: 120 + i * 37, reposts: 10 + i * 3, replies: 4 + i },
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
  });
}

function makeFolders(platform: Platform, names: string[]): Folder[] {
  return names.map((name, i) => ({ id: `${platform}-folder-${i}`, platform, name, order: i, createdAt: BASE, updatedAt: BASE, deletedAt: null }));
}

export function demoBackup(opts: { withFolders?: boolean } = {}): Backup {
  const xPosts = makePosts('x', 24);
  const thPosts = makePosts('threads', 14);
  const folders = opts.withFolders ? [...makeFolders('x', ['Design', 'Engineering', 'Startups', 'Read later']), ...makeFolders('threads', ['Inspiration', 'Recipes'])] : [];
  const folderItems: FolderItem[] = [];
  if (opts.withFolders) {
    const add = (platform: Platform, folderId: string, postIds: string[]) =>
      postIds.forEach((postId) => folderItems.push({ id: `${folderId}|${postId}`, platform, folderId, postId, createdAt: BASE, updatedAt: BASE, deletedAt: null }));
    add('x', 'x-folder-0', [xPosts[1], xPosts[4], xPosts[8], xPosts[13]].map((p) => p.id));
    add('x', 'x-folder-1', [xPosts[0], xPosts[6], xPosts[9], xPosts[10]].map((p) => p.id));
    add('x', 'x-folder-2', [xPosts[3], xPosts[5], xPosts[7]].map((p) => p.id));
    add('threads', 'threads-folder-0', [thPosts[1], thPosts[4]].map((p) => p.id));
  }
  return { format: 'saveboard-backup', version: 1, exportedAt: BASE, scope: 'all', posts: [...xPosts, ...thPosts], folders, folderItems };
}
