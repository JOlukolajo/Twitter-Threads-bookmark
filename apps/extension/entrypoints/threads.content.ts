import { ContentRuntime } from '@/lib/content/runtime';
import { ingestEmbeddedSaved, threadsContent } from '@/lib/content/threads';
import { startChips, threadsChipAdapter } from '@/lib/content/chips';

export default defineContentScript({
  matches: ['https://*.threads.com/*', 'https://*.threads.net/*'],
  runAt: 'document_start',
  main() {
    const rt = new ContentRuntime(threadsContent);
    rt.start();
    const onReady = () => ingestEmbeddedSaved(rt);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
    else onReady();
    startChips(rt, threadsChipAdapter);
  },
});
