import * as threadsParser from '@saveboard/core/adapters/threads/parse';
import { cursorKey, extractThreadsTokens } from '@saveboard/core/adapters/threads/replay';
import { parseJsonLoose } from '@saveboard/core/util';
import type { ParsedPost } from '@saveboard/core/schema';
import { TEMPLATE_KEYS } from '@saveboard/core/templates';
import type { CapturedResponse } from '../bridge';
import { sendToBackground } from '../messages';
import { PLATFORM_CONFIG } from '../platforms';
import type { ContentPlatform, ContentRuntime } from './runtime';

/** Queries that load other feeds; never treat their posts as saved posts. */
const NOT_SAVED = /feed|home|for_?you|following|notification|activity|search|profile|reply|replies|thread_?detail|post_?page|suggest|recommend/i;

function onSaved(): boolean {
  return location.pathname.startsWith(PLATFORM_CONFIG.threads.savedPathPrefix);
}

function requestVars(body: string | null): Record<string, unknown> {
  try {
    return JSON.parse(new URLSearchParams(body ?? '').get('variables') ?? '{}');
  } catch {
    return {};
  }
}

/** Saved posts embedded in the initial HTML of threads.com/saved. */
export function ingestEmbeddedSaved(rt: ContentRuntime): void {
  const posts: ParsedPost[] = [];
  const seen = new Set<string>();
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const text = s.textContent ?? '';
    if (!text.includes('"code"') || !text.includes('"username"')) continue;
    for (const doc of parseJsonLoose(text)) {
      for (const p of threadsParser.collectThreadsPosts(doc)) {
        if (!seen.has(p.platformId)) {
          seen.add(p.platformId);
          posts.push(p);
        }
      }
    }
  }
  rt.cache.add(posts);
  if (posts.length && onSaved()) void rt.ingest(posts, 'top');
}

export const threadsContent: ContentPlatform = {
  platform: 'threads',

  isOnSavedPage: onSaved,

  threadsTokens: () => extractThreadsTokens(document.documentElement.innerHTML),

  async handleCaptured(c: CapturedResponse, rt: ContentRuntime) {
    const action = threadsParser.threadsSaveAction(c.url, c.requestBody);
    if (c.status !== 200) return;
    rt.seen();

    if (action) {
      if (action.action === 'unsave' && action.mediaId) {
        await sendToBackground({ type: 'unsave', platform: 'threads', extId: action.mediaId }).catch(() => {});
      } else if (action.action === 'save') {
        const p = action.mediaId ? rt.cache.getByExt(action.mediaId) : undefined;
        if (p) await rt.ingest([p], 'top');
        else await sendToBackground({ type: 'needsSync', platform: 'threads' }).catch(() => {});
      }
      return;
    }

    const docs = parseJsonLoose(c.body);
    const posts = docs.flatMap((d) => threadsParser.collectThreadsPosts(d));
    rt.cache.add(posts);

    const name = threadsParser.threadsOperationName(c.requestBody) ?? c.requestHeaders['x-fb-friendly-name'] ?? '';
    const savedQuery = /saved|bookmark/i.test(name);
    if (!onSaved() || !posts.length || (!savedQuery && NOT_SAVED.test(name))) return;

    const vars = requestVars(c.requestBody);
    const cursor = vars[cursorKey(vars)];
    if (c.method === 'POST' && c.requestBody) {
      rt.template(TEMPLATE_KEYS.threads.saved, c, new URLSearchParams(c.requestBody).get('doc_id') ?? name);
    }
    const info = docs.map((d) => threadsParser.threadsPageInfo(d)).find((i) => i.hasNextPage !== undefined) ?? {};
    const result = await rt.ingest(posts, cursor ? 'bottom' : 'top');
    rt.scroll.notePage(posts, result, info.hasNextPage === false);
  },
};
