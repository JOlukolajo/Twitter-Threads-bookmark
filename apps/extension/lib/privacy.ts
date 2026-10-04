/**
 * Privacy policy text. Shown in the extension (#/privacy) and kept in sync with
 * store/privacy-policy.md, which is published for the store listings.
 */
export const PRIVACY_UPDATED = '2026-10-04';

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Summary',
    body: 'Saveboard stores your saved posts only in your own browser. We do not run servers, collect analytics, or sell or share any data.',
  },
  {
    title: 'What the extension reads',
    body: 'While you use x.com or threads.com, the extension reads the responses those sites already send to your browser for your bookmarks / saved posts, and the save, unsave and bookmark-folder actions you take. To sync, it asks the site for your bookmarks / saved posts using your existing logged-in session, from a tab of that site. It does not read your password, messages, or any other site.',
  },
  {
    title: 'Where data is stored',
    body: 'Posts, folders, settings and sync state are stored in your browser (IndexedDB) on this device. Uninstalling the extension or using "Clear data" in Settings deletes them. Exports you create are ordinary files you control.',
  },
  {
    title: 'What is sent elsewhere',
    body: 'Nothing. The only network requests the extension makes are to x.com / threads.com (to load your own saved posts) and to their media servers (when you download images or videos). No data is sent to the developer or third parties.',
  },
  {
    title: 'Permissions',
    body: 'storage/unlimitedStorage: keep your library locally. alarms: schedule background sync. downloads: save media and exports. Access to x.com, twitter.com, threads.com and threads.net: read your saved posts there. Access to the media servers of X and Threads: download images and videos.',
  },
  {
    title: 'Limited Use',
    body: "Saveboard's use of information received from these sites complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the bookmark-management features you see.",
  },
  {
    title: 'Contact',
    body: 'Questions: open an issue on the project GitHub repository.',
  },
];
