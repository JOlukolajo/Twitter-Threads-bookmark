'use strict';

const box = document.getElementById('cmds');

function note(text) {
    box.textContent = '';
    const p = document.createElement('p');
    p.textContent = text;
    box.appendChild(p);
}

(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return note('No active tab.');

    let res = null;
    try {
        res = await chrome.tabs.sendMessage(tab.id, { type: 'ffb-menu-list' });
    } catch {}

    if (!res || !res.commands || !res.commands.length) {
        return note('FFBypasser isn’t running on this page. It works on regular web pages — try reloading the tab.');
    }

    box.textContent = '';
    res.commands.forEach((name, i) => {
        const b = document.createElement('button');
        b.textContent = name;
        if (i === 0) b.className = 'primary';
        b.addEventListener('click', async () => {
            try { await chrome.tabs.sendMessage(tab.id, { type: 'ffb-menu-run', name }); } catch {}
            window.close();
        });
        box.appendChild(b);
    });
})();
