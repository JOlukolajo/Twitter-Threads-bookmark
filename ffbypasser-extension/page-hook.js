// Runs in the page's own JavaScript world on fuckingfast.co (including iframes).
// Content scripts live in an isolated world and can't see the page's fetch/XHR or
// window.open, so this bridges the two pieces the userscript needs via DOM events:
//   ffb:hx-redirect  (page -> extension)  an htmx response carried a redirect URL
//   ffb:neuter       (extension -> page)  block popup ads and leave-page prompts
(() => {
'use strict';

const emit = url => {
    if (url) window.dispatchEvent(new CustomEvent('ffb:hx-redirect', { detail: String(url) }));
};

try {
    const proto = XMLHttpRequest.prototype;
    const origOpen = proto.open;
    proto.open = function (...args) {
        this.addEventListener('readystatechange', () => {
            if (this.readyState !== 4) return;
            try { emit(this.getResponseHeader('hx-redirect') || this.getResponseHeader('hx-location')); } catch {}
        });
        return origOpen.apply(this, args);
    };
} catch {}

try {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
        return origFetch.apply(this, args).then(res => {
            try { emit(res.headers.get('hx-redirect') || res.headers.get('hx-location')); } catch {}
            return res;
        });
    };
} catch {}

window.addEventListener('ffb:neuter', () => {
    try { window.open = () => null; } catch {}
    try { window.addEventListener('beforeunload', e => e.stopImmediatePropagation(), true); } catch {}
});

})();
