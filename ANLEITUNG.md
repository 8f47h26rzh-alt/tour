# Touren-App – Anleitung

## Was die App macht

1. **📷 Foto machen**: Die Kamera öffnet sich. Ihr fotografiert alle Seiten der Tourenübersicht nacheinander.
2. **✅ Fertig**: Das Handy liest die Fotos. Ein Balken zeigt dabei den Fortschritt. Ihr müsst ungefähr 20–60 Sekunden warten.
3. Die App sucht nur die Adressen heraus (Straße, PLZ, Ort) und sortiert sie nach „Pos.“.
   Telefonnummern, Lieferzeiten und Hinweise werden ignoriert.
4. **▶️ Route starten**: Google Maps öffnet sich mit den ersten 10 Kunden in der richtigen Reihenfolge.
   Start ist immer der aktuelle Standort.
5. Später die App wieder öffnen, dann **▶️ Nächste 10 Kunden** drücken. Das geht so lange, bis alle erledigt sind.
6. **🔁 Letzte Route nochmal öffnen**: Falls Google Maps aus Versehen geschlossen wurde.
7. **🗑️ Neue Tour**: Löscht alles für den nächsten Tag.

Die Fotos bleiben auf dem Handy. Nur die Adressen gehen an Google Maps.

---

## Was in den Dateien steht

| Datei | Wofür |
|---|---|
| `index.html` | Die Seite mit den Knöpfen und dem Aussehen |
| `app.js` | Das „Gehirn“: Kamera, Texterkennung, Adressen suchen, Google Maps öffnen |
| `manifest.json` | Name und Symbol für den Home-Bildschirm |
| `sw.js` | Damit die App wie eine echte App vom Home-Bildschirm startet |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Das App-Symbol (blaue Kartennadel) |

---

## Kostenlos online stellen mit GitHub Pages

Das musst du nur **ein einziges Mal** machen.

### Schritt 1: GitHub-Konto anlegen
1. Gehe auf **https://github.com/signup**.
2. Gib E-Mail, Passwort und einen Benutzernamen ein, z. B. `lkw-tour`.
   Merk dir den Benutzernamen. Er kommt später in der Internetadresse vor.
3. Bestätige deine E-Mail-Adresse.

### Schritt 2: Neuen Speicherplatz („Repository“) anlegen
1. Oben rechts auf das **+** klicken und dann **New repository** wählen.
2. Bei **Repository name** gibst du `tour` ein.
3. Wähle **Public** (öffentlich). Das ist nötig, damit Pages kostenlos ist.
   Keine Sorge: Öffentlich ist nur der Programmcode, keine Kundendaten.
4. Unten auf **Create repository** klicken.

### Schritt 3: Dateien hochladen
1. Auf der neuen Seite klickst du auf den Link **uploading an existing file**.
2. Öffne auf deinem Mac im Finder den Ordner `touren-app`.
3. Markiere **alle Dateien darin** (Cmd + A) und ziehe sie in das Browserfenster.
   Wichtig: Ziehe die Dateien hinein, nicht den Ordner selbst.
4. Unten auf **Commit changes** klicken.

### Schritt 4: GitHub Pages einschalten
1. Im Repository oben auf **Settings** klicken.
2. Links im Menü auf **Pages** klicken.
3. Bei **Source** wählst du **Deploy from a branch**.
4. Bei **Branch** wählst du **main** und daneben **/ (root)**. Dann auf **Save** klicken.
5. Warte 1–2 Minuten und lade die Seite neu. Oben steht dann:
   **„Your site is live at https://DEIN-NAME.github.io/tour/“**

Das ist die Adresse deiner App.

### Schritt 5: Auf das Handy holen

**iPhone (Safari benutzen, nicht Chrome!):**
1. Die Adresse in **Safari** öffnen.
2. Unten auf das Teilen-Symbol tippen (Viereck mit Pfeil nach oben).
3. **Zum Home-Bildschirm** wählen und dann auf **Hinzufügen** tippen.

**Android (Chrome):**
1. Die Adresse in **Chrome** öffnen.
2. Oben rechts auf die drei Punkte **⋮** tippen.
3. **Zum Startbildschirm hinzufügen** oder **App installieren** wählen.

Wichtig: Auf dem Handy muss die **Google-Maps-App** installiert sein.

---

## Später etwas ändern

1. Datei auf dem Mac ändern (oder mich bitten, sie zu ändern).
2. Auf GitHub ins Repository gehen und auf **Add file** und dann **Upload files** klicken.
3. Die geänderte Datei hineinziehen und auf **Commit changes** klicken.
4. Nach 1–2 Minuten ist die neue Version online. Am Handy die App einmal ganz schließen und neu öffnen.

---

## Tipps für gute Fotos

- **Jede Seite einzeln fotografieren**, nicht alle Seiten auf ein Foto. Sonst ist die Schrift zu klein.
- Das Blatt **glatt streichen**. Ein Knick quer durch die Zeilen bringt die Erkennung durcheinander.
- Blatt **flach** hinlegen und von **gerade oben** fotografieren.
- **Hell**, aber ohne Blitz-Spiegelung.
- Das ganze Blatt aufs Foto, aber möglichst bildfüllend.
- Lieber eine Seite nochmal fotografieren, wenn sie verwackelt ist.

## Wenn etwas nicht stimmt

- **Ein Kunde fehlt in der Liste**: Diese Zeile war auf dem Foto nicht gut lesbar. Fotografiere die Seite nochmal schärfer, dann **Neue Tour** drücken und neu anfangen.
- **⚠️ „… Stopps – X fehlen“**: Die App hat unten auf der Liste „Anzahl Stopps“ gelesen, aber weniger Kunden gefunden. Neue Tour starten und die Seiten schärfer fotografieren.
- **⚠️ „Straße nicht lesbar“**: Google Maps fährt für diesen Kunden nur in den Ort.
- **„?“ statt Pos.-Nummer**: Die Nummer war unleserlich. Der Kunde bleibt an seinem Platz in der Liste.
- **Google Maps zeigt weniger als 10 Stopps**: Dann hat sich Google Maps im Browser geöffnet statt in der App. Prüfe, ob die Google-Maps-App installiert ist.
