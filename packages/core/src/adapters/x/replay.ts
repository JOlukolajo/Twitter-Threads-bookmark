import type { RequestTemplate } from '../../schema';
import type { HttpRequest } from '../../sync-engine';

/** Headers that are per-request or set by the browser and must not be replayed. */
const DROP_HEADERS = ['x-client-transaction-id', 'content-length', 'cookie', 'host', 'origin', 'referer'];

export function cleanHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (!DROP_HEADERS.includes(k.toLowerCase())) out[k.toLowerCase()] = v;
  return out;
}

/** Re-issues a captured X GraphQL GET with a new cursor and/or variables. */
export function buildXRequest(t: RequestTemplate, opts: { cursor?: string; variables?: Record<string, unknown> } = {}): HttpRequest {
  const url = new URL(t.url);
  let vars: Record<string, unknown> = {};
  try {
    vars = JSON.parse(url.searchParams.get('variables') ?? '{}');
  } catch {
    /* keep empty */
  }
  delete vars.cursor;
  if (opts.cursor) vars.cursor = opts.cursor;
  Object.assign(vars, opts.variables ?? {});
  url.searchParams.set('variables', JSON.stringify(vars));
  return { url: url.href, method: 'GET', headers: cleanHeaders(t.headers) };
}

export function retryAfterMs(headers: Record<string, string>, now = Date.now()): number | undefined {
  const reset = Number(headers['x-rate-limit-reset']);
  if (Number.isFinite(reset) && reset > 0) return Math.max(5_000, reset * 1000 - now + 1_000);
  const ra = Number(headers['retry-after']);
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  return undefined;
}
