import type { RequestTemplate } from '../../schema';
import type { HttpRequest } from '../../sync-engine';
import { cleanHeaders } from '../x/replay';

export interface ThreadsTokens {
  lsd?: string;
  fbDtsg?: string;
}

/** Meta's `jazoest` checksum is derived from fb_dtsg. */
export function jazoest(fbDtsg: string): string {
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
  return `2${sum}`;
}

/** Which variable carries the pagination cursor in a captured request. */
export function cursorKey(vars: Record<string, unknown>): string {
  for (const k of ['after', 'cursor', 'end_cursor', 'max_id']) if (k in vars) return k;
  return 'after';
}

/** Re-issues a captured Threads GraphQL POST for the saved list with a new cursor. */
export function buildThreadsRequest(t: RequestTemplate, opts: { cursor?: string; tokens?: ThreadsTokens } = {}): HttpRequest {
  const params = new URLSearchParams(t.body ?? '');
  let vars: Record<string, unknown> = {};
  try {
    vars = JSON.parse(params.get('variables') ?? '{}');
  } catch {
    /* keep empty */
  }
  vars[cursorKey(vars)] = opts.cursor ?? null;
  params.set('variables', JSON.stringify(vars));
  const headers = cleanHeaders(t.headers);
  if (opts.tokens?.lsd) {
    params.set('lsd', opts.tokens.lsd);
    headers['x-fb-lsd'] = opts.tokens.lsd;
  }
  if (opts.tokens?.fbDtsg) {
    params.set('fb_dtsg', opts.tokens.fbDtsg);
    params.set('jazoest', jazoest(opts.tokens.fbDtsg));
  }
  headers['content-type'] = headers['content-type'] ?? 'application/x-www-form-urlencoded';
  return { url: t.url, method: 'POST', headers, body: params.toString() };
}

/** Pulls the current session tokens out of a Threads page's HTML. */
export function extractThreadsTokens(html: string): ThreadsTokens {
  const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1];
  const fbDtsg = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1];
  return { lsd, fbDtsg };
}
