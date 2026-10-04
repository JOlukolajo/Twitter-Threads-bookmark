/**
 * Runs in the page's own JS context (main world) at document_start.
 *
 * Wraps fetch and XMLHttpRequest so that every API response the site loads
 * (bookmarks pages, save/unsave actions, feeds) is copied to our content script.
 * Nothing is modified and nothing is sent anywhere else.
 */
import { MAIN_SOURCE, type CapturedResponse, type FetchResult, isIsoMessage } from './bridge';

type Matcher = (url: string, method: string) => boolean;

function headersToObject(h: HeadersInit | Headers | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
  else if (Array.isArray(h)) for (const [k, v] of h) out[k.toLowerCase()] = v;
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

async function bodyToString(body: unknown): Promise<string | null> {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    const p = new URLSearchParams();
    body.forEach((v, k) => typeof v === 'string' && p.append(k, v));
    return p.toString();
  }
  if (body instanceof Blob) return body.text();
  return null;
}

function emit(msg: Omit<CapturedResponse, 'source' | 'type'>) {
  if (!msg.body || msg.body.length > 20_000_000) return;
  const out: CapturedResponse = { source: MAIN_SOURCE, type: 'response', ...msg };
  window.postMessage(out, location.origin);
}

export function installInterceptor(shouldCapture: Matcher): void {
  const w = window as unknown as { __saveboardInstalled?: boolean };
  if (w.__saveboardInstalled) return;
  w.__saveboardInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  // ---- fetch
  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await nativeFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const abs = new URL(url, location.href).href;
      if (shouldCapture(abs, method)) {
        const headers = { ...(input instanceof Request ? headersToObject(input.headers) : {}), ...headersToObject(init?.headers) };
        const reqBody = init?.body !== undefined ? bodyToString(init.body) : input instanceof Request ? input.clone().text() : Promise.resolve(null);
        Promise.all([res.clone().text(), reqBody])
          .then(([body, requestBody]) => emit({ url: abs, method, status: res.status, requestHeaders: headers, requestBody, body }))
          .catch(() => {});
      }
    } catch {
      /* never break the page */
    }
    return res;
  };

  // ---- XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  const setRequestHeader = XHR.setRequestHeader;
  type Tracked = XMLHttpRequest & { __sb?: { url: string; method: string; headers: Record<string, string> } };

  XHR.open = function (this: Tracked, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      this.__sb = { url: new URL(String(url), location.href).href, method: method.toUpperCase(), headers: {} };
    } catch {
      this.__sb = undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (open as any).call(this, method, url, ...rest);
  } as typeof XHR.open;

  XHR.setRequestHeader = function (this: Tracked, name: string, value: string) {
    if (this.__sb) this.__sb.headers[name.toLowerCase()] = value;
    return setRequestHeader.call(this, name, value);
  };

  XHR.send = function (this: Tracked, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this.__sb;
    if (meta && shouldCapture(meta.url, meta.method)) {
      const bodyPromise = bodyToString(body);
      this.addEventListener('load', () => {
        try {
          const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : typeof this.response === 'string' ? this.response : this.responseType === 'json' ? JSON.stringify(this.response) : '';
          bodyPromise.then((requestBody) => emit({ url: meta.url, method: meta.method, status: this.status, requestHeaders: meta.headers, requestBody, body: text }));
        } catch {
          /* ignore */
        }
      });
    }
    return send.call(this, body);
  };

  // ---- requests on behalf of the content script (same origin, page cookies)
  window.addEventListener('message', async (e) => {
    if (!isIsoMessage(e)) return;
    const cmd = e.data;
    const reply = (r: Omit<FetchResult, 'source' | 'type' | 'id'>) =>
      window.postMessage({ source: MAIN_SOURCE, type: 'fetch-result', id: cmd.id, ...r } satisfies FetchResult, location.origin);
    try {
      const res = await nativeFetch(cmd.url, { method: cmd.method, headers: cmd.headers, body: cmd.body, credentials: 'include' });
      reply({ status: res.status, headers: headersToObject(res.headers), body: await res.text() });
    } catch (err) {
      reply({ status: 0, headers: {}, body: '', error: String(err) });
    }
  });
}
