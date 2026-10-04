import { installInterceptor } from '@/lib/interceptor';

/** Page-context network capture on threads.com (see lib/interceptor.ts). */
export default defineContentScript({
  matches: ['https://*.threads.com/*', 'https://*.threads.net/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installInterceptor((url) => /\/(graphql\/query|api\/graphql|api\/v1\/)/.test(url));
  },
});
