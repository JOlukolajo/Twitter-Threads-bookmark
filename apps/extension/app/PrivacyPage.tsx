import { ArrowLeft } from 'lucide-react';
import { navigate } from './router';
import { PRIVACY_SECTIONS } from '@/lib/privacy';

export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <button type="button" onClick={() => (history.length > 1 ? history.back() : navigate('/'))} className="focus-ring mb-4 inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mb-6 text-2xl font-bold">Privacy</h1>
      <div className="space-y-5 text-[15px] leading-relaxed">
        {PRIVACY_SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="mb-1 font-semibold">{s.title}</h2>
            <p className="text-zinc-700 dark:text-zinc-300">{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
