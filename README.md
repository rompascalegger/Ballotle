# Ballotle – Wann hörst du auf?

Tägliches Push-your-Luck-Spiel mit einer Lotterie-Urne (Konzept Nº 20, dicele.io).
Reines HTML/CSS/JS ohne Build, Spielstand im `localStorage`, läuft auf GitHub Pages.

Lokal starten: `python -m http.server 8765` → http://localhost:8765
Testdatum (eigener Spielstand, zählt nicht): `?date=2026-12-04`

## Dateien
- `js/logic.js` – Regeln, Seed-RNG (mulberry32), exakter Erwartungswert, Mathe-Linie, Tagesmodifikatoren
- `js/urn.js` – Glasurne als Canvas mit Kugelphysik, Skins/Urnen-Designs
- `js/audio.js` – Chiptune-Sounds per WebAudio (Trommelwirbel, Ansager, Herzschlag …)
- `js/fx.js` – Münzen, Konfetti, Scherben, Bildschirmwackeln
- `js/main.js` – Coreloop, Auswertung (Mathe-/Glücks-Linie, Pech vs. Fehler), Teilen, Abzeichen, Shop

## Balancing-Abweichung vom Konzept
Mit der Konzept-Mischung 14 Gold / 3 Silber / 2 Schwarz / 1 Regenbogen ist Weiterziehen laut
Erwartungswert fast immer richtig (Gold verdoppelt → St.-Petersburg-Effekt): Die Mathe-Linie
würde in ~90 % der Runden busten und wäre als Vergleich wertlos.
Deshalb: Grundmischung 7 Gold / 10 Silber / 2 Schwarz / 1 Regenbogen (+1 Sonderkugel statt Gold)
plus **Gier-Regel**: Jede goldene Kugel lässt 2 schwarze in die Urne fallen. Das Risiko startet
bei ~10 % und steigt sichtbar. Die Mathematikerin stoppt dann meist bei x4–x8, bustet ~55–60 %
(wie optimales „Pig“) und erzielt langfristig klar am meisten Chips.
Alles einstellbar in `CFG` und `MODIFIERS` oben in `js/logic.js` (`greed: 0` = Konzept-Regeln).
