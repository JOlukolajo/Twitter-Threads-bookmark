// Minimal Greasemonkey API on top of extension APIs, so ffbypasser.js runs unchanged
// as a content script. GM_getValue is synchronous, so storage is preloaded into a
// cache and ffbypasser.js waits on GM_ready before it starts.

var GM_ready, GM_flush, GM_getValue, GM_setValue, GM_deleteValue,
    GM_addValueChangeListener, GM_removeValueChangeListener,
    GM_xmlhttpRequest, GM_openInTab, GM_setClipboard, GM_registerMenuCommand;

(() => {
'use strict';

const store = chrome.storage.local;
const cache = Object.create(null);
const writes = new Set();        // promises of storage writes not yet committed
const inflight = new Map();      // key -> values written by this tab, awaiting their echo
const listeners = new Map();     // id -> { key, fn }
let nextListener = 1;

GM_ready = store.get(null).then(all => { Object.assign(cache, all); });

GM_flush = () => Promise.all([...writes]).catch(() => {});

function notify(key, oldValue, newValue, remote) {
    for (const { key: k, fn } of listeners.values()) {
        if (k !== key) continue;
        try { fn(key, oldValue, newValue, remote); } catch (e) { console.error('[FFBypasser]', e); }
    }
}

function write(key, value) {
    const oldValue = cache[key];
    if (value === undefined) delete cache[key];
    else cache[key] = value;

    if (!inflight.has(key)) inflight.set(key, []);
    const queue = inflight.get(key);
    queue.push(value);

    const done = () => {
        const i = queue.indexOf(value);
        if (i >= 0) queue.splice(0, i + 1);
        if (!queue.length) inflight.delete(key);
    };
    const p = (value === undefined ? store.remove(key) : store.set({ [key]: value }))
        .catch(e => console.error('[FFBypasser] storage', e))
        .finally(() => { writes.delete(p); done(); });
    writes.add(p);

    notify(key, oldValue, value, false);
}

// Other tabs (relay workers, the hop run) write to the same keys.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
        const queue = inflight.get(key);
        if (queue && queue.length) {
            // Our own write echoing back, or a remote write ours is about to replace.
            const i = queue.indexOf(newValue);
            if (i >= 0) queue.splice(0, i + 1);
            if (!queue.length) inflight.delete(key);
            continue;
        }
        const oldValue = cache[key];
        if (newValue === undefined) delete cache[key];
        else cache[key] = newValue;
        notify(key, oldValue, newValue, true);
    }
});

GM_getValue = (key, fallback) => (key in cache ? cache[key] : fallback);
GM_setValue = (key, value) => write(key, value);
GM_deleteValue = key => write(key, undefined);

GM_addValueChangeListener = (key, fn) => {
    const id = nextListener++;
    listeners.set(id, { key, fn });
    return id;
};
GM_removeValueChangeListener = id => { listeners.delete(id); };

// Cross-origin requests go through the service worker, which has host access.
GM_xmlhttpRequest = opts => {
    const port = chrome.runtime.connect({ name: 'ffb-xhr' });
    let settled = false;
    const finish = (cb, arg) => {
        if (settled) return;
        settled = true;
        try { port.disconnect(); } catch {}
        if (typeof cb === 'function') cb(arg);
    };

    port.onMessage.addListener(msg => {
        if (msg.ok) finish(opts.onload, msg.response);
        else if (msg.error === 'timeout') finish(opts.ontimeout);
        else finish(opts.onerror, msg.error);
    });
    port.onDisconnect.addListener(() => finish(opts.onerror, 'disconnected'));

    port.postMessage({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data == null ? null : String(opts.data),
        timeout: opts.timeout || 0,
    });

    return { abort() { finish(opts.onabort); } };
};

GM_openInTab = (url, opts) => {
    const o = typeof opts === 'object' && opts ? opts : { active: !opts };
    // The new tab reads the job record on load, so make sure it's committed first.
    const opened = GM_flush().then(() => chrome.runtime.sendMessage({
        type: 'ffb-open-tab',
        url,
        active: !!o.active,
        insert: !!o.insert,
        setParent: !!o.setParent,
    })).catch(() => null);
    return {
        close() {
            opened.then(res => {
                if (res && res.tabId != null) {
                    chrome.runtime.sendMessage({ type: 'ffb-close-tab', tabId: res.tabId }).catch(() => {});
                }
            });
        },
    };
};

function copyFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    (document.body || document.documentElement).appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch {}
    area.remove();
}

GM_setClipboard = text => {
    const value = String(text);
    try {
        navigator.clipboard.writeText(value).catch(() => copyFallback(value));
    } catch {
        copyFallback(value);
    }
};

// Userscript menu commands are exposed through the toolbar popup.
const commands = new Map();

GM_registerMenuCommand = (name, fn) => {
    commands.set(name, fn);
    return name;
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.id !== chrome.runtime.id) return;
    if (msg.type === 'ffb-menu-list') {
        sendResponse({ commands: [...commands.keys()] });
    } else if (msg.type === 'ffb-menu-run') {
        const fn = commands.get(msg.name);
        if (fn) setTimeout(fn, 0);
        sendResponse({ ok: !!fn });
    }
});

})();
