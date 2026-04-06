const DEFAULT_METUBE_URL = 'http://localhost:8081';

let downloadType = 'video';

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
// Delegiert an den Content Script des aktiven Tabs, da nur dieser
// Zugriff auf ytInitialPlayerResponse hat.
async function copyTranscript() {
  const originalContent = document.getElementById('transcriptBtn').innerHTML;
  setLoading('transcriptBtn', true, originalContent);
  showStatus('Transcript wird geladen…', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'METUBE_GET_TRANSCRIPT' });

    if (response?.error) {
      showStatus(response.error, 'error');
    } else if (response?.text) {
      await navigator.clipboard.writeText(response.text);
      showStatus('Transcript kopiert!', 'success');
    } else {
      showStatus('Kein Transcript verfügbar.', 'error');
    }
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
