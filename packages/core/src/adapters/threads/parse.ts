/**
 * Parser for Meta Threads web data (threads.com, formerly threads.net).
 *
 * Threads ships post data both in GraphQL responses and in JSON embedded in the
 * page HTML. Shapes vary between queries, so instead of hard-coding paths we
 * walk the JSON and pick out anything that looks like a post object:
 *   { pk|id, code, user: { username }, taken_at, caption?, image_versions2?, video_versions?, carousel_media? }
 * Quoted/reposted posts nested inside a post are attached as `quoted` rather
 * than collected as separate saved posts.
 */
import type { Author, MediaItem, ParsedPost, QuotedPost } from '../../schema';
import { isObject, walk, type Json } from '../../util';

export function looksLikeThreadsPost(o: Json): boolean {
  return (
    isObject(o) &&
    typeof o.code === 'string' &&
    isObject(o.user) &&
    typeof o.user.username === 'string' &&
    (typeof o.taken_at === 'number' || 'caption' in o || 'text_post_app_info' in o)
  );
}

function bestCandidate(candidates: Json[] | undefined): Json | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return [...candidates].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
}

function mediaOf(o: Json): MediaItem[] {
  if (Array.isArray(o.carousel_media) && o.carousel_media.length) {
    return o.carousel_media.flatMap((c: Json) => mediaOf(c));
  }
  const img = bestCandidate(o.image_versions2?.candidates);
  const vids: Json[] = Array.isArray(o.video_versions) ? o.video_versions : [];
  if (vids.length) {
    const best = [...vids].sort((a, b) => (b.width ?? 0) - (a.width ?? 0) || (a.type ?? 0) - (b.type ?? 0))[0];
    return [
      {
        type: 'video',
        url: best.url,
        previewUrl: img?.url ?? best.url,
        width: o.original_width ?? best.width,
        height: o.original_height ?? best.height,
      },
    ];
  }
  // Text-only posts still carry an image_versions2 with no candidates; skip those.
  if (img?.url) {
    return [{ type: 'image', url: img.url, previewUrl: img.url, width: o.original_width ?? img.width, height: o.original_height ?? img.height }];
  }
  return [];
}

function authorOf(user: Json): Author {
  return {
    id: String(user.pk ?? user.id ?? user.pk_id ?? ''),
    handle: user.username,
    name: user.full_name || user.username,
    avatarUrl: user.profile_pic_url ?? user.hd_profile_pic_versions?.[0]?.url,
    verified: Boolean(user.is_verified),
  };
}

function textOf(o: Json): string {
  if (typeof o.caption?.text === 'string') return o.caption.text;
  const frags: Json[] = o.text_post_app_info?.text_fragments?.fragments ?? [];
  if (frags.length) return frags.map((f) => f.plaintext ?? '').join('');
  return '';
}

export function threadsPostUrl(username: string, code: string): string {
  return `https://www.threads.com/@${username}/post/${code}`;
}

function quotedOf(o: Json): QuotedPost | undefined {
  const share = o.text_post_app_info?.share_info;
  const q = share?.quoted_post ?? share?.reposted_post;
  if (!looksLikeThreadsPost(q)) return undefined;
  return {
    platformId: q.code,
    url: threadsPostUrl(q.user.username, q.code),
    text: textOf(q),
    author: authorOf(q.user),
    media: mediaOf(q),
  };
}

export function parseThreadsPost(o: Json): ParsedPost | null {
  if (!looksLikeThreadsPost(o)) return null;
  return {
    platform: 'threads',
    platformId: o.code,
    extId: o.pk != null ? String(o.pk) : typeof o.id === 'string' ? o.id.split('_')[0] : undefined,
    url: threadsPostUrl(o.user.username, o.code),
    text: textOf(o),
    author: authorOf(o.user),
    media: mediaOf(o),
    quoted: quotedOf(o),
    postedAt: typeof o.taken_at === 'number' ? o.taken_at * 1000 : 0,
    metrics: {
      likes: o.like_count,
      replies: o.text_post_app_info?.direct_reply_count,
      reposts: o.text_post_app_info?.repost_count,
    },
  };
}

/** Collects every top-level post in a Threads payload, in document order. */
export function collectThreadsPosts(json: Json): ParsedPost[] {
  const out = new Map<string, ParsedPost>();
  walk(json, (obj) => {
    if (looksLikeThreadsPost(obj)) {
      const p = parseThreadsPost(obj);
      if (p && !out.has(p.platformId)) out.set(p.platformId, p);
      return false; // don't collect nested quoted posts separately
    }
  });
  return [...out.values()];
}

/** Finds a pagination cursor in a Threads GraphQL response, if any. */
export function threadsPageInfo(json: Json): { endCursor?: string; hasNextPage?: boolean } {
  let info: Json = null;
  walk(json, (obj) => {
    if (info) return false;
    if (isObject(obj.page_info) && ('end_cursor' in obj.page_info || 'has_next_page' in obj.page_info)) {
      info = obj.page_info;
      return false;
    }
  });
  return info ? { endCursor: info.end_cursor ?? undefined, hasNextPage: info.has_next_page } : {};
}

/** Recognises save/unsave actions in Threads web traffic. */
export function threadsSaveAction(url: string, body?: string | null): { action: 'save' | 'unsave'; mediaId?: string } | null {
  const rest = url.match(/\/media\/(\d+)(?:_\d+)?\/(save|unsave)\/?/);
  if (rest) return { action: rest[2] as 'save' | 'unsave', mediaId: rest[1] };
  if (!body) return null;
  const params = new URLSearchParams(body);
  const name = params.get('fb_api_req_friendly_name') ?? '';
  if (!/save/i.test(name) || /saved/i.test(name)) return null;
  let mediaId: string | undefined;
  try {
    const vars = JSON.parse(params.get('variables') ?? '{}');
    mediaId = String(vars.media_id ?? vars.mediaID ?? vars.post_id ?? vars.input?.media_id ?? '') || undefined;
  } catch {
    /* ignore */
  }
  return { action: /unsave/i.test(name) ? 'unsave' : 'save', mediaId };
}

/** GraphQL operation name of a Threads request (from the form body). */
export function threadsOperationName(body?: string | null): string | null {
  if (!body) return null;
  try {
    return new URLSearchParams(body).get('fb_api_req_friendly_name');
  } catch {
    return null;
  }
}
