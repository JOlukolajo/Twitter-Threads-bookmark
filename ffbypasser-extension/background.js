// Service worker: performs GM_xmlhttpRequest and GM_openInTab for the content script.
'use strict';

const HOST_RE = /(?:^|\.)fuckingfast\.co$/i;

function allowedUrl(raw) {
    try {
        const u = new URL(raw);
        return /^https?:$/.test(u.protocol) && HOST_RE.test(u.hostname);
    } catch { return false; }
}

// fetch() can't set Origin/Referer, so rewrite them on this extension's own requests
// to look like they came from the file page, as the userscript's requests did.
chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
        id: 1,
        priority: 1,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                { header: 'origin', operation: 'set', value: 'https://fuckingfast.co' },
                { header: 'referer', operation: 'set', value: 'https://fuckingfast.co/' },
            ],
        },
        condition: {
            requestDomains: ['fuckingfast.co'],
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: ['xmlhttprequest'],
        },
    }],
}).catch(e => console.warn('[FFBypasser] header rule', e));

const FORBIDDEN_HEADERS = /^(?:origin|referer|host|cookie|content-length|connection)$/i;

chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'ffb-xhr' || !port.sender || port.sender.id !== chrome.runtime.id) return;

    const ctrl = new AbortController();
    let open = true;
    port.onDisconnect.addListener(() => { open = false; ctrl.abort(); });
    const reply = msg => { if (open) try { port.postMessage(msg); } catch {} };

    port.onMessage.addListener(async req => {
        if (!allowedUrl(req.url)) return reply({ ok: false, error: 'host not allowed' });

        let timedOut = false;
        const timer = req.timeout > 0
            ? setTimeout(() => { timedOut = true; ctrl.abort(); }, req.timeout)
            : null;
        try {
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers || {})) {
                if (!FORBIDDEN_HEADERS.test(k)) headers.set(k, v);
            }
            const method = String(req.method || 'GET').toUpperCase();
            const res = await fetch(req.url, {
                method,
                headers,
                body: method === 'GET' || method === 'HEAD' ? undefined : (req.data ?? ''),
                credentials: 'include',
                redirect: 'follow',
                signal: ctrl.signal,
            });
            const responseText = await res.text();
            const responseHeaders = [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n');
            reply({
                ok: true,
                response: {
                    status: res.status,
                    statusText: res.statusText,
                    finalUrl: res.url,
                    responseHeaders,
                    responseText,
                },
            });
        } catch {
            reply({ ok: false, error: timedOut ? 'timeout' : 'network error' });
        } finally {
            clearTimeout(timer);
        }
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.id !== chrome.runtime.id || !sender.tab) return;

    if (msg.type === 'ffb-open-tab') {
        if (!allowedUrl(msg.url)) { sendResponse({ error: 'host not allowed' }); return; }
        const opts = { url: msg.url, active: !!msg.active };
        if (msg.insert) opts.index = sender.tab.index + 1;
        if (msg.setParent) opts.openerTabId = sender.tab.id;
        chrome.tabs.create(opts)
            .then(tab => sendResponse({ tabId: tab.id }))
            .catch(e => sendResponse({ error: String(e && e.message || e) }));
        return true;
    }

    if (msg.type === 'ffb-close-tab') {
        // Only close tabs that this tab opened for relaying.
        chrome.tabs.get(msg.tabId)
            .then(tab => (tab.openerTabId === sender.tab.id ? chrome.tabs.remove(tab.id) : null))
            .catch(() => {})
            .finally(() => sendResponse({}));
        return true;
    }
});
