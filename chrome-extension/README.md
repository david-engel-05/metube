# MeTube Chrome Extension

Eine Chrome Extension für [MeTube](https://github.com/alexta69/metube) — download Videos und Audio direkt von YouTube, ohne die Web-UI öffnen zu müssen.

## Features

- **Video & Audio herunterladen** — Ein Klick sendet das Video an deine MeTube-Instanz
- **Buttons direkt auf YouTube** — erscheinen automatisch unter jedem Video
- **Transcript kopieren** — YouTube-Transcript in die Zwischenablage (via Innertube API)
- **Rechtsklick-Menü** — auf jeden Link rechtsklicken → "Mit MeTube herunterladen"
- **Einstellungsseite** — MeTube-URL konfigurieren

## Installation

1. Dieses Repo klonen oder als ZIP herunterladen
2. Chrome öffnen → `chrome://extensions`
3. "Entwicklermodus" oben rechts aktivieren
4. "Entpackte Erweiterung laden" → `chrome-extension/` Ordner auswählen

## Einstellungen

Die MeTube-URL kann in den Einstellungen der Extension angepasst werden.
Standard: `http://localhost:8081`

---

## Ideen für zukünftige Features

### Download-Optionen
- [ ] **Qualitätswahl im Popup** — Dropdown mit 1080p, 720p, 480p, Audio-only statt immer "best"
- [ ] **Format wählen** — mp4, webm, mp3, m4a direkt auswählbar
- [ ] **Playlist erkennen** — automatisch erkennen ob es eine Playlist-URL ist und fragen ob nur das Video oder die ganze Playlist heruntergeladen werden soll
- [ ] **Download-Fortschritt anzeigen** — via MeTube WebSocket live-Status im Popup anzeigen (lädt, fertig, Fehler)
- [ ] **Download-Verlauf im Popup** — letzte Downloads direkt in der Extension anzeigen ohne MeTube-UI öffnen zu müssen

### Transcript
- [ ] **Sprachauswahl** — Dropdown mit allen verfügbaren Sprachen statt automatisch DE/EN
- [ ] **Transcript mit Zeitstempeln** — Option um Timestamps mitzukopieren (z.B. `[0:42] Hello world`)
- [ ] **Transcript als .txt herunterladen** — direkt als Datei speichern statt in Zwischenablage
- [ ] **Transcript zusammenfassen** — via lokaler KI (Ollama) oder API das Transcript zusammenfassen
- [ ] **Transcript übersetzen** — direkte Integration von DeepL oder LibreTranslate

### YouTube-Integration
- [ ] **Unterstützung für Shorts** — `youtube.com/shorts/ID` erkennen und Buttons einbauen
- [ ] **Unterstützung für Playlists** — auf `youtube.com/playlist?list=...` Seiten einen "Ganze Playlist herunterladen" Button einbauen
- [ ] **Thumbnail kopieren/herunterladen** — Button um das Video-Thumbnail zu speichern
- [ ] **Video-Infos anzeigen** — Dauer, Auflösung, Kanal direkt im Popup anzeigen

### Andere Seiten
- [ ] **Mehr Seiten unterstützen** — Buttons auch auf Vimeo, SoundCloud, Twitter/X einbauen (yt-dlp unterstützt diese alle)
- [ ] **Automatische Erkennung** — auf jeder Seite prüfen ob yt-dlp die URL unterstützt und den Button anzeigen

### UX
- [ ] **Keyboard Shortcut** — z.B. `Alt+D` um das aktuelle Video direkt herunterzuladen ohne Popup öffnen zu müssen
- [ ] **Badge-Counter** — Anzahl laufender Downloads als Badge-Zahl auf dem Extension-Icon
- [ ] **Dark/Light Mode** — Popup-Design passt sich dem System-Theme an
- [ ] **Mehrere MeTube-Instanzen** — z.B. Home-Server und Büro-Server zwischen denen man wechseln kann

### Technisches
- [ ] **Offline-Erkennung** — MeTube-Verbindung beim Öffnen des Popups prüfen und Status anzeigen
- [ ] **Authentifizierung** — Basic Auth / API-Key Support für passwortgeschützte MeTube-Instanzen
- [ ] **Chrome Web Store veröffentlichen** — damit andere die Extension ohne Developer-Mode installieren können
