const DEFAULT_METUBE_URL = 'http://localhost:8081';

let injected = false;

function getVideoId() {
  const match = location.href.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

function createButton(label, icon, onClick) {
  const btn = document.createElement('button');
  btn.className = 'metube-btn';
  btn.innerHTML = `${icon}<span>${label}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function showToast(message, isError = false) {
  const existing = document.getElementById('metube-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'metube-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    padding: 10px 18px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: ${isError ? '#dc2626' : '#4f46e5'};
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    transition: opacity 0.3s;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function sendToMetube(downloadType) {
  const url = location.href;
  const { metubeUrl = DEFAULT_METUBE_URL } = await chrome.storage.sync.get('metubeUrl');

  try {
    const res = await fetch(`${metubeUrl}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        download_type: downloadType,
        quality: 'best',
        format: 'any',
        auto_start: true,
      }),
    });
    const data = await res.json();
    if (data.status === 'ok' || data.added) {
      showToast(downloadType === 'audio' ? 'Audio wird heruntergeladen…' : 'Video wird heruntergeladen…');
    } else {
      showToast(data.msg || 'Fehler beim Starten', true);
    }
  } catch {
    showToast(`MeTube nicht erreichbar (${metubeUrl})`, true);
  }
}

// Wartet bis content_main.js das Attribut gesetzt hat (max 5 Sekunden)
async function getCaptionTracks() {
  for (let i = 0; i < 10; i++) {
    const attr = document.documentElement.getAttribute('__metube_captions__');
    if (attr) {
      try { return JSON.parse(attr); } catch { return null; }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function fetchTranscriptText(baseUrl) {
  // Versuche zuerst XML (Standard-Format, zuverlässiger)
  for (const url of [baseUrl, baseUrl + '&fmt=json3']) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const raw = await res.text();
    if (!raw || raw.trim() === '') continue;

    if (raw.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(raw, 'text/xml');
      const text = Array.from(doc.querySelectorAll('text'))
        .map(el => el.textContent.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim())
        .filter(l => l)
        .join('\n');
      if (text) return text;
    }

    if (raw.trim().startsWith('{')) {
      const data = JSON.parse(raw);
      const text = data.events
        ?.filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 || '').join('').trim())
        .filter(l => l)
        .join('\n');
      if (text) return text;
    }
  }

  throw new Error('Kein Transcript verfügbar');
}

async function copyTranscript() {
  showToast('Transcript wird geladen…');

  try {
    const tracks = await getCaptionTracks();

    if (!tracks?.length) {
      showToast('Kein Transcript verfügbar', true);
      return;
    }

    const track =
      tracks.find(t => t.languageCode === 'de') ||
      tracks.find(t => t.languageCode === 'en') ||
      tracks[0];

    const text = await fetchTranscriptText(track.baseUrl);

    if (!text) { showToast('Transcript ist leer', true); return; }
    await navigator.clipboard.writeText(text);
    showToast('Transcript kopiert!');
  } catch (err) {
    showToast(`Fehler: ${err.message}`, true);
  }
}

function injectButtons() {
  if (!getVideoId()) return;
  if (document.getElementById('metube-bar')) return;

  const anchor = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer.ytd-video-primary-info-renderer');
  if (!anchor) return;

  if (!document.getElementById('metube-styles')) {
    const style = document.createElement('style');
    style.id = 'metube-styles';
    style.textContent = `
      #metube-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        padding: 8px 0;
        border-top: 1px solid rgba(255,255,255,0.1);
      }
      .metube-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border: none;
        border-radius: 18px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        font-family: 'Roboto', sans-serif;
      }
      .metube-btn:active { transform: scale(0.97); }
      .metube-btn-video { background: #4f46e5; color: #fff; }
      .metube-btn-video:hover { background: #4338ca; }
      .metube-btn-audio { background: rgba(255,255,255,0.1); color: #e8e8e8; }
      .metube-btn-audio:hover { background: rgba(255,255,255,0.18); }
      .metube-btn-transcript { background: rgba(255,255,255,0.08); color: #aaa; }
      .metube-btn-transcript:hover { background: rgba(255,255,255,0.15); color: #e8e8e8; }
    `;
    document.head.appendChild(style);
  }

  const bar = document.createElement('div');
  bar.id = 'metube-bar';

  const iconDownload = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const iconAudio = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  const iconCopy = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  const videoBtn = createButton('Video herunterladen', iconDownload, () => sendToMetube('video'));
  videoBtn.classList.add('metube-btn-video');

  const audioBtn = createButton('Audio', iconAudio, () => sendToMetube('audio'));
  audioBtn.classList.add('metube-btn-audio');

  const transcriptBtn = createButton('Transcript', iconCopy, copyTranscript);
  transcriptBtn.classList.add('metube-btn-transcript');

  bar.appendChild(videoBtn);
  bar.appendChild(audioBtn);
  bar.appendChild(transcriptBtn);

  anchor.parentNode.insertBefore(bar, anchor.nextSibling);
  injected = true;
}

// Nachrichten vom Popup empfangen
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'METUBE_GET_TRANSCRIPT') {
    (async () => {
      const tracks = await getCaptionTracks();
      if (!tracks?.length) { sendResponse({ error: 'Kein Transcript verfügbar' }); return; }

      const track =
        tracks.find(t => t.languageCode === 'de') ||
        tracks.find(t => t.languageCode === 'en') ||
        tracks[0];

      try {
        const text = await fetchTranscriptText(track.baseUrl);
        sendResponse(text ? { text } : { error: 'Transcript ist leer' });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true; // async response
  }
});

// YouTube navigiert ohne Seiten-Reload — auf URL-Änderungen reagieren
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    injected = false;
    setTimeout(tryInject, 1500);
  }
  if (!injected) tryInject();
});

function tryInject() {
  if (!location.href.includes('youtube.com/watch')) return;
  injectButtons();
}

observer.observe(document.body, { childList: true, subtree: true });
setTimeout(tryInject, 1500);
