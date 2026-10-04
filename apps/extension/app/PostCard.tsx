import { memo, type DragEvent } from 'react';
import { BadgeCheck, Download, ExternalLink, FolderPlus, Play, Trash2 } from 'lucide-react';
import type { Folder, MediaItem, Post } from '@saveboard/core';
import { IconButton, Menu, MenuItem, cx } from '@/components/ui';

export const DRAG_MIME = 'application/x-saveboard-posts';

function fmtDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            {part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}
            {part.replace(/^https?:\/\/(www\.)?/, '').length > 48 ? '…' : ''}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function MediaThumb({ m, className }: { m: MediaItem; className?: string }) {
  return (
    <a href={m.url} target="_blank" rel="noreferrer" className={cx('relative block overflow-hidden bg-zinc-100 dark:bg-zinc-800', className)}>
      <img src={m.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      {m.type !== 'image' && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
          <Play className="h-3 w-3" fill="currentColor" /> {m.type === 'gif' ? 'GIF' : 'Video'}
        </span>
      )}
    </a>
  );
}

function MediaGrid({ media }: { media: MediaItem[] }) {
  if (!media.length) return null;
  const shown = media.slice(0, 4);
  return (
    <div className={cx('mt-3 grid gap-1 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800', shown.length > 1 && 'grid-cols-2')}>
      {shown.map((m, i) => (
        <MediaThumb key={i} m={m} className={shown.length === 1 ? 'max-h-[420px]' : 'aspect-square'} />
      ))}
    </div>
  );
}

export interface PostCardProps {
  post: Post;
  folders: Folder[];
  memberOf: Set<string> | undefined;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onToggleFolder: (post: Post, folderId: string, member: boolean) => void;
  onDownload: (post: Post) => void;
  onDelete: (post: Post) => void;
  onDragStart: (e: DragEvent, post: Post) => void;
  platformLabel: string;
}

export const PostCard = memo(function PostCard({ post, folders, memberOf, selected, onToggleSelect, onToggleFolder, onDownload, onDelete, onDragStart, platformLabel }: PostCardProps) {
  const folderNames = folders.filter((f) => memberOf?.has(f.id));
  return (
    <article
      data-testid="post"
      draggable
      onDragStart={(e) => onDragStart(e, post)}
      className={cx(
        'group flex gap-3 border-b border-zinc-200 px-4 py-4 transition-colors dark:border-zinc-800',
        selected ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60',
      )}
    >
      <div className="flex w-10 shrink-0 flex-col items-center gap-2">
        {post.author.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-10 w-10 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold uppercase dark:bg-zinc-800">{post.author.handle.slice(0, 1)}</div>
        )}
        <input
          type="checkbox"
          aria-label="Select post"
          checked={selected}
          onChange={() => {}}
          onClick={(e) => onToggleSelect(post.id, e.shiftKey)}
          className={cx('h-4 w-4 accent-brand', !selected && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{post.author.name}</span>
            {post.author.verified && <BadgeCheck className="ml-0.5 inline h-4 w-4 text-brand" />}
            <span className="ml-1 text-zinc-500">@{post.author.handle}</span>
            <span className="text-zinc-500"> · {fmtDate(post.postedAt)}</span>
          </div>
          <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100">
            <Menu
              label="Folders"
              trigger={
                <IconButton label="Add to folder">
                  <FolderPlus className="h-4 w-4" />
                </IconButton>
              }
            >
              {() =>
                folders.length ? (
                  folders.map((f) => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                      <input type="checkbox" className="accent-brand" checked={Boolean(memberOf?.has(f.id))} onChange={(e) => onToggleFolder(post, f.id, e.target.checked)} />
                      {f.name}
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-zinc-500">Create a folder in the sidebar first.</div>
                )
              }
            </Menu>
            {post.media.length > 0 && (
              <IconButton label="Download media" onClick={() => onDownload(post)}>
                <Download className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label={`Open on ${platformLabel}`} onClick={() => window.open(post.url, '_blank', 'noreferrer')}>
              <ExternalLink className="h-4 w-4" />
            </IconButton>
            <Menu label="More" trigger={<IconButton label="More">⋯</IconButton>}>
              {(close) => (
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    onDelete(post);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove from library
                </MenuItem>
              )}
            </Menu>
          </div>
        </div>
        {post.text && (
          <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
            <Linkified text={post.text} />
          </p>
        )}
        <MediaGrid media={post.media} />
        {post.quoted && (
          <a href={post.quoted.url} target="_blank" rel="noreferrer" className="mt-3 block rounded-2xl border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
            <div className="truncate">
              <span className="font-semibold">{post.quoted.author.name}</span> <span className="text-zinc-500">@{post.quoted.author.handle}</span>
            </div>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{post.quoted.text}</p>
          </a>
        )}
        {folderNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {folderNames.map((f) => (
              <span key={f.id} className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});
