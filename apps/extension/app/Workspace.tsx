import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeftRight,
  ChevronDown,
  Download,
  FileJson,
  FolderInput,
  FolderMinus,
  Grid2x2,
  List,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react';
import {
  DEFAULT_FILTERS,
  PLATFORM_LABEL,
  PostSearch,
  createFolder,
  deleteFolder,
  deletePostsLocally,
  filterPosts,
  folderCounts,
  moveToFolder,
  renameFolder,
  setFolderMembership,
  type Folder,
  type Platform,
  type Post,
  type PostFilters,
} from '@saveboard/core';
import { Button, IconButton, Input, Menu, MenuItem, PlatformLogo, Select, Toast, cx } from '@/components/ui';
import { db } from '@/lib/db';
import { sendToBackground } from '@/lib/messages';
import { PLATFORM_CONFIG } from '@/lib/platforms';
import { downloadMedia, exportCSV, exportJSON, exportMarkdown, importJSONFile, type DownloadProgress } from './actions';
import { timeAgo, useLibrary, useSettings, useSyncState } from './hooks';
import { DRAG_MIME, MediaThumb, PostCard } from './PostCard';
import { Sidebar } from './Sidebar';
import { navigate } from './router';

type View = 'list' | 'gallery';

export function Workspace({ platform }: { platform: Platform; subpath: string }) {
  const label = PLATFORM_LABEL[platform];
  const { posts, folders, byPost, loading } = useLibrary(platform);
  const sync = useSyncState(platform);
  const [settings] = useSettings();
  const [filters, setFilters] = useState<PostFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const search = useDeferredValue(searchInput);
  const [view, setView] = useState<View>(() => (localStorage.getItem(`view:${platform}`) as View) || 'list');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadProgress | null>(null);
  const lastClicked = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchIndex = useRef(new PostSearch());

  useEffect(() => localStorage.setItem(`view:${platform}`, view), [platform, view]);

  const allPosts = useMemo(() => posts ?? [], [posts]);
  const folderList = useMemo(() => folders ?? [], [folders]);
  useMemo(() => searchIndex.current.sync(allPosts), [allPosts]);

  const visible = useMemo(() => filterPosts(allPosts, { ...filters, search }, byPost, searchIndex.current), [allPosts, filters, search, byPost]);
  const { counts, unfiled } = useMemo(() => folderCounts(allPosts, byPost), [allPosts, byPost]);
  const currentFolder = filters.folder.kind === 'folder' ? folderList.find((f) => f.id === (filters.folder as { folderId: string }).folderId) : undefined;
  const scopeName = currentFolder?.name ?? (filters.folder.kind === 'unfiled' ? 'Unfiled' : 'All');

  // Drop selections that are no longer visible.
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      const ids = new Set(visible.map((p) => p.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [visible]);

  const selectedPosts = useMemo(() => visible.filter((p) => selected.has(p.id)), [visible, selected]);

  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      const idx = visible.findIndex((p) => p.id === id);
      setSelected((s) => {
        const next = new Set(s);
        if (shift && lastClicked.current !== null) {
          const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y);
          for (let i = a; i <= b; i++) next.add(visible[i].id);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClicked.current = idx;
    },
    [visible],
  );

  const onToggleFolder = useCallback((post: Post, folderId: string, member: boolean) => setFolderMembership(db, platform, folderId, [post.id], member), [platform]);

  const runDownload = useCallback(
    async (list: Post[], name: string) => {
      const withMedia = list.filter((p) => p.media.length);
      if (!withMedia.length) return setToast('No images or videos in the selection.');
      const res = await downloadMedia(platform, withMedia, name, settings.downloadMode, setDl);
      setDl(null);
      setToast(res.failed ? `Downloaded ${res.total - res.failed} files, ${res.failed} failed (links may have expired — sync again).` : `Downloaded ${res.total} files.`);
    },
    [platform, settings.downloadMode],
  );

  const onDelete = useCallback(
    async (post: Post) => {
      await deletePostsLocally(db, [post.id]);
      setToast('Removed from library (it is still saved on ' + label + ').');
    },
    [label],
  );

  const onDragStart = useCallback(
    (e: DragEvent, post: Post) => {
      const ids = selected.has(post.id) ? [...selected] : [post.id];
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = 'copyMove';
    },
    [selected],
  );

  const startSync = async (kind: 'incremental' | 'full') => {
    const r = await sendToBackground({ type: 'sync:start', platform, kind }).catch((e: Error) => ({ started: false, message: e.message }));
    if (!r.started && r.message) setToast(r.message);
  };

  const running = sync?.running;
  const connected = Boolean(sync?.lastSeenAt || sync?.lastSyncAt);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <button type="button" onClick={() => navigate('/')} title="Switch mode" className="focus-ring flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" data-testid="switch-mode">
          <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', platform === 'x' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white')}>
            <PlatformLogo platform={platform} className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold">{label}</span>
          {platform === 'threads' && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">beta</span>}
          <ArrowLeftRight className="h-4 w-4 text-zinc-400" />
        </button>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input aria-label="Search" placeholder={`Search ${PLATFORM_CONFIG[platform].savedLabel}…`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-full pl-9" />
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center">
            <Button size="sm" variant="primary" className="rounded-r-none" onClick={() => (running ? sendToBackground({ type: 'sync:stop', platform }) : startSync('incremental'))} data-testid="sync-button">
              {running ? <Square className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {running ? `Syncing… ${running.progress || ''}` : 'Sync'}
            </Button>
            <Menu
              label="Sync options"
              trigger={
                <Button size="sm" variant="primary" className="rounded-l-none border-l border-white/30 px-2" aria-label="Sync options">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            >
              {(close) => (
                <>
                  <MenuItem onClick={() => (close(), startSync('incremental'))}>Sync new {PLATFORM_CONFIG[platform].savedLabel}</MenuItem>
                  <MenuItem onClick={() => (close(), startSync('full'))}>Full resync (also removes unsaved{platform === 'x' ? ', imports X folders' : ''})</MenuItem>
                  <MenuItem onClick={() => (close(), window.open(PLATFORM_CONFIG[platform].savedPageUrl, '_blank'))}>Open {label} {PLATFORM_CONFIG[platform].savedLabel} page</MenuItem>
                </>
              )}
            </Menu>
          </div>
          <IconButton label="Settings" onClick={() => navigate('/settings')}>
            <SettingsIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-zinc-200 p-3 md:block dark:border-zinc-800">
          <Sidebar
            folders={folderList}
            counts={counts}
            total={allPosts.length}
            unfiled={unfiled}
            current={filters.folder}
            onSelect={(folder) => setFilters((f) => ({ ...f, folder }))}
            onCreate={(name) => void createFolder(db, platform, name)}
            onRename={(id, name) => void renameFolder(db, id, name)}
            onDelete={async (f: Folder) => {
              if (!confirm(`Delete folder "${f.name}"? Posts stay in your library.`)) return;
              await deleteFolder(db, f.id);
              if (filters.folder.kind === 'folder' && filters.folder.folderId === f.id) setFilters((x) => ({ ...x, folder: { kind: 'all' } }));
            }}
            onDropPosts={async (folderId, ids) => {
              await setFolderMembership(db, platform, folderId, ids, true);
              setToast(`Added ${ids.length} ${ids.length === 1 ? 'post' : 'posts'} to folder.`);
            }}
          />
          <div className="mt-6 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className={cx('h-2 w-2 rounded-full', running ? 'animate-pulse bg-brand' : sync?.lastSyncResult === 'error' ? 'bg-amber-500' : connected ? 'bg-emerald-500' : 'bg-zinc-400')} />
              {running ? 'Syncing…' : `Synced ${timeAgo(sync?.lastSyncAt)}`}
            </div>
            {sync?.lastSyncMessage && !running && <p className="mt-1" data-testid="sync-message">{sync.lastSyncMessage}</p>}
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <h2 className="mr-2 truncate text-base font-semibold" data-testid="scope-title">
              {scopeName} <span className="font-normal text-zinc-500">· {visible.length}</span>
            </h2>
            <Button size="sm" variant={showFilters ? 'secondary' : 'ghost'} onClick={() => setShowFilters((s) => !s)}>
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <div className="flex rounded-full border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="View">
                <IconButton label="List view" className={cx('h-7 w-7', view === 'list' && 'bg-zinc-200 dark:bg-zinc-700')} onClick={() => setView('list')}>
                  <List className="h-4 w-4" />
                </IconButton>
                <IconButton label="Gallery view" className={cx('h-7 w-7', view === 'gallery' && 'bg-zinc-200 dark:bg-zinc-700')} onClick={() => setView('gallery')}>
                  <Grid2x2 className="h-4 w-4" />
                </IconButton>
              </div>
              <Button size="sm" variant="ghost" onClick={() => runDownload(visible, scopeName)} disabled={!visible.length || Boolean(dl)}>
                <Download className="h-4 w-4" /> Download all
              </Button>
              <Menu
                label="Export"
                trigger={
                  <Button size="sm" variant="ghost">
                    <FileJson className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                }
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => (close(), exportMarkdown(platform, scopeName, visible, folderList, byPost))}>Markdown (this view)</MenuItem>
                    <MenuItem onClick={() => (close(), exportCSV(platform, scopeName, visible, folderList, byPost))}>CSV (this view)</MenuItem>
                    <MenuItem onClick={async () => (close(), setToast(`Backed up ${await exportJSON(platform)} posts.`))}>JSON backup ({label}, everything)</MenuItem>
                    <MenuItem onClick={() => (close(), fileInput.current?.click())}>
                      <Upload className="h-4 w-4" /> Import JSON backup…
                    </MenuItem>
                  </>
                )}
              </Menu>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="import-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    setToast(await importJSONFile(file));
                  } catch (err) {
                    setToast(err instanceof Error ? err.message : 'Import failed.');
                  }
                }}
              />
            </div>
          </div>

          {showFilters && <FilterBar filters={filters} setFilters={setFilters} />}

          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              folders={folderList}
              inFolder={currentFolder}
              onClear={() => setSelected(new Set())}
              onSelectAll={() => setSelected(new Set(visible.map((p) => p.id)))}
              onAdd={async (folderId) => {
                await setFolderMembership(db, platform, folderId, [...selected], true);
                setToast(`Added ${selected.size} to folder.`);
              }}
              onMove={async (folderId) => {
                await moveToFolder(db, platform, folderId, [...selected]);
                setToast(`Moved ${selected.size}.`);
              }}
              onRemoveFromFolder={async () => {
                if (!currentFolder) return;
                await setFolderMembership(db, platform, currentFolder.id, [...selected], false);
                setToast(`Removed ${selected.size} from ${currentFolder.name}.`);
              }}
              onDownload={() => runDownload(selectedPosts, scopeName)}
              onExport={() => exportMarkdown(platform, `${scopeName} selection`, selectedPosts, folderList, byPost)}
              onDelete={async () => {
                if (!confirm(`Remove ${selected.size} posts from the library? They stay saved on ${label}.`)) return;
                await deletePostsLocally(db, [...selected]);
                setSelected(new Set());
              }}
            />
          )}

          {dl && (
            <div className="border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800" role="status">
              Downloading {dl.done}/{dl.total}…
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full bg-brand transition-all" style={{ width: `${(dl.done / Math.max(1, dl.total)) * 100}%` }} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-zinc-500">Loading…</div>
          ) : allPosts.length === 0 ? (
            <EmptyState platform={platform} onSync={() => startSync('full')} running={Boolean(running)} message={sync?.lastSyncMessage ?? null} />
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-zinc-500">Nothing matches. Try another search, filter or folder.</div>
          ) : view === 'list' ? (
            <PostList
              posts={visible}
              render={(post) => (
                <PostCard
                  post={post}
                  folders={folderList}
                  memberOf={byPost.get(post.id)}
                  selected={selected.has(post.id)}
                  onToggleSelect={toggleSelect}
                  onToggleFolder={onToggleFolder}
                  onDownload={(p) => runDownload([p], scopeName)}
                  onDelete={onDelete}
                  onDragStart={onDragStart}
                  platformLabel={label}
                />
              )}
            />
          ) : (
            <Gallery posts={visible} selected={selected} onToggleSelect={toggleSelect} onDragStart={onDragStart} />
          )}
        </main>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function FilterBar({ filters, setFilters }: { filters: PostFilters; setFilters: (fn: (f: PostFilters) => PostFilters) => void }) {
  const toDate = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  const active = filters.author || filters.media !== 'any' || filters.from || filters.to;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <Input aria-label="Author" placeholder="@author" value={filters.author} onChange={(e) => setFilters((f) => ({ ...f, author: e.target.value }))} className="w-40" />
      <Select aria-label="Media type" value={filters.media} onChange={(e) => setFilters((f) => ({ ...f, media: e.target.value as PostFilters['media'] }))}>
        <option value="any">Any media</option>
        <option value="with-media">With media</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="gif">GIFs</option>
        <option value="none">Text only</option>
      </Select>
      <label className="flex items-center gap-1 text-sm text-zinc-500">
        From
        <Input type="date" aria-label="From date" value={toDate(filters.from)} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value ? Date.parse(e.target.value) : undefined }))} />
      </label>
      <label className="flex items-center gap-1 text-sm text-zinc-500">
        To
        <Input type="date" aria-label="To date" value={toDate(filters.to)} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value ? Date.parse(e.target.value) + 86_399_999 : undefined }))} />
      </label>
      {active && (
        <Button size="sm" variant="ghost" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, folder: f.folder, search: f.search }))}>
          <XIcon className="h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}

function BulkBar(props: {
  count: number;
  folders: Folder[];
  inFolder?: Folder;
  onClear: () => void;
  onSelectAll: () => void;
  onAdd: (folderId: string) => void;
  onMove: (folderId: string) => void;
  onRemoveFromFolder: () => void;
  onDownload: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const folderMenu = (labelText: string, icon: ReactNode, pick: (id: string) => void) => (
    <Menu
      label={labelText}
      align="left"
      trigger={
        <Button size="sm" variant="secondary">
          {icon} {labelText}
        </Button>
      }
    >
      {(close) =>
        props.folders.length ? (
          props.folders.map((f) => (
            <MenuItem key={f.id} onClick={() => (close(), pick(f.id))}>
              {f.name}
            </MenuItem>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-zinc-500">No folders yet.</div>
        )
      }
    </Menu>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 dark:border-sky-900 dark:bg-sky-950/40" data-testid="bulk-bar">
      <span className="text-sm font-semibold">{props.count} selected</span>
      <Button size="sm" variant="ghost" onClick={props.onSelectAll}>
        Select all
      </Button>
      {folderMenu('Add to folder', <FolderInput className="h-4 w-4" />, props.onAdd)}
      {folderMenu('Move to', <ArrowLeftRight className="h-4 w-4" />, props.onMove)}
      {props.inFolder && (
        <Button size="sm" variant="secondary" onClick={props.onRemoveFromFolder}>
          <FolderMinus className="h-4 w-4" /> Remove from {props.inFolder.name}
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={props.onDownload}>
        <Download className="h-4 w-4" /> Download media
      </Button>
      <Button size="sm" variant="secondary" onClick={props.onExport}>
        <FileJson className="h-4 w-4" /> Export
      </Button>
      <Button size="sm" variant="ghost" className="text-red-600" onClick={props.onDelete}>
        <Trash2 className="h-4 w-4" /> Remove
      </Button>
      <IconButton label="Clear selection" className="ml-auto" onClick={props.onClear}>
        <XIcon className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

function PostList({ posts, render }: { posts: Post[]; render: (p: Post) => ReactNode }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: posts.length, getScrollElement: () => parentRef.current, estimateSize: () => 160, overscan: 6, getItemKey: (i) => posts[i].id });
  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="post-list">
      <div className="relative mx-auto max-w-2xl" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((item) => (
          <div key={item.key} data-index={item.index} ref={v.measureElement} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
            {render(posts[item.index])}
          </div>
        ))}
      </div>
    </div>
  );
}

function Gallery({ posts, selected, onToggleSelect, onDragStart }: { posts: Post[]; selected: Set<string>; onToggleSelect: (id: string, shift: boolean) => void; onDragStart: (e: DragEvent, p: Post) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tiles = useMemo(() => posts.flatMap((post) => post.media.map((m, i) => ({ post, m, key: `${post.id}#${i}` }))), [posts]);
  const cols = Math.max(2, Math.floor((width - 16) / 220));
  const size = Math.floor((width - 16 - (cols - 1) * 8) / cols);
  const rows = Math.ceil(tiles.length / cols);
  const v = useVirtualizer({ count: rows, getScrollElement: () => parentRef.current, estimateSize: () => size + 8, overscan: 3 });
  if (!tiles.length) return <div className="p-10 text-center text-zinc-500">No images or videos in this view.</div>;
  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="gallery">
      <div className="relative" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} className="absolute left-0 flex gap-2" style={{ top: row.start, height: size }}>
            {tiles.slice(row.index * cols, row.index * cols + cols).map((t) => (
              <div key={t.key} draggable onDragStart={(e) => onDragStart(e, t.post)} className={cx('group relative overflow-hidden rounded-xl', selected.has(t.post.id) && 'ring-3 ring-brand')} style={{ width: size, height: size }}>
                <MediaThumb m={t.m} className="h-full w-full" />
                <input
                  type="checkbox"
                  aria-label="Select post"
                  checked={selected.has(t.post.id)}
                  onChange={() => {}}
                  onClick={(e) => onToggleSelect(t.post.id, e.shiftKey)}
                  className={cx('absolute top-2 left-2 h-4 w-4 accent-brand', !selected.has(t.post.id) && 'opacity-0 group-hover:opacity-100')}
                />
                <a href={t.post.url} target="_blank" rel="noreferrer" className="absolute right-0 bottom-0 left-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  @{t.post.author.handle} · {t.post.text.slice(0, 60)}
                </a>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ platform, onSync, running, message }: { platform: Platform; onSync: () => void; running: boolean; message: string | null }) {
  const cfg = PLATFORM_CONFIG[platform];
  const label = PLATFORM_LABEL[platform];
  return (
    <div className="mx-auto mt-16 max-w-md px-6 text-center" data-testid="empty-state">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <PlatformLogo platform={platform} className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold">Connect your {label} {cfg.savedLabel}</h2>
      <ol className="mt-4 space-y-2 text-left text-sm text-zinc-600 dark:text-zinc-300">
        <li>1. Make sure you are logged in to {label} in this browser.</li>
        <li>2. Open your {cfg.savedLabel} page once. The first import starts automatically.</li>
        <li>3. After that, new {cfg.savedLabel} sync in the background.</li>
      </ol>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="primary" onClick={() => window.open(cfg.savedPageUrl, '_blank')}>
          Open {label} {cfg.savedLabel}
        </Button>
        <Button onClick={onSync} disabled={running}>
          {running ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
      {message && <p className="mt-4 text-sm text-zinc-500">{message}</p>}
      <p className="mt-6 text-xs text-zinc-500">Already have a backup? Use Export → Import JSON backup.</p>
    </div>
  );
}
