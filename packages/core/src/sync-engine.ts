/**
 * The sync loop. It replays the site's own "list saved posts" request page by
 * page through a transport (in the extension: a fetch made inside an open tab of
 * the site, so it carries the user's session), parses each page and stores it.
 *
 * It is driven from the background worker rather than the tab so pacing timers
 * are not throttled when the tab is in the background.
 */
import type { SaveboardDB } from './db';
import { buildXRequest, retryAfterMs } from './adapters/x/replay';
import { parseBookmarkFolders, parseTimeline } from './adapters/x/parse';
import { buildThreadsRequest, type ThreadsTokens } from './adapters/threads/replay';
import { collectThreadsPosts, threadsPageInfo } from './adapters/threads/parse';
import { ingestPosts, reconcileFullSync, setFolderMembership, upsertExternalFolders } from './repo';
import { postId, type ParsedPost, type Platform, type RequestTemplate, type SyncKind } from './schema';
import { jitter, parseJsonLoose, sleep as realSleep } from './util';
import { TEMPLATE_KEYS, primaryTemplateKey } from './templates';

export { TEMPLATE_KEYS, primaryTemplateKey };

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SyncTransport {
  fetch(req: HttpRequest): Promise<HttpResponse>;
  /** Threads only: fresh session tokens from the live page. */
  threadsTokens?(): Promise<ThreadsTokens>;
}

export interface SyncProgress {
  pages: number;
  seen: number;
  newCount: number;
}

export interface SyncHooks {
  onProgress?(p: SyncProgress): void | Promise<void>;
  shouldStop?(): boolean;
  sleep?(ms: number): Promise<void>;
  /** Delay between pages (ms). */
  pageDelayMs?: number;
  maxPages?: number;
}

export interface SyncOutcome {
  ok: boolean;
  pages: number;
  newCount: number;
  seenCount: number;
  reachedEnd: boolean;
  removed: number;
  foldersImported: number;
  message: string;
  /** The request format looks stale or broken; a scroll-based sync may still work. */
  apiBroken?: boolean;
  authProblem?: boolean;
}

interface Page {
  posts: ParsedPost[];
  nextCursor?: string;
  empty: boolean;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public retryAfter?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

async function fetchJson(transport: SyncTransport, req: HttpRequest): Promise<unknown[]> {
  const res = await transport.fetch(req);
  if (res.status !== 200) throw new HttpError(res.status, retryAfterMs(res.headers));
  const docs = parseJsonLoose(res.body);
  if (!docs.length) throw new HttpError(598);
  // GraphQL errors with no data usually mean the request shape went stale.
  const first = docs[0] as { data?: unknown; errors?: unknown[] };
  if (!first.data && first.errors?.length) throw new HttpError(597);
  return docs;
}

async function withRetries<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>, shouldStop?: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof HttpError) || attempt >= 3 || shouldStop?.()) throw e;
      if (e.status === 429) await sleep(Math.min(e.retryAfter ?? 60_000, 15 * 60_000));
      else if (e.status >= 500 && e.status < 597) await sleep(5_000 * (attempt + 1));
      else throw e;
    }
  }
}

export async function runApiSync(
  db: SaveboardDB,
  platform: Platform,
  kind: SyncKind,
  templates: Record<string, RequestTemplate>,
  transport: SyncTransport,
  hooks: SyncHooks = {},
): Promise<SyncOutcome> {
  const sleep = hooks.sleep ?? realSleep;
  const delay = hooks.pageDelayMs ?? 1500;
  const maxPages = hooks.maxPages ?? 10_000;
  const startedAt = Date.now();
  const outcome: SyncOutcome = { ok: false, pages: 0, newCount: 0, seenCount: 0, reachedEnd: false, removed: 0, foldersImported: 0, message: '' };
  const template = templates[primaryTemplateKey(platform)];
  if (!template) {
    outcome.message = `Open your ${platform === 'x' ? 'X bookmarks' : 'Threads saved'} page once so the extension can learn how to sync.`;
    outcome.apiBroken = true;
    return outcome;
  }

  const tokens = platform === 'threads' && transport.threadsTokens ? await transport.threadsTokens().catch(() => ({})) : {};

  const fetchPage = async (cursor?: string): Promise<Page> => {
    if (platform === 'x') {
      const docs = await fetchJson(transport, buildXRequest(template, { cursor }));
      const page = parseTimeline(docs[0]);
      return { posts: page.posts, nextCursor: page.bottomCursor, empty: page.entryCount === 0 };
    }
    const docs = await fetchJson(transport, buildThreadsRequest(template, { cursor, tokens }));
    const posts = docs.flatMap((d) => collectThreadsPosts(d));
    const info = docs.map((d) => threadsPageInfo(d)).find((i) => i.endCursor !== undefined || i.hasNextPage !== undefined) ?? {};
    return { posts, nextCursor: info.hasNextPage === false ? undefined : info.endCursor, empty: posts.length === 0 };
  };

  const seen = new Set<string>();
  const usedCursors = new Set<string>();
  let cursor: string | undefined;
  try {
    while (outcome.pages < maxPages) {
      const page = await withRetries(() => fetchPage(cursor), sleep, hooks.shouldStop);
      outcome.pages++;
      const res = await ingestPosts(db, platform, page.posts, { position: cursor ? 'bottom' : 'top' });
      page.posts.forEach((p) => seen.add(p.platformId));
      outcome.newCount += res.newCount;
      await hooks.onProgress?.({ pages: outcome.pages, seen: seen.size, newCount: outcome.newCount });
      if (page.empty || !page.nextCursor || usedCursors.has(page.nextCursor)) {
        outcome.reachedEnd = true;
        break;
      }
      if (kind === 'incremental' && res.knownCount > 0) break;
      if (hooks.shouldStop?.()) break;
      usedCursors.add((cursor = page.nextCursor));
      await sleep(jitter(delay));
    }
    outcome.seenCount = seen.size;

    if (kind === 'full' && outcome.reachedEnd) {
      const r = await reconcileFullSync(db, platform, seen, startedAt);
      outcome.removed = r.removed;
    }
    if (platform === 'x' && kind === 'full' && !hooks.shouldStop?.()) {
      outcome.foldersImported = await syncXFolders(db, templates, transport, sleep, delay, hooks.shouldStop).catch(() => 0);
    }
    outcome.ok = true;
    outcome.message = summary(outcome, platform);
  } catch (e) {
    outcome.seenCount = seen.size;
    const status = e instanceof HttpError ? e.status : 0;
    outcome.authProblem = status === 401 || status === 403;
    outcome.apiBroken = !outcome.authProblem && status !== 429;
    outcome.message = outcome.authProblem
      ? `Not logged in to ${platform === 'x' ? 'X' : 'Threads'} (or the session expired). Log in and try again.`
      : status === 429
        ? 'Rate limited by the site. The next sync will continue.'
        : `Sync stopped (${e instanceof Error ? e.message : 'unknown error'}).`;
  }
  return outcome;
}

function summary(o: SyncOutcome, platform: Platform): string {
  const label = platform === 'x' ? 'bookmarks' : 'saved posts';
  const parts = [o.newCount ? `${o.newCount} new ${label}` : `No new ${label}`];
  if (o.removed) parts.push(`${o.removed} removed`);
  if (o.foldersImported) parts.push(`${o.foldersImported} folders synced`);
  return parts.join(', ');
}

/** Imports X bookmark folders (Premium feature on X) if we have captured how to list them. */
async function syncXFolders(
  db: SaveboardDB,
  templates: Record<string, RequestTemplate>,
  transport: SyncTransport,
  sleep: (ms: number) => Promise<void>,
  delay: number,
  shouldStop?: () => boolean,
): Promise<number> {
  const listT = templates[TEMPLATE_KEYS.x.folders];
  const timelineT = templates[TEMPLATE_KEYS.x.folderTimeline];
  if (!listT) return 0;
  const docs = await fetchJson(transport, buildXRequest(listT));
  const { folders } = parseBookmarkFolders(docs[0]);
  const local = await upsertExternalFolders(db, 'x', folders);
  if (!timelineT) return local.length;
  for (const f of local) {
    let cursor: string | undefined;
    const used = new Set<string>();
    for (let i = 0; i < 500 && !shouldStop?.(); i++) {
      await sleep(jitter(delay));
      const page = parseTimeline((await fetchJson(transport, buildXRequest(timelineT, { cursor, variables: { bookmark_collection_id: f.externalId } })))[0]);
      // Folder timelines have their own sort order; keep the main bookmarks order.
      const posts = page.posts.map(({ sortIndex: _ignored, ...p }) => p);
      await ingestPosts(db, 'x', posts, { position: 'bottom' });
      await setFolderMembership(db, 'x', f.id, page.posts.map((p) => postId('x', p.platformId)), true);
      if (!page.entryCount || !page.bottomCursor || used.has(page.bottomCursor)) break;
      used.add((cursor = page.bottomCursor));
    }
  }
  return local.length;
}
