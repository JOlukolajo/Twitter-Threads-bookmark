# FFBypasser — browser extension

The [FFBypasser](https://github.com/cdxud/FFBypasser) userscript, repackaged as a
Manifest V3 extension so it runs without Tampermonkey/Violentmonkey.

It collects `fuckingfast.co` links from any page (e.g. a FitGirl repack page) and
resolves them to direct download URLs, with the same blue panel, copy/export,
history and settings as the userscript.

## Install (Chrome, Edge, Brave, Opera)

1. Download and unzip `ffbypasser-extension.zip` (or use this folder directly).
2. Open `chrome://extensions` (`edge://extensions` on Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json`).

If you also have the FFBypasser userscript installed, disable it. The extension
won't double up on a page, but there's no need to run both.

## Use

- Open a page with fuckingfast links. A blue ⚡ button appears in the bottom-right.
- Or press **Alt+F** on any page, or click the toolbar icon to open the panel,
  scan the page, restore or clear the saved list, or cancel a redirect run.
- Click **Resolve** and the links come back as direct URLs. They're copied to the
  clipboard, and you can also save them as `Out_Direct_Links.txt`.

## Files

| File | Role |
| --- | --- |
| `ffbypasser.js` | The original userscript, with only a few adaptations noted below |
| `gm-shim.js` | Implements the `GM_*` API (storage, requests, tabs, clipboard, menu) using extension APIs |
| `background.js` | Service worker: cross-origin requests to fuckingfast.co and opening/closing relay tabs |
| `page-hook.js` | Runs in the page's own JS world on fuckingfast.co to catch htmx redirects and block popup ads |
| `popup.html/js` | Toolbar popup listing the userscript's menu commands |

Changes from the userscript: it waits for saved settings to load before starting, it
finishes saving before redirecting the tab, and its fetch/XHR/`window.open` patches
now live in `page-hook.js`, because extension content scripts can't touch the
page's own copies of these. Background requests and relay tabs are limited to fuckingfast.co.
