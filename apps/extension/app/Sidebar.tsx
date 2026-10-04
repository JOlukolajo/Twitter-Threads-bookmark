import { useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Folder as FolderIcon, FolderOpen, Inbox, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Folder, FolderFilter } from '@saveboard/core';
import { cx } from '@/components/ui';
import { DRAG_MIME } from './PostCard';

interface Props {
  folders: Folder[];
  counts: Map<string, number>;
  total: number;
  unfiled: number;
  current: FolderFilter;
  onSelect: (f: FolderFilter) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (folder: Folder) => void;
  onDropPosts: (folderId: string, postIds: string[]) => void;
}

function Row({
  active,
  icon,
  label,
  count,
  onClick,
  dropTarget,
  onDrop,
  actions,
  testId,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  dropTarget?: boolean;
  onDrop?: (ids: string[]) => void;
  actions?: ReactNode;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  const dragProps = dropTarget
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes(DRAG_MIME)) {
            e.preventDefault();
            setOver(true);
          }
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          try {
            onDrop?.(JSON.parse(e.dataTransfer.getData(DRAG_MIME)));
          } catch {
            /* ignore foreign drops */
          }
        },
      }
    : {};
  return (
    <div
      {...dragProps}
      data-testid={testId}
      className={cx(
        'group flex items-center rounded-full pr-1 transition-colors',
        active ? 'bg-zinc-200/70 font-semibold dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900',
        over && 'ring-2 ring-brand',
      )}
    >
      <button type="button" onClick={onClick} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-full px-3 py-2 text-left text-sm">
        <span className="shrink-0 text-zinc-500">{icon}</span>
        <span className="truncate">{label}</span>
        <span className="ml-auto pl-2 text-xs text-zinc-500 tabular-nums">{count}</span>
      </button>
      {actions && <div className="hidden shrink-0 items-center group-hover:flex">{actions}</div>}
    </div>
  );
}

export function Sidebar({ folders, counts, total, unfiled, current, onSelect, onCreate, onRename, onDelete, onDropPosts }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
    setName('');
    setCreating(false);
  };

  return (
    <nav aria-label="Folders" className="flex flex-col gap-0.5">
      <Row active={current.kind === 'all'} icon={<Layers className="h-4 w-4" />} label="All" count={total} onClick={() => onSelect({ kind: 'all' })} />
      <Row active={current.kind === 'unfiled'} icon={<Inbox className="h-4 w-4" />} label="Unfiled" count={unfiled} onClick={() => onSelect({ kind: 'unfiled' })} />
      <div className="mt-4 mb-1 flex items-center justify-between px-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Folders
        <button type="button" aria-label="New folder" title="New folder" onClick={() => setCreating(true)} className="focus-ring rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {creating && (
        <form onSubmit={submit} className="px-1 pb-1">
          <input
            autoFocus
            aria-label="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
            placeholder="Folder name"
            maxLength={80}
            className="focus-ring h-9 w-full rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </form>
      )}
      {folders.length === 0 && !creating && <p className="px-3 py-2 text-sm text-zinc-500">No folders yet. Drag posts onto a folder to file them.</p>}
      {folders.map((f) => {
        const active = current.kind === 'folder' && current.folderId === f.id;
        if (editing === f.id) {
          return (
            <form
              key={f.id}
              className="px-1"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(f.id, editName);
                setEditing(null);
              }}
            >
              <input
                autoFocus
                aria-label="Rename folder"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  onRename(f.id, editName);
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                className="focus-ring h-9 w-full rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </form>
          );
        }
        return (
          <Row
            key={f.id}
            testId="folder-row"
            active={active}
            icon={active ? <FolderOpen className="h-4 w-4" /> : <FolderIcon className="h-4 w-4" />}
            label={f.name}
            count={counts.get(f.id) ?? 0}
            onClick={() => onSelect({ kind: 'folder', folderId: f.id })}
            dropTarget
            onDrop={(ids) => onDropPosts(f.id, ids)}
            actions={
              <>
                <button
                  type="button"
                  aria-label={`Rename ${f.name}`}
                  title="Rename"
                  className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  onClick={() => {
                    setEditing(f.id);
                    setEditName(f.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Delete ${f.name}`} title="Delete folder" className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-700" onClick={() => onDelete(f)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            }
          />
        );
      })}
    </nav>
  );
}
