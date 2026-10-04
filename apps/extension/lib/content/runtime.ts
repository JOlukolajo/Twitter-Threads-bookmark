/**
 * Shared plumbing for the X and Threads content scripts (isolated world):
 * receives captured responses from the page, answers background requests,
 * and runs the scroll-based fallback sync.
 */
import { browser } from 'wxt/browser';
import { sleep } from '@saveboard/core/util';
import type { HttpRequest } from '@saveboard/core/sync-engine';
import type { IngestResult, PagePosition, Settings } from '@saveboard/core/repo';
import type { ParsedPost, Platform, RequestTemplate, SyncKind } from '@saveboard/core/schema';
import type { ThreadsTokens } from '@saveboard/core/adapters/threads/replay';
import { isMainMessage, pageFetch, type CapturedResponse } from '../bridge';
import { sendToBackground, type TabRequest } from '../messages';
import { PostCache } from './cache';

export interface ContentPlatform {
  platform: Platform;
  handleCaptured(c: CapturedResponse, rt: ContentRuntime): void | Promise<void>;
  /** Adjusts a replayed request right before it is sent (e.g. fresh CSRF token). */
  prepareRequest?(req: HttpRequest): HttpRequest;
  threadsTokens?(): ThreadsTokens;
  isOnSavedPage(): boolean;
}

export class ContentRuntime {
  readonly cache = new PostCache();
  settings: Settings | null = null;
  private lastSeenSent = 0;
  private templateSigs = new Map<string, string>();
  readonly scroll = new ScrollRunner(this);
  private settingsListeners: ((s: Settings) => void)[] = [];

  constructor(readonly impl: ContentPlatform) {}

  get platform(): Platform {
    return this.impl.platform;
  }

  start(): void {
    window.addEventListener('message', (e) => {
      if (!isMainMessage(e) || e.data.type !== 'response') return;
      Promise.resolve(this.impl.handleCaptured(e.data, this)).catch((err) => console.debug('[saveboard] capture error', err));
    });

    browser.runtime.onMessage.addListener((msg: TabRequest, _sender, sendResponse) => {
      this.handleTabRequest(msg).then(
        (r) => sendResponse(r ?? null),
        (e) => sendResponse({ __error: e instanceof Error ? e.message : String(e) }),
      );
      return true;
    });

    sendToBackground({ type: 'settings:get' })
      .then((s) => this.setSettings(s))
      .catch(() => {});
  }

  onSettings(fn: (s: Settings) => void): void {
    this.settingsListeners.push(fn);
    if (this.settings) fn(this.settings);
  }

  private setSettings(s: Settings) {
    this.settings = s;
    this.settingsListeners.forEach((fn) => fn(s));
  }

  private async handleTabRequest(msg: TabRequest): Promise<unknown> {
    switch (msg.type) {
      case 'ping':
        return { ok: true, path: location.pathname };
      case 'pageFetch': {
        const req = this.impl.prepareRequest ? this.impl.prepareRequest(msg.req) : msg.req;
        const res = await pageFetch(req, 60_000);
        if (res.error) throw new Error(res.error);
        return { status: res.status, headers: res.headers, body: res.body };
      }
      case 'threadsTokens':
        return this.impl.threadsTokens?.() ?? {};
      case 'scroll:run':
        void this.scroll.run(msg.kind);
        return { ok: true };
      case 'scroll:stop':
        this.scroll.stop();
        return { ok: true };
      case 'settings:changed':
        this.setSettings(msg.settings);
        return { ok: true };
    }
  }

  /** Throttled "this browser is logged in and active on the site" signal. */
  seen(): void {
    const now = Date.now();
    if (now - this.lastSeenSent < 60_000) return;
    this.lastSeenSent = now;
    sendToBackground({ type: 'seen', platform: this.platform }).catch(() => {});
  }

  async ingest(posts: ParsedPost[], position: PagePosition): Promise<IngestResult | null> {
    if (!posts.length) return null;
    try {
      return await sendToBackground({ type: 'ingest', platform: this.platform, posts, position });
    } catch {
      return null;
    }
  }

  /** Sends a request template to the background when it differs from the last one sent. */
  template(op: string, c: CapturedResponse, sigExtra = ''): void {
    const t: RequestTemplate = { url: c.url, method: c.method, headers: c.requestHeaders, body: c.requestBody ?? undefined, capturedAt: Date.now() };
    const sig = `${new URL(c.url).pathname}|${Object.keys(c.requestHeaders).sort().join(',')}|${sigExtra}`;
    if (this.templateSigs.get(op) === sig) return;
    this.templateSigs.set(op, sig);
    sendToBackground({ type: 'template', platform: this.platform, op, template: t }).catch(() => {});
  }
}

/**
 * Fallback sync: scrolls the saved page so the site loads every page itself;
 * passive capture stores what it loads. Used only when replaying requests fails.
 */
export class ScrollRunner {
  private running = false;
  private lastPageAt = 0;
  private sawKnown = false;
  private ended = false;
  private seenIds = new Set<string>();

  constructor(private rt: ContentRuntime) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Called by platform capture code whenever a saved-list page is captured. */
  notePage(posts: ParsedPost[], result: IngestResult | null, empty: boolean): void {
    this.lastPageAt = Date.now();
    posts.forEach((p) => this.seenIds.add(p.platformId));
    if (result && result.knownCount > 0) this.sawKnown = true;
    if (empty) this.ended = true;
  }

  stop(): void {
    this.running = false;
  }

  async run(kind: SyncKind): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.sawKnown = false;
    this.ended = false;
    this.seenIds.clear();
    this.lastPageAt = Date.now();
    const started = Date.now();
    let idleRounds = 0;
    let message: string | undefined;
    // Give the first page time to load.
    await sleep(2500);
    while (this.running) {
      if (!this.rt.impl.isOnSavedPage()) {
        message = 'The saved page was navigated away from.';
        break;
      }
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
      await sleep(1500 + Math.random() * 700);
      if (this.ended) break;
      if (kind === 'incremental' && this.sawKnown) break;
      idleRounds = Date.now() - this.lastPageAt > 5000 ? idleRounds + 1 : 0;
      if (idleRounds >= 5) break;
      if (Date.now() - started > 30 * 60_000) {
        message = 'Stopped after 30 minutes; run sync again to continue.';
        break;
      }
    }
    this.running = false;
    sendToBackground({ type: 'scroll:done', platform: this.rt.platform, reachedEnd: this.ended, seen: this.seenIds.size, message }).catch(() => {});
  }
}
