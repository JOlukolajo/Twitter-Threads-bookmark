import { installInterceptor } from '@/lib/interceptor';

/** Page-context network capture on x.com (see lib/interceptor.ts). */
export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installInterceptor((url) => url.includes('/i/api/graphql/'));
  },
});
