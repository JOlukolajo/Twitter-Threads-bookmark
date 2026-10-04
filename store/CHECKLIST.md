# Publishing checklist

Everything here is ready; publishing is "create account → upload zip → paste text".

## 0. Before any store
- [ ] Bump `version` in `apps/extension/package.json` (WXT copies it into the manifest).
- [ ] `pnpm install && pnpm test && pnpm e2e` — all green.
- [ ] `pnpm zip` — creates `apps/extension/.output/saveboard-<version>-{chrome,edge,firefox}.zip` (+ a sources zip for Firefox).
- [ ] Privacy policy is live (step 1).

## 1. Privacy policy on GitHub Pages (free)
1. GitHub repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder: `/docs` → Save.
2. After a minute it is live at `https://<username>.github.io/Twitter-Threads-bookmark/privacy.html`.
3. Use that URL in every store listing.

## 2. Microsoft Edge Add-ons — $0
1. Register at https://partner.microsoft.com/dashboard/microsoftedge (free).
2. **Create new extension** → upload `saveboard-<version>-edge.zip`.
3. Paste listing text from `store/listing.md`, upload screenshots and the 440×280 tile.
4. Paste permission justifications from `store/permissions-justification.md`, privacy policy URL.
5. Submit. Review usually takes a few business days.

## 3. Firefox Add-ons (AMO) — $0
1. Sign in at https://addons.mozilla.org/developers/ (free).
2. **Submit a New Add-on** → "On this site" → upload `saveboard-<version>-firefox.zip`.
3. When asked for source code, upload `saveboard-<version>-sources.zip` and say: "Build with `pnpm install && pnpm --filter @saveboard/extension build:firefox` (Node 22, pnpm 10)."
4. Paste listing text, screenshots, privacy policy URL.

## 4. Chrome Web Store — $5 one-time (when you are ready)
1. Register at https://chrome.google.com/webstore/devconsole and pay the one-time $5 fee.
2. **New item** → upload `saveboard-<version>-chrome.zip`.
3. **Store listing**: text from `listing.md`, icon, screenshots, promo tile.
4. **Privacy**: single purpose, permission justifications, data-usage answers, privacy policy URL (all in `listing.md` / `permissions-justification.md`).
5. Submit for review.

## Updating later
Bump the version, `pnpm zip`, upload the new zip in each dashboard.
