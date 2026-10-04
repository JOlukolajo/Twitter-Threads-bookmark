import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { APP_NAME, APP_DESCRIPTION } from './lib/brand';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: APP_NAME,
    short_name: 'Saveboard',
    description: APP_DESCRIPTION,
    // Every permission is justified in store/permissions-justification.md.
    permissions: ['storage', 'unlimitedStorage', 'alarms', 'downloads'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://*.threads.com/*',
      'https://*.threads.net/*',
      // Media CDNs, so batch downloads can fetch files for zipping.
      'https://pbs.twimg.com/*',
      'https://video.twimg.com/*',
      'https://*.cdninstagram.com/*',
      'https://*.fbcdn.net/*',
    ],
    action: { default_title: 'Saveboard' },
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'saveboard@saveboard.app', strict_min_version: '128.0' } } }
      : {}),
  }),
  zip: {
    artifactTemplate: 'saveboard-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'saveboard-{{version}}-sources.zip',
    // Firefox reviewers need the whole monorepo (the extension imports packages/core).
    sourcesRoot: '../..',
    excludeSources: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', '**/test-results/**', 'store/assets/**', '.git/**'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
