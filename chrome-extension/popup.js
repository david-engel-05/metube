const DEFAULT_METUBE_URL = 'http://localhost:8081';

let downloadType = 'video';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Aktuelle Tab-URL laden
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    document.getElementById('urlInput').value = tab.url;
  }

  // Transcript-Button nur auf YouTube anzeigen
  if (tab?.url && isYouTubeVideo(tab.url)) {
    document.getElementById('transcriptSection').classList.add('visible');
    document.getElementById('transcriptDivider').style.display = 'block';
  }

  // Einstellungen-Link
  document.getElementById('optionsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Toggle Video/Audio
  document.getElementById('btnVideo').addEventListener('click', () => setType('video'));
  document.getElementById('btnAudio').addEventListener('click', () => setType('audio'));

  // Download-Button
  document.getElementById('downloadBtn').addEventListener('click', sendDownload);

  // Transcript-Button
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
  const url = document.getElementById('urlInput').value.trim();
  const videoId = extractVideoId(url);

  if (!videoId) {
    showStatus('Keine gültige YouTube-URL.', 'error');
    return;
  }

  const originalContent = document.getElementById('transcriptBtn').innerHTML;
  setLoading('transcriptBtn', true, originalContent);
  showStatus('Transcript wird geladen…', 'info');

  try {
    // YouTube's interne timedtext API
    const apiUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=de&fmt=json3`;
    const apiUrlEn = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;

    let transcript = await fetchTranscript(apiUrl);

    // Fallback auf Englisch
    if (!transcript) {
      transcript = await fetchTranscript(apiUrlEn);
    }

    // Fallback: automatisch generiertes Transcript (asr)
    if (!transcript) {
      const asrUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=de&kind=asr&fmt=json3`;
      transcript = await fetchTranscript(asrUrl);
    }

    if (!transcript) {
      showStatus('Kein Transcript verfügbar für dieses Video.', 'error');
      return;
    }

    await navigator.clipboard.writeText(transcript);
    showStatus('Transcript kopiert!', 'success');
  } catch (err) {
    showStatus(`Fehler beim Laden: ${err.message}`, 'error');
  } finally {
    setLoading('transcriptBtn', false, originalContent);
  }
}

async function fetchTranscript(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.events || data.events.length === 0) return null;

    const lines = data.events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join('').trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return null;
    return lines.join('\n');
  } catch {
    return null;
  }
}

function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
  return match ? match[1] : null;
}
