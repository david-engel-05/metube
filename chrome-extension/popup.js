const DEFAULT_METUBE_URL = 'http://localhost:8081';

let downloadType = 'video';

function buildClipboardText(metadata, text) {
  const parts = [];
  if (metadata.title) parts.push(`# ${metadata.title}`);
  const meta = [];
  if (metadata.author) meta.push(`**Kanal:** ${metadata.author}`);
  if (metadata.date) meta.push(`**Datum:** ${metadata.date}`);
  if (metadata.description) meta.push(`**Beschreibung:** ${metadata.description}`);
  if (meta.length) parts.push(meta.join('\n'));
  parts.push('---');
  parts.push(text);
  return parts.join('\n');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    document.getElementById('urlInput').value = tab.url;
  }

  if (tab?.url && isYouTubeVideo(tab.url)) {
    document.getElementById('transcriptSection').classList.add('visible');
    document.getElementById('transcriptDivider').style.display = 'block';
  }

  document.getElementById('optionsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btnVideo').addEventListener('click', () => setType('video'));
  document.getElementById('btnAudio').addEventListener('click', () => setType('audio'));
  document.getElementById('downloadBtn').addEventListener('click', sendDownload);
  document.getElementById('transcriptBtn').addEventListener('click', copyTranscript);
});

function setType(type) {
  downloadType = type;
  document.getElementById('btnVideo').classList.toggle('active', type === 'video');
  document.getElementById('btnAudio').classList.toggle('active', type === 'audio');
}

function isYouTubeVideo(url) {
  return /youtube\.com\/watch\?.*v=/.test(url) || /youtu\.be\//.test(url);
}

function showStatus(message, type = 'info') {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status ${type}`;
}

function setLoading(btnId, loading, originalContent) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

// --- Download ---
async function sendDownload() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    showStatus('Bitte eine URL eingeben.', 'error');
    return;
  }

  const { metubeUrl = DEFAULT_METUBE_URL } = await chrome.storage.sync.get('metubeUrl');
  const originalContent = document.getElementById('downloadBtn').innerHTML;
  setLoading('downloadBtn', true, originalContent);

  try {
    const response = await fetch(`${metubeUrl}/add`, {
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

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.status === 'ok' || data.added) {
      showStatus('Download gestartet!', 'success');
    } else {
      showStatus(`Fehler: ${data.msg || 'Unbekannter Fehler'}`, 'error');
    }
  } catch (err) {
    if (err.message.includes('Failed to fetch')) {
      showStatus('MeTube nicht erreichbar. Läuft es unter ' + metubeUrl + '?', 'error');
    } else {
      showStatus(`Fehler: ${err.message}`, 'error');
    }
  } finally {
    setLoading('downloadBtn', false, originalContent);
  }
}

// --- Transcript ---
async function copyTranscript() {
  const originalContent = document.getElementById('transcriptBtn').innerHTML;
  setLoading('transcriptBtn', true, originalContent);
  showStatus('Transcript wird geladen…', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Erst sendMessage versuchen (content.js im Tab macht den Fetch mit korrekter Origin)
    let text = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'METUBE_GET_TRANSCRIPT' });
      if (response?.error) throw new Error(response.error);
      text = buildClipboardText(response.metadata ?? {}, response.text ?? '');
    } catch (msgErr) {
      // Content Script nicht bereit (Tab wurde nach Extension-Reload nicht neu geladen)
      // → Fallback: executeScript direkt im Tab ausführen
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (vid) => {
          const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 } },
              videoId: vid,
            }),
          });
          if (!playerRes.ok) throw new Error(`Innertube: HTTP ${playerRes.status}`);
          const playerData = await playerRes.json();
          const rawDesc = playerData?.videoDetails?.shortDescription ?? '';
          const metadata = {
            title: playerData?.videoDetails?.title ?? '',
            author: playerData?.videoDetails?.author ?? '',
            date: playerData?.microformat?.playerMicroformatRenderer?.publishDate ?? '',
            description: rawDesc.length > 300 ? rawDesc.slice(0, 300) + '…' : rawDesc,
          };
          const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (!tracks?.length) throw new Error('Kein Transcript verfügbar');
          const track = tracks.find(t => t.languageCode === 'de') || tracks.find(t => t.languageCode === 'en') || tracks[0];
          const xmlRes = await fetch(track.baseUrl);
          if (!xmlRes.ok) throw new Error(`Caption-Fetch: HTTP ${xmlRes.status}`);
          const xml = await xmlRes.text();
          if (!xml?.trim()) throw new Error('Leere Caption-Antwort');
          const dec = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
          const pMatches = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
          let lines = pMatches.map(m => {
            const sMatches = [...m[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)];
            return dec(sMatches.map(s => s[1]).join('').trim());
          }).filter(l => l);
          if (!lines.length) {
            lines = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => dec(m[1].trim())).filter(l => l);
          }
          const transcriptText = lines.join('\n');
          if (!transcriptText) throw new Error('Transcript ist leer');
          return { metadata, text: transcriptText };
        },
        args: [extractVideoId(tab.url)],
      });
      const fallbackResult = results?.[0]?.result;
      text = fallbackResult ? buildClipboardText(fallbackResult.metadata ?? {}, fallbackResult.text ?? '') : null;
    }

    if (!text) throw new Error('Kein Transcript erhalten');
    await navigator.clipboard.writeText(text);
    showStatus('Transcript kopiert! ✓', 'success');
  } catch (err) {
    showStatus(`Fehler: ${err.message}`, 'error');
  } finally {
    setLoading('transcriptBtn', false, originalContent);
  }
}

function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
  return match ? match[1] : null;
}
