// Läuft in der MAIN world — voller Zugriff auf window und alle Cookies

function getCaptionTracks() {
  return window.ytInitialPlayerResponse
    ?.captions
    ?.playerCaptionsTracklistRenderer
    ?.captionTracks;
}

function exposeTracks() {
  const tracks = getCaptionTracks();
  if (tracks?.length) {
    document.documentElement.setAttribute(
      '__metube_captions__',
      JSON.stringify(tracks.map(t => ({ languageCode: t.languageCode, baseUrl: t.baseUrl })))
    );
    return true;
  }
  return false;
}

// Retry bis ytInitialPlayerResponse verfügbar
let attempts = 0;
const interval = setInterval(() => {
  if (exposeTracks() || ++attempts >= 20) clearInterval(interval);
}, 500);

// Transcript-Fetch in MAIN world ausführen (volle Cookie/Session-Unterstützung)
window.addEventListener('metube:fetch-transcript', async () => {
  document.documentElement.removeAttribute('__metube_transcript__');
  document.documentElement.setAttribute('__metube_transcript_status__', 'loading');

  const tracks = getCaptionTracks();
  if (!tracks?.length) {
    document.documentElement.setAttribute('__metube_transcript_status__', 'error:Kein Transcript verfügbar');
    return;
  }

  const track =
    tracks.find(t => t.languageCode === 'de') ||
    tracks.find(t => t.languageCode === 'en') ||
    tracks[0];

  try {
    // Versuche XML (Standard) und JSON3
    for (const url of [track.baseUrl, track.baseUrl + '&fmt=json3']) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const raw = await res.text();
      if (!raw?.trim()) continue;

      let text = null;

      if (raw.trim().startsWith('<')) {
        const doc = new DOMParser().parseFromString(raw, 'text/xml');
        text = Array.from(doc.querySelectorAll('text'))
          .map(el => el.textContent.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim())
          .filter(l => l)
          .join('\n');
      } else if (raw.trim().startsWith('{')) {
        const data = JSON.parse(raw);
        text = data.events
          ?.filter(e => e.segs)
          .map(e => e.segs.map(s => s.utf8 || '').join('').trim())
          .filter(l => l)
          .join('\n');
      }

      if (text) {
        document.documentElement.setAttribute('__metube_transcript__', text);
        document.documentElement.setAttribute('__metube_transcript_status__', 'done');
        return;
      }
    }
    document.documentElement.setAttribute('__metube_transcript_status__', 'error:Leere Antwort');
  } catch (err) {
    document.documentElement.setAttribute('__metube_transcript_status__', `error:${err.message}`);
  }
});

// SPA-Navigation: Tracks neu laden
let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    document.documentElement.removeAttribute('__metube_captions__');
    document.documentElement.removeAttribute('__metube_transcript__');
    document.documentElement.removeAttribute('__metube_transcript_status__');
    attempts = 0;
    const ri = setInterval(() => { if (exposeTracks() || ++attempts >= 20) clearInterval(ri); }, 500);
  }
}).observe(document.body, { childList: true, subtree: true });
