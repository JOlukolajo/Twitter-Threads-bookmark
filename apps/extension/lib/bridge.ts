/**
 * Protocol between the page-context ("main world") script and the extension's
 * content script ("isolated world"). They share the DOM but not JS objects, so
 * they talk with window.postMessage.
 */

export const MAIN_SOURCE = 'saveboard:main';
export const ISO_SOURCE = 'saveboard:iso';

/** A network response the page made, captured as-is. */
export interface CapturedResponse {
  source: typeof MAIN_SOURCE;
  type: 'response';
  url: string;
  method: string;
  status: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  body: string;
}

/** Ask the page context to make a request (with the page's own cookies). */
export interface FetchCommand {
  source: typeof ISO_SOURCE;
  type: 'fetch';
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FetchResult {
  source: typeof MAIN_SOURCE;
  type: 'fetch-result';
  id: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

export type MainMessage = CapturedResponse | FetchResult;

export function isMainMessage(e: MessageEvent): e is MessageEvent<MainMessage> {
  return e.source === window && e.data?.source === MAIN_SOURCE;
}

export function isIsoMessage(e: MessageEvent): e is MessageEvent<FetchCommand> {
  return e.source === window && e.data?.source === ISO_SOURCE && e.data?.type === 'fetch';
}

/** Isolated-world helper: runs a fetch in the page context and resolves with the result. */
export function pageFetch(req: Omit<FetchCommand, 'source' | 'type' | 'id'>, timeoutMs = 30_000): Promise<FetchResult> {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      reject(new Error('Request timed out'));
    }, timeoutMs);
    function onMsg(e: MessageEvent) {
      if (!isMainMessage(e) || e.data.type !== 'fetch-result' || e.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(e.data);
    }
    window.addEventListener('message', onMsg);
    const cmd: FetchCommand = { source: ISO_SOURCE, type: 'fetch', id, ...req };
    window.postMessage(cmd, location.origin);
  });
}
