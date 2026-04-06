document.addEventListener('DOMContentLoaded', async () => {
  const { metubeUrl = 'http://localhost:8081' } = await chrome.storage.sync.get('metubeUrl');
  document.getElementById('metubeUrl').value = metubeUrl;

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const url = document.getElementById('metubeUrl').value.trim().replace(/\/$/, '');
    await chrome.storage.sync.set({ metubeUrl: url });
    const status = document.getElementById('status');
    status.className = 'status success';
    setTimeout(() => { status.className = 'status'; }, 2000);
  });
});
