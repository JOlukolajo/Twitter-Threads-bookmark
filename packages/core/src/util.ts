/** Small helpers shared by the parsers. */

export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function isObject(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Depth-first walk. The visitor returns `false` to stop descending into a node
 * (used to avoid treating a quoted post as a separate saved post).
 */
export function walk(node: Json, visit: (obj: Record<string, Json>, key: string | null) => boolean | void, key: string | null = null, depth = 0): void {
  if (depth > 60) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, key, depth + 1);
    return;
  }
  if (!isObject(node)) return;
  if (visit(node, key) === false) return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'object' && v !== null) walk(v, visit, k, depth + 1);
  }
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Parses a response body that may be plain JSON, prefixed with `for (;;);`,
 * or newline-delimited JSON (Meta's streamed @defer responses).
 */
export function parseJsonLoose(text: string): Json[] {
  const body = text.replace(/^\s*for\s*\(;;\);\s*/, '');
  try {
    return [JSON.parse(body)];
  } catch {
    const out: Json[] = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* ignore non-JSON chunks */
      }
    }
    return out;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function jitter(baseMs: number, spread = 0.4): number {
  return Math.round(baseMs * (1 - spread / 2 + Math.random() * spread));
}

export function sanitizeFilename(s: string, max = 80): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || 'untitled').slice(0, max);
}

export function extFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const fmt = u.searchParams.get('format');
    if (fmt) return fmt;
    const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    /* fall through */
  }
  return fallback;
}
