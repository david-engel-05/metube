# Transcript Metadata Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepend a Markdown header with video title, channel, date, and description (max 300 chars) to the copied transcript.

**Architecture:** `fetchTranscript()` in content.js is extended to return `{ metadata, text }` instead of a plain string. Metadata is extracted from the already-fetched Innertube API response — no extra network request. A shared `buildClipboardText()` helper assembles the final Markdown string. Both call sites (content.js `copyTranscript` + popup.js `copyTranscript`) are updated to use the new return type.

**Tech Stack:** Vanilla JS (Chrome Extension MV3, no bundler, no imports between files)

---

## File Map

| File | Change |
|---|---|
| `chrome-extension/content.js` | Add `buildClipboardText()`, change `fetchTranscript()` return type, update `copyTranscript()`, update `onMessage` handler |
| `chrome-extension/popup.js` | Add `buildClipboardText()` (duplicate — no module system), update sendMessage path, update executeScript fallback |

---

### Task 1: Add `buildClipboardText()` to content.js

**Files:**
- Modify: `chrome-extension/content.js` (after the `showToast` function, before `sendToMetube`)

- [ ] **Step 1: Insert the helper function**

Open `chrome-extension/content.js`. After the closing `}` of `showToast()` (around line 88) and before the `// DOWNLOAD-FUNKTION` comment block, insert:

```js
function buildClipboardText(metadata, text) {
  const parts = [];
  if (metadata.title) parts.push(`# ${metadata.title}\n`);
  const meta = [];
  if (metadata.author) meta.push(`**Kanal:** ${metadata.author}`);
  if (metadata.date) meta.push(`**Datum:** ${metadata.date}`);
  if (metadata.description) meta.push(`**Beschreibung:** ${metadata.description}`);
  if (meta.length) parts.push(meta.join('\n'));
  parts.push('\n---\n');
  parts.push(text);
  return parts.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add buildClipboardText helper to content.js"
```

---

### Task 2: Update `fetchTranscript()` to return `{ metadata, text }`

**Files:**
- Modify: `chrome-extension/content.js` — `fetchTranscript()` function (lines ~170–245)

- [ ] **Step 1: Extract metadata from `playerData` after the Innertube call**

In `fetchTranscript()`, find the line:
```js
const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
```

Directly **before** that line, insert:
```js
const rawDesc = playerData?.videoDetails?.shortDescription ?? '';
const metadata = {
  title: playerData?.videoDetails?.title ?? '',
  author: playerData?.videoDetails?.author ?? '',
  date: playerData?.microformat?.playerMicroformatRenderer?.publishDate ?? '',
  description: rawDesc.length > 300 ? rawDesc.slice(0, 300) + '…' : rawDesc,
};
```

- [ ] **Step 2: Change the return statement**

Find the current return at the end of `fetchTranscript()`:
```js
const text = lines.join('\n');
if (!text) throw new Error('Transcript ist leer');
return text;
```

Replace it with:
```js
const text = lines.join('\n');
if (!text) throw new Error('Transcript ist leer');
return { metadata, text };
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: fetchTranscript returns { metadata, text }"
```

---

### Task 3: Update `copyTranscript()` in content.js

**Files:**
- Modify: `chrome-extension/content.js` — `copyTranscript()` function (lines ~253–282)

- [ ] **Step 1: Destructure the new return value and use `buildClipboardText()`**

Find in `copyTranscript()`:
```js
const text = await fetchTranscript(videoId);
```

Replace with:
```js
const { metadata, text } = await fetchTranscript(videoId);
const clipText = buildClipboardText(metadata, text);
```

- [ ] **Step 2: Use `clipText` in the clipboard write calls**

Find:
```js
await navigator.clipboard.writeText(text);
```
Replace with:
```js
await navigator.clipboard.writeText(clipText);
```

Find (in the `execCommand` fallback):
```js
el.value = text;
```
Replace with:
```js
el.value = clipText;
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: copyTranscript uses metadata header in content.js"
```

---

### Task 4: Update `onMessage` handler in content.js

**Files:**
- Modify: `chrome-extension/content.js` — `onMessage` handler (lines ~304–316)

- [ ] **Step 1: Forward metadata in the response**

Find:
```js
fetchTranscript(videoId)
  .then(text => sendResponse({ text }))
  .catch(err => sendResponse({ error: err.message }));
```

Replace with:
```js
fetchTranscript(videoId)
  .then(({ metadata, text }) => sendResponse({ metadata, text }))
  .catch(err => sendResponse({ error: err.message }));
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: onMessage sends { metadata, text } to popup"
```

---

### Task 5: Update popup.js — add `buildClipboardText()` and sendMessage path

**Files:**
- Modify: `chrome-extension/popup.js`

- [ ] **Step 1: Add `buildClipboardText()` to popup.js**

Since there are no ES modules in this extension, the function must be duplicated. Insert at the **top of the file**, after the `DEFAULT_METUBE_URL` and `downloadType` declarations (after line 3):

```js
function buildClipboardText(metadata, text) {
  const parts = [];
  if (metadata.title) parts.push(`# ${metadata.title}\n`);
  const meta = [];
  if (metadata.author) meta.push(`**Kanal:** ${metadata.author}`);
  if (metadata.date) meta.push(`**Datum:** ${metadata.date}`);
  if (metadata.description) meta.push(`**Beschreibung:** ${metadata.description}`);
  if (meta.length) parts.push(meta.join('\n'));
  parts.push('\n---\n');
  parts.push(text);
  return parts.join('\n');
}
```

- [ ] **Step 2: Update the sendMessage path in `copyTranscript()`**

Find in popup.js `copyTranscript()`:
```js
const response = await chrome.tabs.sendMessage(tab.id, { type: 'METUBE_GET_TRANSCRIPT' });
if (response?.error) throw new Error(response.error);
text = response?.text;
```

Replace with:
```js
const response = await chrome.tabs.sendMessage(tab.id, { type: 'METUBE_GET_TRANSCRIPT' });
if (response?.error) throw new Error(response.error);
text = buildClipboardText(response.metadata ?? {}, response.text ?? '');
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/popup.js
git commit -m "feat: popup.js sendMessage path uses metadata header"
```

---

### Task 6: Update popup.js — executeScript fallback

**Files:**
- Modify: `chrome-extension/popup.js` — the `func` passed to `chrome.scripting.executeScript` (lines ~116–151)

The inline function currently returns a plain string. It needs to return `{ metadata, text }`. Replace the entire `executeScript` call:

- [ ] **Step 1: Replace the executeScript `func` body**

Find the entire block:
```js
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
    const result = lines.join('\n');
    if (!result) throw new Error('Transcript ist leer');
    return result;
  },
  args: [extractVideoId(tab.url)],
});
text = results?.[0]?.result;
```

Replace with:
```js
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
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/popup.js
git commit -m "feat: popup.js executeScript fallback uses metadata header"
```

---

### Task 7: Manual testing

No test framework is present in this project. Test manually in Chrome.

- [ ] **Step 1: Reload the extension**

1. Öffne `chrome://extensions`
2. Klicke "Neu laden" bei MeTube Downloader

- [ ] **Step 2: Test über den in-page Button (content.js Pfad)**

1. Öffne ein YouTube-Video, z.B. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
2. Klicke den "Transcript"-Button unter dem Video
3. Füge den Clipboard-Inhalt in einen Texteditor ein
4. Erwartetes Ergebnis:
```
# Never Gonna Give You Up

**Kanal:** Rick Astley
**Datum:** 2009-10-25
**Beschreibung:** The official video for "Never Gonna Give You Up" by Rick Astley…

---

We're no strangers to love
...
```

- [ ] **Step 3: Test über das Popup (popup.js Pfad)**

1. Klicke das Extension-Icon in der Toolbar
2. Klicke "Transcript kopieren" im Popup
3. Füge den Clipboard-Inhalt in einen Texteditor ein
4. Gleiches Ergebnis wie Step 2 erwartet

- [ ] **Step 4: Test mit Video ohne Beschreibung / ohne Datum**

Öffne ein Video und prüfe: fehlt ein Metadaten-Feld in der API-Antwort, darf kein Crash auftreten — das Feld wird einfach weggelassen.

- [ ] **Step 5: Final commit wenn alles funktioniert**

```bash
git add chrome-extension/content.js chrome-extension/popup.js
git commit -m "feat: transcript clipboard includes video metadata header"
```
