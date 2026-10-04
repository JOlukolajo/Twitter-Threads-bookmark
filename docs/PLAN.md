# Plan: Our own "Twillot" for X + Meta Threads

> **Implementation status (MVP v0.1):**
> - Phases 1–7 are implemented. Working name: **Saveboard** (set in `apps/extension/lib/brand.ts`).
> - Tests:
>   - 31 core unit tests (parsers, DB rules, sync engine, backup).
>   - Playwright e2e against the built extension.
> - Still open from Phase 0: capture *real* X and Threads responses to replace the synthetic fixtures, and verify the replay headers against the live sites.
> - Design change from the original plan: the sync loop runs in the background worker. It replays requests through a tab of the site (not from the service worker), which avoids both cookie issues and timer throttling in background tabs.

## Context
The repo (`JOlukolajo/Twitter-Threads-bookmark`) is empty except for a README. Goal: a **free, local-first browser extension** that collects your saved posts from **X (Twitter)** and **Meta Threads**, keeps them updated on its own, lets you sort them into folders, and downloads media (images and videos).

Decisions so far:
- **Two separate modes.** The first screen asks you to pick X or Threads. Everything else happens inside that mode.
- **No spending yet.** Build and use it personally, unpacked. Prepare everything the Chrome Web Store needs so publishing later is just paying $5 and uploading.
- **Free MVP, no paid tiers.** Code is structured so limits or plans can be added later.
- **Public product eventually.**
- **v1.1 is fully planned now.** We can start it as soon as you're happy with the MVP. The main addition is "access my folders anywhere".

Twillot (open source, SolidJS, archived July 2025) shows the model works. It is an extension that reads X's own web API through your logged-in session and stores everything locally.

---

## 1. How it works

### X (Twitter)
- You're already logged in to x.com. The extension calls the same internal GraphQL endpoints the X website uses (`/i/api/graphql/<queryId>/Bookmarks`, `BookmarkFolderTimeline`, `TweetDetail`). It sends your cookies, the `ct0` CSRF token and the public web-client bearer token. **No paid X API is needed.**
- **Two collectors:**
  1. **Passive capture.** A script running in the page's main world wraps `fetch`/`XHR` on x.com. When X loads bookmarks, or you bookmark or unbookmark something (`CreateBookmark`/`DeleteBookmark`), we capture it instantly. This also records the current `queryId`s, which X rotates.
  2. **Active sync.** It pages through the Bookmarks timeline with cursors. The first run is a full import. Later runs are incremental and stop at the first post we already have.
- **Auto-update:** `chrome.alarms` runs an incremental sync every N minutes (configurable), plus live capture while you browse. It backs off on `429` responses using `x-rate-limit-reset`.
- **Media:** images use `pbs.twimg.com/...?name=orig`. Videos and GIFs use the highest-bitrate `mp4` in `video_info.variants`.

### Meta Threads
- The official Threads API (`graph.threads.net`) only covers your *own* posts. It **does not expose Saved posts**, so we use the session-based approach on threads.com (formerly threads.net).
- Passive capture runs on `threads.com/saved`. Posts come from the page's embedded JSON and its `/graphql/query` responses (`doc_id` plus `lsd`/`fb_dtsg` tokens). Active pagination replays the captured `doc_id` with cursors.
- Media comes from `image_versions2.candidates` (largest) and `video_versions`, including carousels.
- Threads is more fragile than X, so it ships labelled "beta" behind its own adapter.

### What you experience
1. **Open the extension.** The first screen is a **mode picker** with two large cards: **X** and **Threads**. Each card shows a connection status ("Logged in ✓" or "Open threads.com and log in"), a post count and the last sync time.
2. **Pick a mode.** You enter that platform's workspace, which has its own library, its own folders, its own sync and its own settings. A header switcher lets you jump to the other mode at any time. The last mode is remembered, and the picker can be set to always show.
3. **First import (inside the mode).** A progress bar runs: "Importing… 1,240 bookmarks". In X mode, your existing X bookmark folders become folders.
4. **On x.com and threads.com**, an **"Add to folder"** chip appears next to the bookmark/save button. It only shows that platform's folders.
5. **The mode's workspace** includes:
   - a folder sidebar
   - list view and media-gallery view
   - instant search and filters
   - bulk select with Download, Move and Export buttons
6. **Background updates.** The popup shows the status of each mode and has a "Sync now" button.

---

## 2. Tech stack ($0)
| Concern | Choice | Why |
|---|---|---|
| Extension framework | **WXT** (Vite, MV3) | One codebase builds for Chrome, Edge, Brave and Firefox. `wxt zip` produces store-ready packages |
| UI | **React + TypeScript + Tailwind + shadcn/ui** | The same components are reused in the v1.1 web viewer |
| Router | **TanStack Router** (or a simple hash router) | Routes: `/` mode picker, `/x/...` and `/threads/...` workspaces |
| Local DB | **Dexie.js** (IndexedDB) with `liveQuery` | Handles 100k+ posts and updates the UI reactively |
| Search | **MiniSearch** | Local full-text search, with one index per mode |
| Large lists | **TanStack Virtual** | |
| State | **Zustand** | |
| Zip and download | **fflate** + `chrome.downloads` | |
| Tests | **Vitest** + **Playwright** (Chromium is preinstalled) | |
| Repo | **pnpm monorepo** | |

### Layout
```
apps/extension/
  entrypoints/background.ts          # alarms, per-mode sync orchestrator, downloads
  entrypoints/x.content.ts           # capture + "Add to folder" chip on x.com
  entrypoints/threads.content.ts     # same for threads.com
  entrypoints/main-world/{x,threads}.ts  # fetch/XHR interceptors (page context)
  entrypoints/app/                   # full-page app: ModePicker → /x/* | /threads/*
  entrypoints/popup/                 # per-mode status + Sync now
packages/core/
  schema.ts            # Post, Author, Media, Folder, FolderItem, Tag — all carry `platform`
  adapters/x/          # endpoints, queryId discovery, parser → Post
  adapters/threads/
  db.ts, search.ts, export.ts, download.ts
  sync/                # (v1.1) Drive sync engine
apps/web/              # (v1.1) PWA viewer
store/                 # Web Store listing kit (see §4)
```

### Data model (two modes, sync-ready)
- Every record has `platform: 'x' | 'threads'`. **Folders and tags are scoped per platform**, so the modes never mix, and every query is filtered by the active mode.
- Every record also has a **UUID**, `createdAt`, `updatedAt` and a `deletedAt` tombstone, so v1.1 sync needs no migration.
- Tables:
  - `posts` (`platform`, `platformId`, `text`, `author`, `media[]`, `savedAt`, `raw`)
  - `folders`
  - `folder_items`
  - `tags`
  - `sync_state` (per-platform cursor, last sync time, captured queryIds and doc_ids)

---

## 3. MVP (v1.0)
**Shell**
1. A **mode picker** start screen (X or Threads) with per-mode connection status and counts. A mode switcher in the header, and the last mode remembered.

**Inside each mode, with the same features in both**
2. **Sync:**
   - full import, then incremental auto-sync on a configurable interval;
   - live capture of save and unsave;
   - in X mode, import of existing X bookmark folders.
   - Threads is labelled beta.
3. **Library:** list view and media-gallery view, full-text search, and filters (author, date range, media type: image/video/none, folder, unfiled).
4. **Folders:** unlimited, with create/rename/delete, drag-and-drop, bulk move/remove and multi-folder assignment. Plus the **"Add to folder" chip** on the site.
5. **Media download:** single post or batch (selection or whole folder) at best quality, as a zip or into `Platform/Folder/author_postId_n.ext` paths.
6. **Backup:** export and import JSON (full fidelity), plus Markdown and CSV export.

**Global**
7. Popup (status and Sync now), settings (sync interval, download naming, default mode), and a privacy page shown inside the extension.

---

## 4. Personal use now, store-ready later ($0 now)
- **Use it today for free:**
  1. Run `pnpm build`.
  2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `apps/extension/.output/chrome-mv3`.
  3. To update later: run `git pull && pnpm build`, then click **Reload** on the extension card.
  - This works in Chrome, Edge and Brave.
  - Chrome may sometimes show a "developer mode extensions" notice. It's harmless.
- **Optional free public channels:**
  - Microsoft Edge Add-ons and Firefox Add-ons (AMO) charge **no registration fee**, so you could publish there at $0 whenever you like.
  - The Edge store only serves Edge users, so Chrome and Brave users will still need the Chrome Web Store eventually (or must load the extension unpacked).
- **`store/` kit, prepared in the MVP so Chrome launch is "pay $5 → upload":**
  - `store/listing.md`: name (no trademark in the name, e.g. "Saveboard – bookmarks for X & Threads"; final name TBD), short and long descriptions, category, and the single-purpose statement.
  - `store/permissions-justification.md`: one line per permission (`storage`, `unlimitedStorage`, `alarms`, `downloads`, host permissions for x.com and threads.com).
  - `store/privacy-policy.md`: also published free via GitHub Pages from `/docs`. Covers data handling and the Limited Use disclosure (all data stays local, nothing is collected).
  - `store/assets/`: icons (16/32/48/128), 1280×800 screenshots captured by Playwright against fixture data, and 440×280 promo tile.
  - `pnpm zip` (via `wxt zip`) builds `chrome`, `edge` and `firefox` zips ready to upload.
  - `store/CHECKLIST.md`: step-by-step submission instructions for each store.
  - The manifest stays minimal with no remote code (MV3 compliant). Version numbers come from `package.json`.

## 5. Cost
| Item | Now | At public launch |
|---|---|---|
| Building and using it unpacked | $0 | $0 |
| Edge Add-ons / Firefox AMO | $0 | $0 |
| Chrome Web Store | — | $5 one-time (only when you choose) |
| Privacy policy and landing page (GitHub Pages) | $0 | $0 |
| v1.1 Drive sync (your own Drive) and PWA viewer (Cloudflare Pages) | $0 | $0 |
| Domain | optional | optional ~$10–15/yr |

## 6. Risks
- **Endpoint drift:** X `queryId`s and Meta `doc_id`s change. Mitigations:
  - capture them dynamically from live traffic and JS bundles;
  - keep a remote JSON config (data, not code, which MV3 allows) hosted free on GitHub;
  - test parsers against saved fixture responses.
- **Terms of service and store policy:** we only read your own data, in your own session, locally. Permissions stay minimal, there's a clear privacy policy, and no "Twitter"/"Threads" trademark goes in the product name.
- **Rate limits and account safety:** conservative pacing, backoff, and a cap on requests per window.
- **Cookies from the background service worker:** confirmed in the spike. If a background fetch doesn't send session cookies reliably, active sync runs inside an open x.com/threads.com tab instead.

---

## 7. MVP build phases
0. **Spike, about 1–2 days.** Capture real X Bookmarks and Threads Saved responses as fixtures, and confirm cookie behaviour from the service worker.
1. **Scaffold:** pnpm monorepo, WXT, React, Tailwind, Dexie schema (with `platform` scoping), Vitest, and the mode picker with routing.
2. **X adapter:** interceptor, `queryId` discovery, parser, paginated sync, alarms.
3. **Workspace UI (shared by both modes):** library, gallery, search, filters, folders, bulk actions.
4. **Threads adapter** (beta), plugged into the same workspace.
5. **Downloads and export/import.**
6. **"Add to folder" chips** on both sites.
7. **`store/` kit, zips and GitHub Pages privacy policy.** Then you load it unpacked and use it daily.

All work goes on branch `claude/charming-hypatia-f5mrar`, with a commit per phase.

---

## 8. v1.1 plan (starts once you're satisfied with the MVP)
**Goal:** access your folders anywhere, plus the most valuable upgrades, at a total cost of $0.

**A. Google Drive sync (bring your own cloud, no server)**
- Use `chrome.identity.launchWebAuthFlow` with Google OAuth and the `drive.appdata` scope. The data lives in a hidden app folder in your own Drive. A free Google Cloud project supplies the client ID.
- **Sync engine** (`packages/core/sync/`):
  - Sync per platform: `x.json.gz` and `threads.json.gz` snapshots plus small delta files.
  - Merge with last-write-wins on `updatedAt`, honouring tombstones.
  - Sync runs on alarm, on change (debounced) and on manual trigger.
- Media isn't uploaded. We store URLs plus metadata only, which keeps Drive usage tiny.
- Settings page gets a "Connect Google Drive" button, a status display and "Sync now".

**B. Web viewer PWA (`apps/web`)**
- Built with Vite, React and the same UI components as the extension. It has the same mode picker, then that platform's folders, search and gallery.
- You sign in with Google, and it reads the same Drive files. It works on a phone and can be installed to the home screen. It's read-only in v1.1, with editing in v1.2.
- Hosted free on Cloudflare Pages, or GitHub Pages under `*.pages.dev`.

**C. Feature upgrades**
1. **X thread unroll:** save a whole author thread (via `TweetDetail`) as one post-group, read it as an article, and export it as Markdown.
2. **Auto-folder rules (per mode):** if author, keyword, has video or link domain matches, assign the folder automatically on capture.
3. **Read status** (unread/read/archived) and **notes** on posts.
4. **Local media archive (optional):** auto-download the media of new saves, so deleted posts still keep their media on disk.
5. **Tags** alongside folders.

**v1.1 phases:**
1. Sync engine and Drive connector, with tests on merge logic.
2. PWA viewer.
3. Thread unroll.
4. Rules.
5. Read status and notes.
6. Media archive.
7. Release v1.1 (unpacked / Edge / Firefox, plus Chrome when you're ready).

**Later backlog (v1.2+):**
- Likes and own-post sync
- AI organization and semantic search (on-device or bring your own key)
- Editing from the PWA
- Notion/Obsidian/Readwise export
- Resurface digest
- Duplicate detection and `t.co` link expansion
- OCR search over images
- Public shared folders (needs a free-tier backend)
- Twillot extras: lists, follower cleanup, batch delete, archive import, reports

---

## 9. Verification
- **Unit tests (Vitest):**
  - X and Threads parsers against saved fixture JSON
  - incremental-sync stop logic
  - platform scoping, so no cross-mode leakage
  - folder operations
  - export → import round-trip
  - (v1.1) merge and tombstone logic
- **E2E (Playwright, preinstalled Chromium):** load the built extension and seed Dexie with fixtures. Then check:
  - the mode picker → X workspace → search, filter and folder moves → switch to Threads, which shows only Threads data;
  - the contents of a batch-download zip.
  - Store screenshots are generated by the same run.
- **Manual:** load the extension unpacked while logged in to X and Threads, then check:
  - import counts match each site;
  - saving or unsaving on the site appears within seconds in the right mode;
  - alarm sync picks up new saves;
  - downloaded video is the highest bitrate;
  - `pnpm zip` produces valid Chrome, Edge and Firefox packages.
