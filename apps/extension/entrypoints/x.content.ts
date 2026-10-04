import { ContentRuntime } from '@/lib/content/runtime';
import { xContent } from '@/lib/content/x';
import { startChips, xChipAdapter } from '@/lib/content/chips';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_start',
  main() {
    const rt = new ContentRuntime(xContent);
    rt.start();
    startChips(rt, xChipAdapter);
  },
});
