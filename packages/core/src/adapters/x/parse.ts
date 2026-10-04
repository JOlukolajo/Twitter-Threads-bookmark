/**
 * Parsers for X's web GraphQL responses (Bookmarks, BookmarkFolderTimeline,
 * BookmarkFoldersSlice, and any timeline that contains tweets).
 *
 * These are written defensively: X changes field locations from time to time,
 * so we look in every place a field has historically lived.
 */
import type { Author, MediaItem, ParsedPost, QuotedPost } from '../../schema';
import { decodeEntities, isObject, walk, type Json } from '../../util';

const TWITTER_EPOCH = 1288834974657n;

/** Tweet ids are snowflakes; the timestamp is embedded in the id. */
export function snowflakeToMs(id: string): number {
  try {
    return Number((BigInt(id) >> 22n) + TWITTER_EPOCH);
  } catch {
    return 0;
  }
}

/** Unwraps TweetWithVisibilityResults / limited-action wrappers. */
export function unwrapTweet(result: Json): Json | null {
  if (!isObject(result)) return null;
  if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) return unwrapTweet(result.tweet);
  if (result.tweet && !result.legacy) return unwrapTweet(result.tweet);
  if (result.__typename === 'TweetTombstone' || result.__typename === 'TweetUnavailable') return null;
  if (!result.rest_id || !isObject(result.legacy)) return null;
  return result;
}

function parseAuthor(userResult: Json): Author {
  const u = isObject(userResult) ? userResult : {};
  const legacy = isObject(u.legacy) ? u.legacy : {};
  const core = isObject(u.core) ? u.core : {};
  const handle: string = core.screen_name ?? legacy.screen_name ?? '';
  const avatar: string | undefined = u.avatar?.image_url ?? legacy.profile_image_url_https;
  return {
    id: String(u.rest_id ?? ''),
    handle,
    name: core.name ?? legacy.name ?? handle,
    avatarUrl: avatar ? avatar.replace('_normal.', '_bigger.') : undefined,
    verified: Boolean(u.is_blue_verified || legacy.verified || u.verification?.verified),
  };
}

export function bestImageUrl(mediaUrlHttps: string): string {
  if (!mediaUrlHttps) return mediaUrlHttps;
  try {
    const u = new URL(mediaUrlHttps);
    const m = u.pathname.match(/^(.*)\.(jpg|jpeg|png|webp)$/i);
    if (m && u.hostname === 'pbs.twimg.com') {
      return `https://pbs.twimg.com${m[1]}?format=${m[2].toLowerCase()}&name=orig`;
    }
  } catch {
    /* keep as is */
  }
  return mediaUrlHttps;
}

function parseMedia(legacy: Json): MediaItem[] {
  const list: Json[] = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
  return list.map((m): MediaItem => {
    const preview = bestImageUrl(m.media_url_https ?? m.media_url ?? '');
    const width = m.original_info?.width;
    const height = m.original_info?.height;
    if (m.type === 'video' || m.type === 'animated_gif') {
      const variants: Json[] = m.video_info?.variants ?? [];
      const mp4s = variants.filter((v) => v.content_type === 'video/mp4' && v.url);
      mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = mp4s[0]?.url ?? variants[0]?.url ?? preview;
      return { type: m.type === 'video' ? 'video' : 'gif', url: best, previewUrl: preview, width, height };
    }
    return { type: 'image', url: preview, previewUrl: preview, width, height };
  });
}

/** Expands t.co links and strips trailing media links from the text. */
function cleanText(text: string, legacy: Json, isNote: boolean): string {
  let out = text;
  const urls: Json[] = legacy.entities?.urls ?? [];
  for (const u of urls) {
    if (u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  }
  if (!isNote) {
    const media: Json[] = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
    for (const m of media) if (m.url) out = out.split(m.url).join('');
  }
  return decodeEntities(out).trim();
}

function tweetUrl(handle: string, id: string): string {
  return `https://x.com/${handle || 'i/web'}/status/${id}`;
}

function parseQuoted(result: Json): QuotedPost | undefined {
  const t = unwrapTweet(result);
  if (!t) return undefined;
  const author = parseAuthor(t.core?.user_results?.result);
  const note = t.note_tweet?.note_tweet_results?.result?.text;
  return {
    platformId: String(t.rest_id),
    url: tweetUrl(author.handle, t.rest_id),
    text: cleanText(note ?? t.legacy.full_text ?? '', t.legacy, Boolean(note)),
    author,
    media: parseMedia(t.legacy),
  };
}

/** Parses a single (already unwrapped) tweet result. Retweets resolve to the original tweet. */
export function parseTweet(raw: Json, sortIndex?: string): ParsedPost | null {
  let t = unwrapTweet(raw);
  if (!t) return null;
  const rt = unwrapTweet(t.legacy.retweeted_status_result?.result);
  if (rt) t = rt;
  const legacy = t.legacy;
  const author = parseAuthor(t.core?.user_results?.result);
  const id = String(t.rest_id);
  const note: string | undefined = t.note_tweet?.note_tweet_results?.result?.text;
  const views = Number(t.views?.count);
  return {
    platform: 'x',
    platformId: id,
    url: tweetUrl(author.handle, id),
    text: cleanText(note ?? legacy.full_text ?? '', legacy, Boolean(note)),
    author,
    media: parseMedia(legacy),
    quoted: t.quoted_status_result ? parseQuoted(t.quoted_status_result.result) : undefined,
    postedAt: snowflakeToMs(id) || Date.parse(legacy.created_at) || 0,
    metrics: {
      likes: legacy.favorite_count,
      reposts: legacy.retweet_count,
      replies: legacy.reply_count,
      views: Number.isFinite(views) ? views : undefined,
    },
    sortIndex,
  };
}

export interface XTimelinePage {
  posts: ParsedPost[];
  bottomCursor?: string;
  topCursor?: string;
  /** Number of tweet entries in the page (an empty page means we reached the end). */
  entryCount: number;
}

function findInstructions(json: Json): Json[] {
  let found: Json[] | null = null;
  walk(json, (obj) => {
    if (found) return false;
    if (Array.isArray(obj.instructions)) {
      found = obj.instructions;
      return false;
    }
  });
  return found ?? [];
}

function entryTweet(content: Json): Json | null {
  return content?.itemContent?.tweet_results?.result ?? content?.item?.itemContent?.tweet_results?.result ?? null;
}

/** Parses any timeline-shaped response (Bookmarks, BookmarkFolderTimeline, ...). */
export function parseTimeline(json: Json): XTimelinePage {
  const page: XTimelinePage = { posts: [], entryCount: 0 };
  const entries: Json[] = [];
  for (const ins of findInstructions(json)) {
    if (Array.isArray(ins.entries)) entries.push(...ins.entries);
    if (ins.entry) entries.push(ins.entry);
  }
  for (const entry of entries) {
    const content = entry.content ?? {};
    const cursorType = content.cursorType ?? content.itemContent?.cursorType;
    if (content.entryType === 'TimelineTimelineCursor' || cursorType) {
      if (cursorType === 'Bottom') page.bottomCursor = content.value ?? content.itemContent?.value;
      if (cursorType === 'Top') page.topCursor = content.value ?? content.itemContent?.value;
      continue;
    }
    const items: Json[] = Array.isArray(content.items) ? content.items : [content];
    for (const item of items) {
      const tweet = entryTweet(item);
      if (!tweet) continue;
      page.entryCount++;
      const parsed = parseTweet(tweet, entry.sortIndex);
      if (parsed) page.posts.push(parsed);
    }
  }
  return page;
}

/** Collects every tweet anywhere in a response. Used to remember tweets seen in any feed. */
export function collectTweets(json: Json): ParsedPost[] {
  const out = new Map<string, ParsedPost>();
  walk(json, (obj, key) => {
    if (key === 'tweet_results' && obj.result) {
      const p = parseTweet(obj.result);
      if (p && !out.has(p.platformId)) out.set(p.platformId, p);
    }
  });
  return [...out.values()];
}

export interface XBookmarkFolder {
  externalId: string;
  name: string;
}

export function parseBookmarkFolders(json: Json): { folders: XBookmarkFolder[]; nextCursor?: string } {
  let slice: Json = null;
  walk(json, (obj) => {
    if (slice) return false;
    if (isObject(obj.bookmark_collections_slice)) {
      slice = obj.bookmark_collections_slice;
      return false;
    }
  });
  if (!slice) return { folders: [] };
  const items: Json[] = slice.items ?? [];
  return {
    folders: items.filter((i) => i?.id && i?.name).map((i) => ({ externalId: String(i.id), name: String(i.name) })),
    nextCursor: slice.slice_info?.next_cursor,
  };
}

/** Extracts the GraphQL operation name from an X API URL. */
export function xOperationName(url: string): string | null {
  const m = url.match(/\/i\/api\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

/** Reads the `variables` of a GraphQL request from its URL (GET) or JSON body (POST). */
export function xRequestVariables(url: string, body?: string | null): Json {
  try {
    const v = new URL(url, 'https://x.com').searchParams.get('variables');
    if (v) return JSON.parse(v);
  } catch {
    /* ignore */
  }
  if (body) {
    try {
      return JSON.parse(body).variables ?? {};
    } catch {
      /* ignore */
    }
  }
  return {};
}
