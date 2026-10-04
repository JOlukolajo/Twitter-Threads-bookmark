/**
 * Messages between content scripts / app pages and the background worker.
 * The background owns writes coming from the sites; the app reads the DB directly.
 */
import { browser, type Browser } from 'wxt/browser';
import type { Folder, ParsedPost, Platform, RequestTemplate, SyncKind } from '@saveboard/core/schema';
import type { IngestResult, PagePosition, Settings } from '@saveboard/core/repo';
import type { HttpRequest, HttpResponse } from '@saveboard/core/sync-engine';
import type { ThreadsTokens } from '@saveboard/core/adapters/threads/replay';

export type BgRequest =
  | { type: 'ingest'; platform: Platform; posts: ParsedPost[]; position: PagePosition }
  | { type: 'unsave'; platform: Platform; platformId?: string; extId?: string }
  | { type: 'seen'; platform: Platform }
  | { type: 'template'; platform: Platform; op: string; template: RequestTemplate }
  | { type: 'externalFolders'; platform: Platform; folders: { externalId: string; name: string }[] }
  | { type: 'externalFolderItems'; platform: Platform; externalFolderId: string; platformIds: string[]; member: boolean }
  | { type: 'needsSync'; platform: Platform }
  | { type: 'sync:start'; platform: Platform; kind: SyncKind }
  | { type: 'scroll:done'; platform: Platform; reachedEnd: boolean; seen: number; message?: string }
  | { type: 'sync:stop'; platform: Platform }
  | { type: 'folders:forPost'; platform: Platform; postId: string }
  | { type: 'folders:toggle'; platform: Platform; postId: string; folderId: string; member: boolean }
  | { type: 'folders:create'; platform: Platform; name: string; postId?: string }
  | { type: 'settings:get' }
  | { type: 'settings:changed' };

export interface FoldersForPost {
  folders: Pick<Folder, 'id' | 'name'>[];
  memberOf: string[];
}

export type BgResponse<T extends BgRequest['type']> = T extends 'ingest'
  ? IngestResult
  : T extends 'folders:forPost'
    ? FoldersForPost
    : T extends 'folders:create'
      ? Pick<Folder, 'id' | 'name'>
      : T extends 'settings:get'
        ? Settings
        : T extends 'sync:start'
          ? { started: boolean; message?: string }
          : unknown;

export async function sendToBackground<R extends BgRequest>(msg: R): Promise<BgResponse<R['type']>> {
  const res = await browser.runtime.sendMessage(msg);
  if (res && typeof res === 'object' && '__error' in res) throw new Error(String((res as { __error: unknown }).__error));
  return res as BgResponse<R['type']>;
}

/** Messages the background sends to a content script in a site tab. */
export type TabRequest =
  | { type: 'ping' }
  /** Make a request from inside the page (carries the user's session). */
  | { type: 'pageFetch'; req: HttpRequest }
  | { type: 'threadsTokens' }
  /** Fallback sync: scroll the saved page and let passive capture collect posts. */
  | { type: 'scroll:run'; kind: SyncKind }
  | { type: 'scroll:stop' }
  | { type: 'settings:changed'; settings: Settings };

export type TabResponse<T extends TabRequest['type']> = T extends 'pageFetch'
  ? HttpResponse
  : T extends 'threadsTokens'
    ? ThreadsTokens
    : T extends 'ping'
      ? { ok: true; path: string }
      : unknown;

export async function sendToTab<R extends TabRequest>(tabId: number, msg: R): Promise<TabResponse<R['type']>> {
  const res = await browser.tabs.sendMessage(tabId, msg);
  if (res && typeof res === 'object' && '__error' in res) throw new Error(String((res as { __error: unknown }).__error));
  return res as TabResponse<R['type']>;
}

/** Wires a handler so async results (or errors) reach the sender. */
export function onMessage<Req>(handler: (msg: Req, sender: Browser.runtime.MessageSender) => Promise<unknown> | unknown) {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    Promise.resolve()
      .then(() => handler(msg as Req, sender))
      .then(
        (r) => sendResponse(r ?? null),
        (e) => sendResponse({ __error: e instanceof Error ? e.message : String(e) }),
      );
    return true;
  });
}
