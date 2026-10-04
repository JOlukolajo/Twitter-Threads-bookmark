# Store listing (Chrome Web Store / Edge Add-ons / Firefox Add-ons)

Copy these fields into each store's developer dashboard.

## Name (max 75 chars)
Saveboard – Bookmarks for X & Threads

> The name must not suggest the extension is made by X Corp. or Meta. Keep "for X & Threads" as a description of compatibility, never "Twitter Bookmarks" or "Threads Manager". The name lives in `apps/extension/lib/brand.ts`.

## Short description (max 132 chars)
Organize your X bookmarks and Threads saved posts into folders, search them instantly, and download images and videos. Private.

## Category
Productivity (Chrome: "Productivity → Workflow & Planning"; Edge: "Productivity"; Firefox: "Social & Communication" or "Productivity")

## Language
English

## Single purpose (Chrome requirement)
Saveboard helps you organize and back up the posts you have saved on X (bookmarks) and Threads (saved posts): it collects them into a local library where you can sort them into folders, search them, export them and download their media.

## Detailed description
Never lose a saved post again. Saveboard turns your X bookmarks and Threads saved posts into a searchable, organized library — right in your browser.

PICK YOUR MODE
• Start by choosing X or Threads. Each mode has its own library, folders and sync, so the two never get mixed.

ALWAYS UP TO DATE
• Imports all your existing bookmarks / saved posts the first time you open them.
• Picks up new saves instantly while you browse, and checks in the background on a schedule you choose.
• Unbookmarking on X removes the post from your library too.
• Imports your existing X bookmark folders.

ORGANIZE
• Unlimited folders. Drag and drop, multi-select, move, and put a post in several folders.
• "Add to folder" button right on x.com and threads.com, so you can file a post the moment you save it.
• Instant full-text search, plus filters by author, date and media type.
• List view and a media gallery view.

DOWNLOAD & EXPORT
• Download images and videos in the best available quality — one post, a selection, or a whole folder — as files or a single zip.
• Export to Markdown, CSV or a full JSON backup, and import backups back.

PRIVATE BY DESIGN
• Everything is stored locally in your browser. No account, no server, no tracking.
• Uses your existing logged-in session; your password is never touched.

Threads support is in beta.

Saveboard is an independent project and is not affiliated with, endorsed by, or sponsored by X Corp. or Meta Platforms, Inc.

## Assets
- Icon 128×128: `apps/extension/public/icon/128.png`
- Screenshots 1280×800: `store/assets/screenshots/*.png` (regenerate with `pnpm --filter @saveboard/extension screenshots`)
- Small promo tile 440×280: `store/assets/promo-440x280.png`

## Privacy practices (Chrome "Privacy" tab)
- Data collected: **none sent off-device.** Answer the data-usage questions as: the extension handles "Website content" (the user's own saved posts) locally only.
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness/lending.
- Privacy policy URL: `https://<your-github-username>.github.io/Twitter-Threads-bookmark/privacy.html` (see CHECKLIST.md)
- Remote code: **No** (all code ships in the package).
