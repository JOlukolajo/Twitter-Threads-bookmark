import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { ArrowLeft } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABEL, clearPlatform } from '@saveboard/core';
import { Button, Select, Toast } from '@/components/ui';
import { db } from '@/lib/db';
import { APP_SHORT_NAME } from '@/lib/brand';
import { exportJSON, importJSONFile } from './actions';
import { useSettings } from './hooks';
import { navigate } from './router';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function SettingsPage() {
  const [s, update] = useSettings();
  const [toast, setToast] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <button type="button" onClick={() => history.length > 1 ? history.back() : navigate('/')} className="focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Sync">
        <Row label="Auto-sync" hint="Checks for new saved posts in the background.">
          <Select aria-label="Auto-sync interval" value={s.syncIntervalMin} onChange={(e) => update({ syncIntervalMin: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
            <option value={180}>Every 3 hours</option>
            <option value={720}>Every 12 hours</option>
          </Select>
        </Row>
        <Row label="Open a background tab when needed" hint="If no X/Threads tab is open, auto-sync briefly opens one in the background and closes it after.">
          <Toggle label="Open a background tab when needed" checked={s.allowBackgroundTab} onChange={(v) => update({ allowBackgroundTab: v })} />
        </Row>
      </Section>

      <Section title="Library">
        <Row label="Always start at the mode picker" hint="Otherwise the last mode you used opens directly.">
          <Toggle label="Always start at the mode picker" checked={s.alwaysShowPicker} onChange={(v) => update({ alwaysShowPicker: v })} />
        </Row>
        <Row label={`Show "Add to folder" button on X and Threads`}>
          <Toggle label="Show Add to folder button" checked={s.showChips} onChange={(v) => update({ showChips: v })} />
        </Row>
        <Row label="Media downloads" hint="Separate files go to Downloads/Saveboard/<Platform>/<Folder>/.">
          <Select aria-label="Media downloads" value={s.downloadMode} onChange={(e) => update({ downloadMode: e.target.value as 'files' | 'zip' })}>
            <option value="files">Separate files</option>
            <option value="zip">One .zip file</option>
          </Select>
        </Row>
      </Section>

      <Section title="Backup">
        <Row label="Export everything" hint="A full JSON backup of both modes (posts, folders).">
          <Button onClick={async () => setToast(`Backed up ${await exportJSON('all')} posts.`)}>Export JSON</Button>
        </Row>
        <Row label="Import a backup" hint="Merges with what you have. Newer changes win.">
          <label className="focus-ring inline-flex h-9 cursor-pointer items-center rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Choose file…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setToast(await importJSONFile(f));
                } catch (err) {
                  setToast(err instanceof Error ? err.message : 'Import failed.');
                }
              }}
            />
          </label>
        </Row>
      </Section>

      <Section title="Danger zone">
        {PLATFORMS.map((p) => (
          <Row key={p} label={`Clear ${PLATFORM_LABEL[p]} data`} hint="Deletes this mode's posts, folders and sync state from this browser. Nothing changes on the site.">
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Delete all ${PLATFORM_LABEL[p]} data from ${APP_SHORT_NAME}? Consider exporting a backup first.`)) return;
                await clearPlatform(db, p);
                setToast(`${PLATFORM_LABEL[p]} data cleared.`);
              }}
            >
              Clear
            </Button>
          </Row>
        ))}
      </Section>

      <p className="text-center text-sm text-zinc-500">
        <a className="underline" href="#/privacy">
          Privacy
        </a>{' '}
        · Version {browser.runtime.getManifest().version}
      </p>
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}
