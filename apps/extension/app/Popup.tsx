import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { PLATFORMS, PLATFORM_LABEL, type Platform } from '@saveboard/core';
import { Button, PlatformLogo, cx } from '@/components/ui';
import { sendToBackground } from '@/lib/messages';
import { timeAgo, usePostCount, useSyncState } from './hooks';

function openApp(path = '/') {
  void browser.tabs.create({ url: browser.runtime.getURL(`/app.html#${path}`) });
  window.close();
}

function PlatformRow({ platform }: { platform: Platform }) {
  const count = usePostCount(platform);
  const sync = useSyncState(platform);
  const [msg, setMsg] = useState<string | null>(null);
  const running = Boolean(sync?.running);
  return (
    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <PlatformLogo platform={platform} className="h-4 w-4" />
        <span className="font-semibold">{PLATFORM_LABEL[platform]}</span>
        <span className="ml-auto text-sm text-zinc-500 tabular-nums">{count ?? '–'} saved</span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {running ? `Syncing… ${sync?.running?.progress || ''}` : `Synced ${timeAgo(sync?.lastSyncAt)}`}
        {!running && (msg ?? sync?.lastSyncMessage) && <div className="mt-0.5 line-clamp-2">{msg ?? sync?.lastSyncMessage}</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => openApp(`/${platform}`)}>
          Open library
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={running}
          onClick={async () => {
            const r = await sendToBackground({ type: 'sync:start', platform, kind: 'incremental' }).catch((e: Error) => ({ started: false, message: e.message }));
            setMsg(r.started ? null : (r.message ?? null));
          }}
        >
          <RefreshCw className={cx('h-3.5 w-3.5', running && 'animate-spin')} /> Sync
        </Button>
      </div>
    </div>
  );
}

export function Popup() {
  return (
    <div className="w-80 space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold">Saveboard</span>
        <button type="button" className="text-sm text-brand hover:underline" onClick={() => openApp('/')}>
          Open
        </button>
      </div>
      {PLATFORMS.map((p) => (
        <PlatformRow key={p} platform={p} />
      ))}
    </div>
  );
}
