# Design: Transcript Metadata Header

**Datum:** 2026-05-26
**Status:** Approved

## Ziel

Beim Kopieren eines YouTube-Transcripts soll ein Markdown-Header mit Video-Metadaten vor den Transcript-Text gestellt werden: Titel, Kanal, Datum, Beschreibung (max. 300 Zeichen).

## Kontext

Die Chrome Extension ruft bereits die YouTube Innertube API auf (`/youtubei/v1/player`) um Caption-Tracks zu laden. Die API-Antwort enthält auch alle Video-Metadaten — diese werden aktuell nicht genutzt.

Betroffene Dateien:
- `chrome-extension/content.js` — `fetchTranscript()`, `copyTranscript()`
- `chrome-extension/popup.js` — `copyTranscript()` (sendMessage-Pfad + executeScript-Fallback)

## Architektur

### 1. `fetchTranscript(videoId)` — Rückgabetyp ändern

**Vorher:** gibt `string` zurück (reiner Transcript-Text)

**Nachher:** gibt `{ metadata, text }` zurück

```js
{
  metadata: {
    title: string,       // playerData.videoDetails.title
    author: string,      // playerData.videoDetails.author
    date: string,        // playerData.microformat.playerMicroformatRenderer.publishDate (YYYY-MM-DD)
    description: string  // playerData.videoDetails.shortDescription, auf 300 Zeichen gekürzt
  },
  text: string           // Transcript-Zeilen, mit '\n' verbunden
}
```

Fehlende Felder werden auf leeren String gesetzt, damit der Rest nicht bricht.

### 2. `buildClipboardText(metadata, text)` — neue Hilfsfunktion in content.js

Baut den fertigen Clipboard-String aus Metadata + Transcript:

```
# {title}

**Kanal:** {author}
**Datum:** {date}
**Beschreibung:** {description}

---

{text}
```

### 3. Aufruforte anpassen

**content.js `copyTranscript()` (Zeile ~259):**
- `fetchTranscript()` gibt jetzt `{ metadata, text }` zurück
- `buildClipboardText(metadata, text)` aufrufen, Ergebnis in Clipboard schreiben

**content.js `onMessage`-Handler (Zeile ~304):**
- `sendResponse({ text })` wird zu `sendResponse({ metadata, text })`

**popup.js `copyTranscript()` — sendMessage-Pfad (Zeile ~110):**
- content.js schickt nun `{ metadata, text }` als Response zurück
- popup.js ruft `buildClipboardText()` auf — diese Funktion muss also auch in popup.js definiert sein (dupliziert, da popup.js keinen Import-Mechanismus hat)

**popup.js `copyTranscript()` — executeScript-Fallback (Zeile ~116):**
- Die inline-Funktion im `func`-Parameter ebenfalls anpassen: gibt `{ metadata, text }` zurück
- popup.js baut daraus den Clipboard-String

### 4. Beschreibungs-Kürzung

```js
const raw = playerData.videoDetails.shortDescription ?? '';
const description = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
```

## Ausgabe-Format

```markdown
# How to Build a Rocket

**Kanal:** NASA
**Datum:** 2024-03-15
**Beschreibung:** In diesem Video zeigen wir wie man eine Rakete baut. Das wichtigste ist…

---

Welcome to today's video.
Today we'll cover the basics of rocket propulsion.
```

## Fehlerbehandlung

- Fehlen einzelne Metadaten-Felder in der API-Antwort → leerer String, kein Absturz
- Fehlt `publishDate` komplett → Zeile `**Datum:**` zeigt leeren Wert (akzeptabel)

## Nicht im Scope

- Konfigurierbarkeit des Header-Formats
- Vollständige Beschreibung
- Zeitstempel im Transcript
