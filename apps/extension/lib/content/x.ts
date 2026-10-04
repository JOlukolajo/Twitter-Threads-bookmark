import * as xParser from '@saveboard/core/adapters/x/parse';
import type { HttpRequest } from '@saveboard/core/sync-engine';
import { TEMPLATE_KEYS } from '@saveboard/core/templates';
import type { CapturedResponse } from '../bridge';
import { sendToBackground } from '../messages';
import { PLATFORM_CONFIG } from '../platforms';
import type { ContentPlatform, ContentRuntime } from './runtime';

const TEMPLATE_OPS: string[] = Object.values(TEMPLATE_KEYS.x);

function ct0(): string | undefined {
  return document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
}

export const xContent: ContentPlatform = {
  platform: 'x',

  isOnSavedPage: () => location.pathname.startsWith(PLATFORM_CONFIG.x.savedPathPrefix),

  prepareRequest(req: HttpRequest): HttpRequest {
    const token = ct0();
    return token ? { ...req, headers: { ...req.headers, 'x-csrf-token': token } } : req;
  },

  async handleCaptured(c: CapturedResponse, rt: ContentRuntime) {
    const op = xParser.xOperationName(c.url);
    if (!op || c.status !== 200) return;
    rt.seen();
    if (c.method === 'GET' && TEMPLATE_OPS.includes(op)) rt.template(op, c);

    let json: unknown;
    try {
      json = JSON.parse(c.body);
    } catch {
      return;
    }
    rt.cache.add(xParser.collectTweets(json));
    const vars = xParser.xRequestVariables(c.url, c.requestBody);
    const tweetId: string | undefined = vars.tweet_id ? String(vars.tweet_id) : undefined;

    switch (op) {
      case 'Bookmarks': {
        const page = xParser.parseTimeline(json);
        const result = await rt.ingest(page.posts, vars.cursor ? 'bottom' : 'top');
        rt.scroll.notePage(page.posts, result, page.entryCount === 0);
        break;
      }
      case 'BookmarkFolderTimeline': {
        const page = xParser.parseTimeline(json);
        const posts = page.posts.map(({ sortIndex: _ignored, ...p }) => p);
        await rt.ingest(posts, 'bottom');
        if (vars.bookmark_collection_id) {
          await sendToBackground({
            type: 'externalFolderItems',
            platform: 'x',
            externalFolderId: String(vars.bookmark_collection_id),
            platformIds: posts.map((p) => p.platformId),
            member: true,
          }).catch(() => {});
        }
        break;
      }
      case 'BookmarkFoldersSlice': {
        const { folders } = xParser.parseBookmarkFolders(json);
        if (folders.length) await sendToBackground({ type: 'externalFolders', platform: 'x', folders }).catch(() => {});
        break;
      }
      case 'CreateBookmark': {
        const p = tweetId ? rt.cache.get(tweetId) : undefined;
        if (p) await rt.ingest([p], 'top');
        else await sendToBackground({ type: 'needsSync', platform: 'x' }).catch(() => {});
        break;
      }
      case 'DeleteBookmark': {
        if (tweetId) await sendToBackground({ type: 'unsave', platform: 'x', platformId: tweetId }).catch(() => {});
        break;
      }
      case 'bookmarkTweetToFolder':
      case 'RemoveTweetFromBookmarkFolder': {
        if (!tweetId || !vars.bookmark_collection_id) break;
        const p = rt.cache.get(tweetId);
        if (p && op === 'bookmarkTweetToFolder') await rt.ingest([p], 'top');
        await sendToBackground({
          type: 'externalFolderItems',
          platform: 'x',
          externalFolderId: String(vars.bookmark_collection_id),
          platformIds: [tweetId],
          member: op === 'bookmarkTweetToFolder',
        }).catch(() => {});
        break;
      }
    }
  },
};
