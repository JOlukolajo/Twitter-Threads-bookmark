import type { Platform } from '@saveboard/core';

export interface PlatformConfig {
  /** Match patterns for tabs of this site. */
  tabPatterns: string[];
  /** The page that lists saved posts; opened for syncing when needed. */
  savedPageUrl: string;
  savedPathPrefix: string;
  homeUrl: string;
  savedLabel: string;
}

export const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  x: {
    tabPatterns: ['https://x.com/*', 'https://twitter.com/*'],
    savedPageUrl: 'https://x.com/i/bookmarks',
    savedPathPrefix: '/i/bookmarks',
    homeUrl: 'https://x.com/home',
    savedLabel: 'bookmarks',
  },
  threads: {
    tabPatterns: ['https://*.threads.com/*', 'https://*.threads.net/*'],
    savedPageUrl: 'https://www.threads.com/saved',
    savedPathPrefix: '/saved',
    homeUrl: 'https://www.threads.com/',
    savedLabel: 'saved posts',
  },
};
