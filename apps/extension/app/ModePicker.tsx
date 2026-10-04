import { ArrowRight, Settings as SettingsIcon } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABEL, type Platform } from '@saveboard/core';
import { PlatformLogo, cx } from '@/components/ui';
import { PLATFORM_CONFIG } from '@/lib/platforms';
import { usePostCount, useSyncState, timeAgo } from './hooks';
import { navigate } from './router';
import { PermissionBanner } from './PermissionBanner';

const ACCENT: Record<Platform, string> = {
  x: 'from-zinc-900 to-zinc-700 text-white dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900',
  threads: 'from-violet-600 to-fuchsia-500 text-white',
};

function ModeCard({ platform }: { platform: Platform }) {
  const count = usePostCount(platform);
  const sync = useSyncState(platform);
  const connected = Boolean(sync?.lastSeenAt || sync?.lastSyncAt);
  const label = PLATFORM_LABEL[platform];
  return (
    <button
      type="button"
      data-testid={`mode-${platform}`}
      onClick={() => navigate(`/${platform}`)}
      className="focus-ring group flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className={cx('flex items-center gap-3 bg-gradient-to-br px-6 py-7', ACCENT[platform])}>
        <PlatformLogo platform={platform} className="h-9 w-9" />
        <div>
          <div className="text-2xl font-bold">{label}</div>
          <div className="text-sm opacity-80">{platform === 'x' ? 'Bookmarks' : 'Saved posts'}{platform === 'threads' && ' · beta'}</div>
        </div>
        <ArrowRight className="ml-auto h-6 w-6 opacity-70 transition group-hover:translate-x-1" />
      </div>
      <div className="grid grid-cols-2 gap-4 px-6 py-5 text-sm">
        <div>
          <div className="text-zinc-500">Saved</div>
          <div className="text-xl font-semibold tabular-nums">{count ?? '–'}</div>
        </div>
        <div>
          <div className="text-zinc-500">Last sync</div>
          <div className="text-base font-medium">{timeAgo(sync?.lastSyncAt)}</div>
        </div>
        <div className="col-span-2 flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
          <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-zinc-400')} />
          {connected ? `Connected · seen ${timeAgo(sync?.lastSeenAt ?? sync?.lastSyncAt)}` : `Not connected yet · open ${PLATFORM_CONFIG[platform].domain} while logged in`}
        </div>
      </div>
    </button>
  );
}

export function ModePicker() {
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col px-4 py-12 sm:px-6">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saveboard</h1>
          <p className="mt-1 text-zinc-500">Pick what you want to work with.</p>
        </div>
        <button type="button" onClick={() => navigate('/settings')} className="focus-ring inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <SettingsIcon className="h-4 w-4" /> Settings
        </button>
      </header>
      <PermissionBanner />
      <div className="grid gap-6 sm:grid-cols-2">
        {PLATFORMS.map((p) => (
          <ModeCard key={p} platform={p} />
        ))}
      </div>
      <p className="mt-10 text-center text-sm text-zinc-500">
        Everything stays in this browser. <a className="underline" href="#/privacy">Privacy</a>
      </p>
    </main>
  );
}
