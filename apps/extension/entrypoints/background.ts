/**
 * Background service worker: owns writes coming from the sites, schedules
 * auto-sync, and drives sync runs through a tab of the site.
 */
import { browser } from 'wxt/browser';
import {
  PLATFORMS,
  PLATFORM_LABEL,
  createFolder,
  folderByExternalId,
  getSettings,
  getSyncState,
  ingestPosts,
  listFolders,
  liveFolderItems,
  markUnsaved,
  patchSyncState,
  postId,
  primaryTemplateKey,
  runApiSync,
  setFolderMembership,
  sleep,
  upsertExternalFolders,
  type Platform,
  type SyncKind,
} from '@saveboard/core';
import { db } from '@/lib/db';
import { onMessage, sendToTab, type BgRequest } from '@/lib/messages';
import { PLATFORM_CONFIG } from '@/lib/platforms';

const AUTO_ALARM = 'auto-sync';
const SOON_PREFIX = 'soon:';

interface ActiveSync {
  tabId: number;
  ownedTab: boolean;
  mode: 'api' | 'scroll';
  kind: SyncKind;
  startedAt: number;
  auto: boolean;
}

const active: Partial<Record<Platform, ActiveSync>> = {};
const stopFlags: Record<Platform, boolean> = { x: false, threads: false };

export default defineBackground(() => {
  // The service worker may have restarted mid-sync; nothing is running now.
  for (const p of PLATFORMS) void patchSyncState(db, p, (s) => (s.running ? { running: null, lastSyncResult: 'partial', lastSyncMessage: 'Sync was interrupted.' } : {}));

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    await scheduleAutoSync();
    if (reason === 'install') await browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
  });
  browser.runtime.onStartup.addListener(() => void scheduleAutoSync());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_ALARM) void autoSyncAll();
    if (alarm.name.startsWith(SOON_PREFIX)) {
      const p = alarm.name.slice(SOON_PREFIX.length) as Platform;
      void startSync(p, 'incremental', { auto: true });
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    for (const p of PLATFORMS) {
      const a = active[p];
      if (a?.tabId === tabId) {
        stopFlags[p] = true;
        if (a.mode === 'scroll') void finish(p, 'partial', 'The sync tab was closed.');
      }
    }
  });

  onMessage<BgRequest>((msg, sender) => handle(msg, sender.tab?.id));
});

async function handle(msg: BgRequest, senderTabId?: number): Promise<unknown> {
  switch (msg.type) {
    case 'ingest':
      return ingestPosts(db, msg.platform, msg.posts, { position: msg.position });
    case 'unsave':
      return markUnsaved(db, msg.platform, { platformId: msg.platformId, extId: msg.extId });
    case 'seen':
      await patchSyncState(db, msg.platform, { lastSeenAt: Date.now() });
      return null;
    case 'template': {
      const state = await patchSyncState(db, msg.platform, (s) => ({ templates: { ...s.templates, [msg.op]: msg.template } }));
      // First time we can sync this platform: do a full import right away, in the tab the user is on.
      if (msg.op === primaryTemplateKey(msg.platform) && !state.lastSyncAt && !active[msg.platform] && senderTabId !== undefined) {
        void startSync(msg.platform, 'full', { auto: false, preferTabId: senderTabId });
      }
      return null;
    }
    case 'externalFolders':
      await upsertExternalFolders(db, msg.platform, msg.folders);
      return null;
    case 'externalFolderItems': {
      const folder = await folderByExternalId(db, msg.platform, msg.externalFolderId);
      if (folder) {
        await setFolderMembership(db, msg.platform, folder.id, msg.platformIds.map((id) => postId(msg.platform, id)), msg.member);
      }
      return null;
    }
    case 'needsSync':
      await browser.alarms.create(`${SOON_PREFIX}${msg.platform}`, { delayInMinutes: 0.5 });
      return null;
    case 'sync:start':
      return startSync(msg.platform, msg.kind, { auto: false });
    case 'sync:stop': {
      stopFlags[msg.platform] = true;
      const a = active[msg.platform];
      if (a?.mode === 'scroll') await sendToTab(a.tabId, { type: 'scroll:stop' }).catch(() => {});
      return null;
    }
    case 'scroll:done': {
      const a = active[msg.platform];
      if (!a || a.mode !== 'scroll') return null;
      const label = PLATFORM_CONFIG[msg.platform].savedLabel;
      await finish(msg.platform, msg.message ? 'partial' : 'ok', msg.message ?? `Checked ${msg.seen} ${label}.`);
      return null;
    }
    case 'folders:forPost': {
      const [folders, items] = await Promise.all([listFolders(db, msg.platform), liveFolderItems(db, msg.platform)]);
      return {
        folders: folders.map((f) => ({ id: f.id, name: f.name })),
        memberOf: items.filter((i) => i.postId === msg.postId).map((i) => i.folderId),
      };
    }
    case 'folders:toggle':
      await setFolderMembership(db, msg.platform, msg.folderId, [msg.postId], msg.member);
      return null;
    case 'folders:create': {
      const f = await createFolder(db, msg.platform, msg.name);
      if (msg.postId) await setFolderMembership(db, msg.platform, f.id, [msg.postId], true);
      return { id: f.id, name: f.name };
    }
    case 'settings:get':
      return getSettings(db);
    case 'settings:changed': {
      await scheduleAutoSync();
      const settings = await getSettings(db);
      const tabs = await browser.tabs.query({ url: PLATFORMS.flatMap((p) => PLATFORM_CONFIG[p].tabPatterns) });
      await Promise.all(tabs.map((t) => (t.id ? sendToTab(t.id, { type: 'settings:changed', settings }).catch(() => {}) : null)));
      return null;
    }
  }
}

// ------------------------------------------------------------------ auto-sync

async function scheduleAutoSync(): Promise<void> {
  const { syncIntervalMin } = await getSettings(db);
  await browser.alarms.clear(AUTO_ALARM);
  if (syncIntervalMin > 0) await browser.alarms.create(AUTO_ALARM, { periodInMinutes: syncIntervalMin, delayInMinutes: Math.min(5, syncIntervalMin) });
}

async function autoSyncAll(): Promise<void> {
  for (const p of PLATFORMS) {
    const s = await getSyncState(db, p);
    // Only platforms the user has actually connected.
    if (!s.lastSyncAt && !s.lastSeenAt) continue;
    await startSync(p, 'incremental', { auto: true });
  }
}

// ------------------------------------------------------------------ tabs

async function ping(tabId: number): Promise<boolean> {
  try {
    const res = await Promise.race([sendToTab(tabId, { type: 'ping' }), sleep(2000).then(() => null)]);
    return Boolean(res);
  } catch {
    return false;
  }
}

async function findSiteTab(p: Platform, prefer?: number): Promise<number | null> {
  if (prefer !== undefined && (await ping(prefer))) return prefer;
  const tabs = await browser.tabs.query({ url: PLATFORM_CONFIG[p].tabPatterns });
  for (const t of tabs.sort((a, b) => Number(b.active) - Number(a.active))) {
    if (t.id === undefined || t.discarded) continue;
    if (await ping(t.id)) return t.id;
  }
  return null;
}

async function openSiteTab(p: Platform, visible: boolean): Promise<number | null> {
  const tab = await browser.tabs.create({ url: PLATFORM_CONFIG[p].savedPageUrl, active: visible });
  if (tab.id === undefined) return null;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (await ping(tab.id)) return tab.id;
  }
  await browser.tabs.remove(tab.id).catch(() => {});
  return null;
}

// ------------------------------------------------------------------ sync runs

async function startSync(
  p: Platform,
  kind: SyncKind,
  opts: { auto: boolean; forceScroll?: boolean; preferTabId?: number },
): Promise<{ started: boolean; message?: string }> {
  if (active[p]) return { started: false, message: 'Already syncing.' };
  const settings = await getSettings(db);
  const state = await getSyncState(db, p);
  const mode: 'api' | 'scroll' = opts.forceScroll || !state.templates[primaryTemplateKey(p)] ? 'scroll' : 'api';
  const label = PLATFORM_LABEL[p];

  if (mode === 'scroll' && opts.auto) {
    await patchSyncState(db, p, { lastSyncResult: 'error', lastSyncMessage: `Open your ${label} ${PLATFORM_CONFIG[p].savedLabel} page once so syncing can start.` });
    return { started: false };
  }

  // Reserve the slot before any await so concurrent calls don't double-start.
  const reservation: ActiveSync = { tabId: -1, ownedTab: false, mode, kind, startedAt: Date.now(), auto: opts.auto };
  active[p] = reservation;
  stopFlags[p] = false;
  await updateBadge();

  let tabId: number | null = null;
  let ownedTab = false;
  if (mode === 'api') tabId = await findSiteTab(p, opts.preferTabId);
  if (tabId === null && (!opts.auto || settings.allowBackgroundTab)) {
    // Scroll sync needs a visible tab (sites stop loading in hidden tabs).
    tabId = await openSiteTab(p, mode === 'scroll');
    ownedTab = tabId !== null;
  }
  if (tabId === null) {
    delete active[p];
    await updateBadge();
    const message = `Open ${label} in a tab (logged in) to sync.`;
    await patchSyncState(db, p, { lastSyncResult: 'error', lastSyncMessage: message });
    return { started: false, message };
  }

  Object.assign(reservation, { tabId, ownedTab });
  await patchSyncState(db, p, { running: { startedAt: reservation.startedAt, kind, progress: 0 } });

  if (mode === 'scroll') {
    await sendToTab(tabId, { type: 'scroll:run', kind }).catch(() => finish(p, 'error', 'Could not start the sync in the tab.'));
    return { started: true };
  }
  void runApi(p, reservation);
  return { started: true };
}

async function runApi(p: Platform, a: ActiveSync): Promise<void> {
  const state = await getSyncState(db, p);
  const outcome = await runApiSync(
    db,
    p,
    a.kind,
    state.templates,
    {
      fetch: (req) => sendToTab(a.tabId, { type: 'pageFetch', req }),
      threadsTokens: () => sendToTab(a.tabId, { type: 'threadsTokens' }),
    },
    {
      shouldStop: () => stopFlags[p],
      onProgress: (pr) => patchSyncState(db, p, (s) => ({ running: s.running ? { ...s.running, progress: pr.seen } : s.running })).then(() => {}),
    },
  );
  if (!outcome.ok && outcome.apiBroken && !a.auto) {
    // Replaying the request failed (the site changed something). Fall back to scrolling the saved page.
    await finish(p, 'error', outcome.message);
    await startSync(p, a.kind, { auto: false, forceScroll: true });
    return;
  }
  await finish(p, outcome.ok ? 'ok' : 'error', outcome.message);
}

async function finish(p: Platform, result: 'ok' | 'error' | 'partial', message: string): Promise<void> {
  const a = active[p];
  delete active[p];
  await patchSyncState(db, p, { running: null, lastSyncAt: Date.now(), lastSyncResult: result, lastSyncMessage: message });
  if (a?.ownedTab) await browser.tabs.remove(a.tabId).catch(() => {});
  await updateBadge();
}

async function updateBadge(): Promise<void> {
  const syncing = PLATFORMS.some((p) => active[p]);
  await browser.action.setBadgeBackgroundColor({ color: '#1d9bf0' }).catch(() => {});
  await browser.action.setBadgeText({ text: syncing ? '…' : '' }).catch(() => {});
}
