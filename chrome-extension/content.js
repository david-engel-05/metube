/**
 * content.js — MeTube Chrome Extension
 *
 * Dieses Script wird von Chrome automatisch in jede YouTube-Videoseite
 * injiziert (deklariert in manifest.json unter "content_scripts").
 *
 * Es läuft in einer isolierten Sandbox ("isolated world") — das bedeutet:
 * - Es hat Zugriff auf das DOM der Seite, aber NICHT auf YouTube's JavaScript-Variablen
 * - Es hat Zugriff auf Chrome Extension APIs (chrome.storage, chrome.runtime, ...)
 * - Es kann Cross-Origin Fetches machen zu Hosts die in manifest.json → "host_permissions" stehen
 *
 * Was dieses Script tut:
 * 1. Fügt 3 Buttons unter YouTube-Videos ein (Video, Audio, Transcript)
 * 2. Sendet Download-Anfragen an die MeTube-Instanz
 * 3. Lädt das Transcript via YouTube Innertube API und kopiert es in die Zwischenablage
 * 4. Hört auf Nachrichten vom Popup (popup.js) für dieselben Aktionen
 */

// Standard-URL der MeTube-Instanz (änderbar in den Einstellungen via options.html)
const DEFAULT_METUBE_URL = 'https://metube.yanisdaengeli.ch/';

// Verhindert dass die Buttons mehrfach eingefügt werden
let injected = false;


// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Extrahiert die YouTube Video-ID aus der aktuellen URL.
 * Beispiel: youtube.com/watch?v=abc123 → "abc123"
 * Das Regex [?&]v= sucht nach "?v=" oder "&v=" im URL-String.
 */
function getVideoId() {
  const match = location.href.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Erstellt einen <button> mit Icon + Label und registriert den Click-Handler.
 * Die Buttons werden später in injectButtons() zusammengebaut.
 */
function createButton(label, icon, onClick) {
  const btn = document.createElement('button');
  btn.className = 'metube-btn';
  btn.innerHTML = `${icon}<span>${label}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Zeigt eine temporäre Benachrichtigung (Toast) unten rechts auf der Seite.
 * Verschwindet automatisch nach 3 Sekunden mit Fade-Out.
 * @param {boolean} isError — rot (Fehler) oder lila (Erfolg/Info)
 */
function showToast(message, isError = false) {
  // Vorherigen Toast entfernen falls noch sichtbar
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

  // Nach 3 Sekunden ausblenden, nach 300ms (Fade) entfernen
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// ============================================================
// DOWNLOAD-FUNKTION
// ============================================================

/**
 * Sendet die aktuelle YouTube-URL an MeTube zum Herunterladen.
 *
 * MeTube hat eine einfache REST API: POST /add mit JSON-Body.
 * Die MeTube-URL wird aus chrome.storage gelesen (konfigurierbar in options.html).
 *
 * @param {string} downloadType — "video" oder "audio"
 */
async function sendToMetube(downloadType) {
  const url = location.href;

  // MeTube-URL aus den gespeicherten Einstellungen laden.
  // chrome.storage.sync synchronisiert die Einstellungen über alle Geräte des Nutzers.
  const { metubeUrl = DEFAULT_METUBE_URL } = await chrome.storage.sync.get('metubeUrl');

  try {
    const res = await fetch(`${metubeUrl}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        download_type: downloadType, // "video" oder "audio"
        quality: 'best',
        format: 'any',
        auto_start: true,            // Direkt starten ohne manuelle Bestätigung in MeTube
      }),
    });

    const data = await res.json();

    // MeTube gibt { status: "ok" } oder { added: true } bei Erfolg zurück
    if (data.status === 'ok' || data.added) {
      showToast(downloadType === 'audio' ? 'Audio wird heruntergeladen…' : 'Video wird heruntergeladen…');
    } else {
      showToast(data.msg || 'Fehler beim Starten', true);
    }
  } catch {
    // fetch() wirft einen Fehler wenn MeTube nicht erreichbar ist (z.B. Server offline)
    showToast(`MeTube nicht erreichbar (${metubeUrl})`, true);
  }
}


// ============================================================
// TRANSCRIPT-FUNKTION (YouTube Innertube API)
// ============================================================

/**
 * Lädt das Transcript eines YouTube-Videos in 3 Schritten:
 *
 * ── SCHRITT 1: Innertube API ──────────────────────────────────────────────
 *   YouTube hat eine interne API namens "Innertube" die auch die offizielle
 *   YouTube-App (Android/iOS) nutzt. Wenn wir uns als Android-App ausgeben
 *   (clientName: "ANDROID"), bekommen wir ohne Login vollständige Videodaten
 *   zurück — inklusive signierter URLs für die Caption-Tracks.
 *
 *   Warum Android? Browser-Anfragen brauchen zusätzliche Auth-Parameter
 *   (Cookies, Tokens), die Android-App nicht. Einfacherer Zugriff.
 *
 * ── SCHRITT 2: Caption XML abrufen ───────────────────────────────────────
 *   Die signierten URLs aus Schritt 1 zeigen auf YouTube's timedtext-Server.
 *   Diese liefern ein XML-Dokument mit dem vollständigen Transcript.
 *   Die Signatur im URL-Parameter verhindert dass fremde Server die Captions abrufen.
 *
 * ── SCHRITT 3: XML parsen ────────────────────────────────────────────────
 *   YouTube nutzt "timedtext format 3" mit dieser Struktur:
 *
 *   <p t="400" d="5320">        ← Untertitel-Block (t=Zeitstempel ms, d=Dauer ms)
 *     <s ac="0">Well,</s>       ← einzelne Wörter/Segmente
 *     <s t="240" ac="0"> I</s>  ← t = Offset zum <p>-Zeitstempel
 *   </p>
 *
 *   Wir hängen alle <s>-Wörter eines <p>-Blocks zusammen und
 *   trennen die Blöcke mit Zeilenumbrüchen.
 */
async function fetchTranscript(videoId) {

  // ── SCHRITT 1: Innertube API POST ──────────────────────────────────────
  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',        // Als Android YouTube-App ausgeben
          clientVersion: '20.10.38',    // Aktuelle App-Version
          androidSdkVersion: 30,        // Android 11 (API Level 30)
        }
      },
      videoId, // z.B. "dQw4w9WgXcQ"
    }),
  });

  if (!playerRes.ok) throw new Error(`Innertube: HTTP ${playerRes.status}`);

  // Die JSON-Antwort enthält alle Videodaten: Titel, Streams, Captions, Thumbnails...
  const playerData = await playerRes.json();

  // Caption-Tracks aus der tief verschachtelten Antwort-Struktur extrahieren.
  // Jeder Track hat: { languageCode: "en", baseUrl: "https://...", name: {...} }
  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error('Kein Transcript verfügbar');

  // Sprachpriorität: Deutsch → Englisch → erste verfügbare Sprache
  const track =
    tracks.find(t => t.languageCode === 'de') ||
    tracks.find(t => t.languageCode === 'en') ||
    tracks[0];

  // ── SCHRITT 2: Caption XML abrufen ────────────────────────────────────
  // baseUrl ist eine signierte URL direkt zum timedtext-Server von YouTube.
  const xmlRes = await fetch(track.baseUrl);
  if (!xmlRes.ok) throw new Error(`Caption-Fetch: HTTP ${xmlRes.status}`);
  const xml = await xmlRes.text();
  if (!xml?.trim()) throw new Error('Leere Caption-Antwort');

  // ── SCHRITT 3: XML parsen ──────────────────────────────────────────────

  // YouTube kodiert Sonderzeichen als HTML-Entities im XML.
  // Diese Funktion dekodiert sie zurück in lesbare Zeichen.
  // Beispiel: "&amp;" → "&", "&#39;" → "'"
  function decodeEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  // Primär: "timedtext format 3" — <p> Blöcke mit <s> Wort-Segmenten.
  // matchAll() findet alle <p>...</p> Blöcke im XML-String.
  const pMatches = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  let lines = pMatches.map(m => {
    // Innerhalb jedes <p>-Blocks alle <s>-Wörter zusammenfügen
    const sMatches = [...m[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)];
    return decodeEntities(sMatches.map(s => s[1]).join('').trim());
  }).filter(l => l); // Leere Zeilen entfernen

  // Fallback: älteres <text>-Format (manuelle Untertitel haben manchmal dieses Format)
  // <text start="0.5" dur="3.7">Hello world</text>
  if (!lines.length) {
    const tMatches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)];
    lines = tMatches.map(m => decodeEntities(m[1].trim())).filter(l => l);
  }

  const text = lines.join('\n');
  if (!text) throw new Error('Transcript ist leer');
  return text;
}

/**
 * Wird aufgerufen wenn der "Transcript"-Button auf der YouTube-Seite geklickt wird.
 * Lädt das Transcript und kopiert es direkt in die Zwischenablage.
 *
 * navigator.clipboard.writeText() braucht eine User-Geste (hier: der Button-Click).
 */
async function copyTranscript() {
  const videoId = getVideoId();
  if (!videoId) { showToast('Keine YouTube-Video-URL', true); return; }

  showToast('Transcript wird geladen…');
  try {
    const text = await fetchTranscript(videoId);

    // navigator.clipboard.writeText() kann nach einem await den User-Gesture-Kontext verlieren.
    // Deshalb: erst moderne Clipboard API versuchen, bei Fehler execCommand als Fallback.
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      el.focus();
      el.select();
      copied = document.execCommand('copy');
      document.body.removeChild(el);
    }

    showToast(copied ? 'Transcript kopiert! ✓' : 'Kopieren fehlgeschlagen', !copied);
  } catch (err) {
    showToast(err.message || 'Transcript-Fehler', true);
  }
}


// ============================================================
// KOMMUNIKATION MIT DEM POPUP
// ============================================================

/**
 * Hört auf Nachrichten vom Extension-Popup (popup.js).
 *
 * Das Popup läuft in einem eigenen isolierten Kontext und kann nicht direkt
 * auf das DOM der YouTube-Seite zugreifen. Deshalb schickt popup.js eine
 * Nachricht an diesen Content Script, der dann die Arbeit erledigt.
 *
 * Kommunikationsablauf:
 *   Nutzer klickt "Transcript" im Popup
 *     → popup.js: chrome.tabs.sendMessage(tabId, { type: 'METUBE_GET_TRANSCRIPT' })
 *     → Dieser Listener empfängt die Nachricht
 *     → fetchTranscript() wird ausgeführt
 *     → sendResponse({ text }) schickt das Ergebnis zurück ans Popup
 *     → popup.js kopiert den Text in die Zwischenablage
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'METUBE_GET_TRANSCRIPT') {
    const videoId = getVideoId();
    if (!videoId) { sendResponse({ error: 'Keine YouTube-Video-URL' }); return true; }

    fetchTranscript(videoId)
      .then(text => sendResponse({ text }))
      .catch(err => sendResponse({ error: err.message }));

    // "return true" ist ZWINGEND bei asynchronem sendResponse!
    // Ohne das schließt Chrome den Nachrichten-Kanal bevor die Antwort ankommt.
    return true;
  }
});


// ============================================================
// BUTTONS IN DIE YOUTUBE-SEITE EINBAUEN
// ============================================================

/**
 * Fügt die drei MeTube-Buttons direkt in die YouTube-Seite ein.
 * Die Buttons erscheinen unter dem Video, nach dem Like/Dislike-Bereich.
 *
 * Diese Funktion wird mehrfach aufgerufen (vom MutationObserver unten),
 * aber die Checks am Anfang verhindern doppeltes Einfügen.
 */
function injectButtons() {
  // Abbruch wenn keine Video-ID in der URL (z.B. YouTube-Startseite)
  if (!getVideoId()) return;

  // Abbruch wenn die Button-Leiste schon existiert
  if (document.getElementById('metube-bar')) return;

  // Ankerelement finden — der Like/Dislike-Bereich unter dem Video.
  // YouTube rendert diesen Bereich asynchron nach dem Seitenladen,
  // deshalb wird tryInject() mehrmals aufgerufen bis der Selector greift.
  const anchor = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer.ytd-video-primary-info-renderer');
  if (!anchor) return;

  // CSS einmalig in den <head> einfügen (nur wenn noch nicht vorhanden)
  if (!document.getElementById('metube-styles')) {
    const style = document.createElement('style');
    style.id = 'metube-styles';
    style.textContent = `
      /* Container für die drei Buttons */
      #metube-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        padding: 8px 0;
        border-top: 1px solid rgba(255,255,255,0.1);
      }
      /* Basis-Stil für alle Buttons */
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
      /* Lila "Video herunterladen" Button */
      .metube-btn-video { background: #4f46e5; color: #fff; }
      .metube-btn-video:hover { background: #4338ca; }
      /* Halbtransparenter "Audio" Button */
      .metube-btn-audio { background: rgba(255,255,255,0.1); color: #e8e8e8; }
      .metube-btn-audio:hover { background: rgba(255,255,255,0.18); }
      /* Dezenter "Transcript" Button */
      .metube-btn-transcript { background: rgba(255,255,255,0.08); color: #aaa; }
      .metube-btn-transcript:hover { background: rgba(255,255,255,0.15); color: #e8e8e8; }
    `;
    document.head.appendChild(style);
  }

  // Button-Leiste erstellen
  const bar = document.createElement('div');
  bar.id = 'metube-bar';

  // SVG-Icons inline (kein externes File nötig, funktioniert auch ohne Server)
  const iconDownload = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  const iconAudio    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  const iconCopy     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  // Drei Buttons erstellen, stylen und in die Leiste hängen
  const videoBtn = createButton('Video herunterladen', iconDownload, () => sendToMetube('video'));
  videoBtn.classList.add('metube-btn-video');

  const audioBtn = createButton('Audio', iconAudio, () => sendToMetube('audio'));
  audioBtn.classList.add('metube-btn-audio');

  const transcriptBtn = createButton('Transcript', iconCopy, copyTranscript);
  transcriptBtn.classList.add('metube-btn-transcript');

  bar.appendChild(videoBtn);
  bar.appendChild(audioBtn);
  bar.appendChild(transcriptBtn);

  // Leiste direkt nach dem Ankerelement in den DOM einfügen
  anchor.parentNode.insertBefore(bar, anchor.nextSibling);
  injected = true;
}


// ============================================================
// YOUTUBE SPA-NAVIGATION ABFANGEN
// ============================================================

/**
 * YouTube ist eine Single-Page Application (SPA).
 * Beim Klick auf ein anderes Video lädt die Seite NICHT neu —
 * YouTube tauscht nur den Inhalt per JavaScript aus.
 *
 * Das Problem: Content Scripts werden nur einmal beim Tab-Laden injiziert.
 * Wenn der Nutzer ein anderes Video öffnet, müssen wir das selbst erkennen
 * und die Buttons neu einfügen.
 *
 * Lösung: MutationObserver überwacht alle DOM-Änderungen und prüft
 * bei jeder Änderung ob sich die URL geändert hat.
 */
let lastUrl = location.href;

/**
 * Versucht Buttons alle 500ms einzufügen — bis zu 20 Versuche (10 Sekunden).
 * Nötig weil YouTube den Anker-Knoten asynchron rendert.
 */
function scheduleInject() {
  if (!location.href.includes('youtube.com/watch')) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (injected || attempts > 20) { clearInterval(timer); return; }
    injectButtons();
  }, 500);
}

function onNavigate() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  injected = false;
  scheduleInject();
}

// YouTube feuert diesen Event selbst bei jedem Video-Wechsel (SPA-Navigation).
// Kein MutationObserver nötig — deutlich weniger CPU-Last.
window.addEventListener('yt-navigate-finish', onNavigate);

// Backup-Polling alle 2s, falls yt-navigate-finish mal nicht feuert.
setInterval(onNavigate, 2000);

// Erste Ausführung beim Tab-Laden
scheduleInject();
