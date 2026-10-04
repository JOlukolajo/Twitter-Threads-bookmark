# Saveboard: bookmarks for X & Threads

Saveboard is a free, local-first browser extension for the posts you save on **X** (bookmarks) and **Meta Threads** (saved posts). It keeps them in sync automatically, lets you sort them into folders and search them, and downloads their images and videos.

> Status: **MVP (v0.1)**. X support is complete. Threads support is **beta**. The full roadmap, including v1.1, is in [`docs/PLAN.md`](docs/PLAN.md).

## Features (MVP)

- **Two modes.** You start by picking **X** or **Threads**. Each mode has its own library, folders, sync and settings.
- **Auto-sync:**
  - The first visit to your bookmarks or saved page imports everything.
  - New saves are captured instantly while you browse.
  - A background check runs on a schedule you choose.
  - Unbookmarking a post on X removes it from the library.
  - Existing X bookmark folders are imported.
- **Folders:**
  - Unlimited folders, with drag and drop, multi-select, move, and multi-folder membership.
  - An **"Add to folder"** button appears right on x.com and threads.com.
- **Library:**
  - List view and media gallery view.
  - Instant full-text search.
  - Filters for author, date range and media type.
- **Downloads:** best-quality images and videos for one post, a selection or a whole folder, saved as separate files or as one zip.
- **Export and backup:** Markdown, CSV and full JSON backup, plus import (merge, newest change wins).
- **Private:** everything stays in your browser (IndexedDB). There are no servers, accounts or analytics.

## Use it now (free, no store needed)

Requirements: Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm build          # → apps/extension/.output/chrome-mv3
```

1. Open `chrome://extensions` (this also works in Edge and Brave), turn on **Developer mode**, click **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
2. Pin Saveboard to the toolbar. The library opens on install.
3. Pick **X**, then open your bookmarks at https://x.com/i/bookmarks while logged in. The first import starts by itself. For Threads, do the same at https://www.threads.com/saved.
4. **Updating:** run `git pull && pnpm install && pnpm build`, then click **Reload** on the extension card.

**Already-open tabs:** Chrome only adds extensions to tabs that load after installation, so reload any x.com or threads.com tabs that were open when you installed.

**Firefox:** `pnpm build:firefox`, then go to `about:debugging` → *This Firefox* → *Load Temporary Add-on* and pick `apps/extension/.output/firefox-mv3/manifest.json`. Click **Grant access** on the start screen.

## How it works

```
x.com / threads.com tab                                    extension
┌────────────────────────────────────────┐   messages   ┌───────────────────────────────┐
│ main world: fetch/XHR interceptor      │─────────────▶│ background service worker     │
│  (copies API responses, never changes) │              │  • stores posts (Dexie/IDB)   │
│ isolated content script                │◀─────────────│  • learns request templates   │
│  • parses captured pages, save/unsave  │  pageFetch   │  • sync loop (core engine)    │
│  • "Add to folder" chip                │              │  • alarms for auto-sync       │
└────────────────────────────────────────┘              └──────────────┬────────────────┘
                                                                      │ same IndexedDB
                                                        ┌──────────────▼────────────────┐
                                                        │ app page (React): mode picker │
                                                        │ → X / Threads workspace       │
                                                        └───────────────────────────────┘
```

- **Capture.** On the sites, a small script wraps `fetch` and `XMLHttpRequest` and copies the API responses the site already loads (bookmarks pages, save and unsave actions, folder actions) to the extension. This also teaches it the exact request the site uses to list your saved posts, including X's rotating GraphQL `queryId` and feature flags, and Threads' `doc_id`.
- **Sync.** The background worker replays that request page by page *from inside a tab of the site*, so it uses your normal logged-in session. It stops early on an incremental sync and runs to the end on a full sync, which also removes posts you unsaved elsewhere.
  - The loop is driven from the background so it isn't throttled when the tab is hidden.
  - If replaying fails (for example, the site changed), it falls back to scrolling the saved page and letting capture collect the posts.
- **No paid APIs.** It uses neither the official X API nor the Threads API, which doesn't expose saved posts anyway.

## Repository layout

```
packages/core        Data model, Dexie DB, parsers (X, Threads), sync engine,
                     search/filters, export, backup/merge, download planning.
                     Framework-free and reused by the v1.1 web viewer.
apps/extension       WXT (MV3) extension: entrypoints/, lib/ (capture, messaging),
                     app/ (React UI), e2e/ (Playwright).
store/               Store listing kit: listing text, permission justifications,
                     privacy policy, screenshots, promo tile, CHECKLIST.md.
docs/                PLAN.md, plus the GitHub Pages site (privacy policy).
```

## Development

```bash
pnpm dev            # WXT dev mode with hot reload (opens a browser)
pnpm test           # core unit tests (parsers, DB rules, sync engine, backup)
pnpm typecheck
pnpm e2e            # builds, then runs Playwright against the real extension
pnpm zip            # store-ready zips for Chrome, Edge, Firefox (+ sources)
pnpm --filter @saveboard/extension screenshots   # regenerate store screenshots
pnpm --filter @saveboard/extension icons         # re-render icons from store/assets/icon.svg
```

The e2e tests load the built extension into Chromium and serve stand-in x.com and threads.com pages whose API responses are the parser fixtures. They cover capture → template learning → automatic first sync → library UI without touching the real sites.

### Keeping up with site changes
X and Meta change their web APIs from time to time. When something breaks:
1. Open DevTools on the site and copy the failing response (Network tab → the `Bookmarks` / saved-posts GraphQL call).
2. Save it under `packages/core/test/fixtures/` and add a parser test.
3. Fix the parser in `packages/core/src/adapters/<platform>/parse.ts`.

The current fixtures are **synthetic**, modelled on the documented response shapes. Replacing them with real captures is the first job of the Phase-0 spike in the plan.

## Publishing

Everything the stores need is in [`store/`](store/). Follow [`store/CHECKLIST.md`](store/CHECKLIST.md):
- Edge Add-ons and Firefox Add-ons are free to publish.
- The Chrome Web Store needs a one-time $5 developer registration, needed only when you choose to publish there.

## Disclaimer

Saveboard is an independent project. It is not affiliated with, endorsed by, or sponsored by X Corp. or Meta Platforms, Inc. It only reads your own data, in your own browser session.
