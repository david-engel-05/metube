// Läuft in der MAIN world — hat direkten Zugriff auf window.ytInitialPlayerResponse
// Schreibt nur die Caption-Tracks als sauberes JSON in ein DOM-Attribut,
// damit content.js (isolated world) es lesen kann.
function exposeCaptions() {
  const tracks = window.ytInitialPlayerResponse
    ?.captions
    ?.playerCaptionsTracklistRenderer
    ?.captionTracks;

  if (tracks?.length) {
    document.documentElement.setAttribute(
      '__metube_captions__',
      JSON.stringify(tracks.map(t => ({ languageCode: t.languageCode, baseUrl: t.baseUrl })))
    );
    return true;
  }
  return false;
}

// Retry bis ytInitialPlayerResponse verfügbar ist (YouTube lädt async)
let attempts = 0;
const interval = setInterval(() => {
  if (exposeCaptions() || ++attempts >= 20) clearInterval(interval);
}, 500);

// Auch bei YouTube-Navigation (SPA) neu setzen
let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    document.documentElement.removeAttribute('__metube_captions__');
    attempts = 0;
    const retryInterval = setInterval(() => {
      if (exposeCaptions() || ++attempts >= 20) clearInterval(retryInterval);
    }, 500);
  }
}).observe(document.body, { childList: true, subtree: true });
