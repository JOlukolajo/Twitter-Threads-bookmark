# Permission justifications

Paste each line into the store's "Permission justification" fields.

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings and library locally. |
| `unlimitedStorage` | A library of saved posts can exceed the default IndexedDB quota (users can have 100k+ bookmarks). Data stays on the device. |
| `alarms` | Schedules the optional background check for newly saved posts (interval chosen by the user, can be turned off). |
| `downloads` | Saves images/videos from the user's saved posts, and exports (Markdown/CSV/JSON), to the user's Downloads folder when they click Download/Export. |
| Host: `https://x.com/*`, `https://twitter.com/*` | Reads the user's own bookmarks on X (from responses the site already loads, and by requesting the bookmarks list with the user's session), and shows the "Add to folder" button on posts. |
| Host: `https://*.threads.com/*`, `https://*.threads.net/*` | Same as above, for the user's saved posts on Threads. |
| Host: `https://pbs.twimg.com/*`, `https://video.twimg.com/*` | Downloads images and videos from X's media servers when the user asks to download media as a zip. |
| Host: `https://*.cdninstagram.com/*`, `https://*.fbcdn.net/*` | Downloads images and videos from Threads' media servers when the user asks to download media as a zip. |

Content scripts run only on x.com / twitter.com / threads.com / threads.net. No remote code is loaded or executed.
