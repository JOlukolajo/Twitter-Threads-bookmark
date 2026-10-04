/**
 * The "Add to folder" chip shown on posts on x.com and threads.com, and the
 * folder picker popover it opens. Plain DOM (no framework) to stay light.
 */
import { postId, type Platform } from '@saveboard/core/schema';
import { browser } from 'wxt/browser';
import { sendToBackground, type FoldersForPost } from '../messages';
import type { ContentRuntime } from './runtime';

export interface PostHandle {
  /** Element of the whole post. */
  root: HTMLElement;
  /** Where the chip is inserted (appended as last child). */
  mount: HTMLElement;
  platformId: string;
}

export interface ChipAdapter {
  findPosts(): PostHandle[];
  /** Called before the first folder is assigned (X: bookmark the tweet on X too). */
  beforeSave?(h: PostHandle): void;
}

const MARK = 'data-saveboard-chip';
const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>';

const POPOVER_CSS = `
:host { all: initial; }
.pop { position: fixed; z-index: 2147483647; width: 260px; max-height: 360px; display: flex; flex-direction: column;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f1419; background: #fff;
  border: 1px solid rgba(0,0,0,.12); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden; }
.pop.dark { color: #e7e9ea; background: #16181c; border-color: rgba(255,255,255,.14); box-shadow: 0 8px 28px rgba(0,0,0,.6); }
.hd { padding: 10px 12px 6px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
.hd small { font-weight: 400; opacity: .6; }
.list { overflow: auto; padding: 2px 4px; }
label { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
label:hover { background: rgba(127,127,127,.12); }
input[type=checkbox] { width: 16px; height: 16px; accent-color: #1d9bf0; margin: 0; }
.empty { padding: 6px 12px; opacity: .65; }
.new { display: flex; gap: 6px; padding: 8px; border-top: 1px solid rgba(127,127,127,.2); }
.new input { flex: 1; min-width: 0; font: inherit; color: inherit; background: transparent; border: 1px solid rgba(127,127,127,.35); border-radius: 8px; padding: 6px 8px; }
.new button, .ft button { font: inherit; border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; background: #1d9bf0; color: #fff; font-weight: 600; }
.ft { padding: 0 8px 8px; }
.ft button { width: 100%; background: transparent; color: inherit; opacity: .7; font-weight: 500; }
.ft button:hover { opacity: 1; background: rgba(127,127,127,.12); }
`;

/** Follows the site's own theme (X and Threads have their own dark modes). */
function pageIsDark(): boolean {
  for (const el of [document.body, document.documentElement]) {
    const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m || (m.length === 4 && Number(m[3]) === 0)) continue;
    const [r, g, b] = m.map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function startChips(rt: ContentRuntime, adapter: ChipAdapter): void {
  const platform: Platform = rt.platform;
  let enabled = true;
  let scheduled = false;
  const host = document.createElement('div');
  host.setAttribute('data-saveboard-popover', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${POPOVER_CSS}</style>`;
  let pop: HTMLDivElement | null = null;
  let openFor: string | null = null;

  const close = () => {
    pop?.remove();
    pop = null;
    openFor = null;
  };

  document.addEventListener(
    'mousedown',
    (e) => {
      if (pop && !e.composedPath().includes(host) && !(e.target as Element)?.closest?.(`[${MARK}]`)) close();
    },
    true,
  );
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), true);
  window.addEventListener('scroll', () => close(), { passive: true });

  async function render(h: PostHandle, anchor: HTMLElement) {
    const pid = postId(platform, h.platformId);
    let data: FoldersForPost;
    try {
      data = await sendToBackground({ type: 'folders:forPost', platform, postId: pid });
    } catch {
      return;
    }
    if (!host.isConnected) document.body.appendChild(host);
    pop?.remove();
    pop = document.createElement('div');
    pop.className = pageIsDark() ? 'pop dark' : 'pop';
    pop.innerHTML = `<div class="hd">Add to folder <small>Saveboard</small></div><div class="list"></div>
      <form class="new"><input placeholder="New folder…" maxlength="80" /><button type="submit">Add</button></form>
      <div class="ft"><button type="button" data-open>Open library</button></div>`;
    const list = pop.querySelector('.list') as HTMLDivElement;
    if (!data.folders.length) list.innerHTML = '<div class="empty">No folders yet. Create one below.</div>';
    for (const f of data.folders) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = data.memberOf.includes(f.id);
      cb.addEventListener('change', async () => {
        if (cb.checked) await ensureSaved(h);
        await sendToBackground({ type: 'folders:toggle', platform, postId: pid, folderId: f.id, member: cb.checked }).catch(() => {});
        markChip(h, true);
      });
      label.append(cb, document.createTextNode(f.name));
      list.appendChild(label);
    }
    const form = pop.querySelector('form') as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      await ensureSaved(h);
      await sendToBackground({ type: 'folders:create', platform, name, postId: pid }).catch(() => {});
      markChip(h, true);
      void render(h, anchor);
    });
    (pop.querySelector('[data-open]') as HTMLButtonElement).addEventListener('click', () => {
      window.open(browser.runtime.getURL(`/app.html#/${platform}`), '_blank');
      close();
    });
    shadow.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 370, r.bottom + 6);
    const left = Math.min(window.innerWidth - 270, Math.max(8, r.left - 120));
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${left}px`;
    openFor = h.platformId;
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  async function ensureSaved(h: PostHandle) {
    adapter.beforeSave?.(h);
    const p = rt.cache.get(h.platformId);
    if (p) await rt.ingest([p], 'top');
  }

  function markChip(h: PostHandle, filed: boolean) {
    const chip = h.mount.querySelector(`[${MARK}]`) as HTMLElement | null;
    if (chip) chip.style.color = filed ? '#1d9bf0' : 'inherit';
  }

  function makeChip(h: PostHandle): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(MARK, h.platformId);
    btn.title = 'Add to folder (Saveboard)';
    btn.setAttribute('aria-label', 'Add to folder');
    btn.innerHTML = FOLDER_ICON;
    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '34px',
      height: '34px',
      padding: '0',
      margin: '0 2px',
      border: '0',
      borderRadius: '999px',
      background: 'transparent',
      color: 'inherit',
      opacity: '0.75',
      cursor: 'pointer',
      flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('mouseenter', () => (btn.style.background = 'rgba(29,155,240,.12)'));
    btn.addEventListener('mouseleave', () => (btn.style.background = 'transparent'));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (openFor === h.platformId) close();
      else void render(h, btn);
    });
    return btn;
  }

  function scan() {
    scheduled = false;
    if (!enabled) return;
    for (const h of adapter.findPosts()) {
      if (h.mount.querySelector(`[${MARK}]`)) continue;
      h.mount.appendChild(makeChip(h));
    }
  }

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 400);
  };

  const observer = new MutationObserver(schedule);
  const begin = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  };
  if (document.body) begin();
  else document.addEventListener('DOMContentLoaded', begin, { once: true });

  rt.onSettings((s) => {
    enabled = s.showChips;
    if (!enabled) {
      document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());
      close();
    } else schedule();
  });
}

// ------------------------------------------------------------- adapters

export const xChipAdapter: ChipAdapter = {
  findPosts() {
    const out: PostHandle[] = [];
    for (const article of document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')) {
      const link = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')].find((a) => a.querySelector('time'));
      const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
      const groups = article.querySelectorAll<HTMLElement>('[role="group"]');
      const mount = groups[groups.length - 1];
      if (id && mount) out.push({ root: article, mount, platformId: id });
    }
    return out;
  },
  beforeSave(h) {
    // Filing a tweet bookmarks it on X too, so X and the library stay in step.
    const btn = h.root.querySelector<HTMLElement>('[data-testid="bookmark"]');
    btn?.click();
  },
};

export const threadsChipAdapter: ChipAdapter = {
  findPosts() {
    const out: PostHandle[] = [];
    const seen = new Set<Element>();
    for (const time of document.querySelectorAll('a[href*="/post/"] time')) {
      const link = time.closest('a') as HTMLAnchorElement | null;
      const code = link?.getAttribute('href')?.match(/\/post\/([^/?#]+)/)?.[1];
      const root = (link?.closest('[data-pressable-container]') as HTMLElement | null) ?? link?.parentElement ?? null;
      const mount = link?.parentElement;
      if (!code || !root || !mount || seen.has(root)) continue;
      seen.add(root);
      out.push({ root, mount, platformId: code });
    }
    return out;
  },
};
