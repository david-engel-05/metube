const DEFAULT_METUBE_URL = 'http://localhost:8081';

// Kontextmenü beim Start der Extension erstellen
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'metube-download-video',
    title: 'Mit MeTube herunterladen (Video)',
    contexts: ['link', 'page'],
  });

  chrome.contextMenus.create({
    id: 'metube-download-audio',
    title: 'Mit MeTube herunterladen (Audio)',
    contexts: ['link', 'page'],
  });
});

// Klick auf Kontextmenü-Eintrag
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  if (!url) return;

  const downloadType = info.menuItemId === 'metube-download-audio' ? 'audio' : 'video';
  const { metubeUrl = DEFAULT_METUBE_URL } = await chrome.storage.sync.get('metubeUrl');

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

    const data = await response.json();

    if (data.status === 'ok' || data.added) {
      showNotification('Download gestartet', `${downloadType === 'audio' ? 'Audio' : 'Video'} wurde zur Warteschlange hinzugefügt.`);
    } else {
      showNotification('Fehler', data.msg || 'Download konnte nicht gestartet werden.');
    }
  } catch (err) {
    showNotification('Fehler', `MeTube nicht erreichbar: ${metubeUrl}`);
  }
});

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message,
  });
}
