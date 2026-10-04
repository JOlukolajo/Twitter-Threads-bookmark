import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { Platform } from '@saveboard/core';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-600 disabled:opacity-50',
  secondary: 'border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-50',
  ghost: 'hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
};

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={cx(
        'focus-ring inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx('focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800', className)}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'focus-ring h-9 rounded-full border border-zinc-300 bg-white px-3 text-sm placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx('focus-ring h-9 rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900', className)}
      {...rest}
    />
  );
}

export function PlatformLogo({ platform, className = 'h-5 w-5' }: { platform: Platform; className?: string }) {
  if (platform === 'x') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77zm-1.08 16.2h1.7L7.4 4.73H5.58z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M16.5 11.2c-.2-2.6-1.8-4-4.2-4-2 0-3.3 1-3.9 2.4" />
      <path d="M16.8 11.6c-3.6-1-7.3-.3-7.3 2.4 0 1.6 1.5 2.4 3 2.3 2.6-.1 3.9-2 3.9-5.1 0-4.3-2.5-7.2-6.4-7.2C5.6 4 3.5 7.4 3.5 12s2.1 8 6.5 8c2.6 0 4.6-.8 6-2.3 1.8-2 1.8-5 0-6.3" />
    </svg>
  );
}

/** Small dropdown menu anchored to a trigger button. */
export function Menu({ trigger, children, align = 'right', label }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label}>
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          className={cx(
            'absolute z-30 mt-1 max-h-80 min-w-48 overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800', danger && 'text-red-600')}
    >
      {children}
    </button>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
      {message}
    </div>
  );
}
