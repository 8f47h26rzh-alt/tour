// Touren-App: Fotos der Tourenübersicht -> Adressen -> Google Maps
// Alles läuft im Handy-Browser. Es gibt keinen Server.

// Bei jeder Änderung um eins erhöhen (Verlauf steht in ANLEITUNG.md)
const VERSION = '1.6';

const PRO_ROUTE = 10;            // So viele Kunden schickt die App auf einmal an Google Maps
const SPEICHER_NAME = 'tour-v1'; // Unter diesem Namen merkt sich das Handy die Tour

// Datenschutz: Die Tour wird automatisch gelöscht ...
const STUNDE = 60 * 60 * 1000;
const LOESCHEN_NACH = 36 * STUNDE;        // ... spätestens 36 Stunden nach dem Fotografieren
                                          //     (die Liste wird oft schon am Vortag fotografiert)
const LOESCHEN_WENN_FERTIG = 6 * STUNDE;  // ... oder 6 Stunden nachdem die letzte Route geöffnet wurde

// Stammkunden-Gedächtnis (nur wenn eingeschaltet): Kundennummer -> geprüfte Adresse
const GEDAECHTNIS_NAME = 'stammkunden-v1';
const GEDAECHTNIS_TAGE = 90;              // Kunden, die so lange nicht vorkommen, werden vergessen

let fotos = [];        // Die Fotos, die gerade gemacht wurden: { datei, url, bewertung }
let worker = null;     // Die Texterkennung (wird erst beim ersten Mal geladen)
let fortschritt = () => {};
let plzListe = null;   // Postleitzahlen von Österreich mit allen Ortschaften (aus plz-at.json)
let kartenGruppe = null; // Welche 10er-Gruppe gerade auf der Karte zu sehen ist (null = Karte zu)

// Die gelesenen Fotos zum Prüfen. Sie bleiben nur im Arbeitsspeicher und werden nie gespeichert.
// { tourId, seiten: [{ url, breite, hoehe, zeilenHoehe }], fehlend: [{ seite, box }] }
let pruefung = null;

const $ = (id) => document.getElementById(id);


// ---------- Speichern und Laden ----------

function tourLaden() {
  try {
    return JSON.parse(localStorage.getItem(SPEICHER_NAME));
  } catch (e) {
    return null;
  }
}

// Wann wird die Tour automatisch gelöscht?
function loeschZeitpunkt(tour) {
  let zeit = tour.erstellt + LOESCHEN_NACH;
  if (tourFertig(tour) && tour.zuletztGeoeffnet) zeit = Math.min(zeit, tour.zuletztGeoeffnet + LOESCHEN_WENN_FERTIG);
  return zeit;
}

// Gespeicherte Tour laden, aber nur, wenn sie noch nicht abgelaufen ist
function aktuelleTour() {
  const tour = tourLaden();
  if (!tour || !tour.kunden || !tour.kunden.length) return null;
  if (!tour.erstellt) {
    // Tour aus einer älteren App-Version: ab jetzt mitzählen
    tour.erstellt = Date.now();
    tourSpeichern(tour);
  }
  if (Date.now() >= loeschZeitpunkt(tour)) {
    tourSpeichern(null);
    pruefungVerwerfen();
    return null;
  }
  return tour;
}

function tourSpeichern(tour) {
  try {
    if (tour) localStorage.setItem(SPEICHER_NAME, JSON.stringify(tour));
    else localStorage.removeItem(SPEICHER_NAME);
  } catch (e) {
    // Wenn das Handy nichts speichern lässt, läuft die App trotzdem weiter
  }
}

// Gehören die Fotos im Arbeitsspeicher zu dieser Tour?
function fotosPassen(tour) {
  return !!(pruefung && tour && pruefung.tourId === tour.erstellt);
}

function pruefungVerwerfen() {
  if (pruefung) pruefung.seiten.forEach((s) => URL.revokeObjectURL(s.url));
  pruefung = null;
}


// ---------- Stammkunden-Gedächtnis ----------

function gedaechtnisLaden() {
  let g = null;
  try {
    g = JSON.parse(localStorage.getItem(GEDAECHTNIS_NAME));
  } catch (e) { /* nichts gespeichert */ }
  if (!g || typeof g !== 'object') g = { an: false, kunden: {} };
  // Lange nicht benutzte Kunden vergessen
  const grenze = Date.now() - GEDAECHTNIS_TAGE * 24 * STUNDE;
  for (const nr of Object.keys(g.kunden)) if (g.kunden[nr].zuletzt < grenze) delete g.kunden[nr];
  return g;
}

function gedaechtnisSpeichern(g) {
  try {
    localStorage.setItem(GEDAECHTNIS_NAME, JSON.stringify(g));
  } catch (e) { /* Handy lässt nichts speichern */ }
}

// Geprüfte Kunden ins Gedächtnis schreiben (nur mit sicher gelesener 5-stelliger Kundennummer)
function merken(kunden) {
  const g = gedaechtnisLaden();
  if (!g.an) return;
  for (const k of kunden) {
    if (k.nr && /^\d{5}$/.test(k.nr) && !k.unsicher && !k.hinweis) {
      g.kunden[k.nr] = { adresse: k.adresse, zuletzt: Date.now() };
    }
  }
  gedaechtnisSpeichern(g);
  gedaechtnisAnzeigen();
}

// Adresse zu einer Kundennummer nachschlagen.
// "?1327" heißt: die erste Ziffer war unlesbar -> passt, wenn genau ein gemerkter Kunde so endet.
function nachschlagen(nr) {
  if (!nr) return null;
  const g = gedaechtnisLaden();
  if (!g.an) return null;
  let treffer = null;
  if (/^\d{5}$/.test(nr)) {
    treffer = g.kunden[nr] ? nr : null;
  } else {
    const passend = Object.keys(g.kunden).filter((n) => n.slice(1) === nr.slice(1));
    if (passend.length === 1) treffer = passend[0];
  }
  if (!treffer) return null;
  g.kunden[treffer].zuletzt = Date.now();
  gedaechtnisSpeichern(g);
  return { nr: treffer, adresse: g.kunden[treffer].adresse };
}

function gedaechtnisAnzeigen() {
  const g = gedaechtnisLaden();
  $('gedaechtnis-an').checked = g.an;
  const anzahl = Object.keys(g.kunden).length;
  $('knopf-gedaechtnis-loeschen').textContent = `Gedächtnis löschen (${anzahl} ${anzahl === 1 ? 'Kunde' : 'Kunden'})`;
  $('knopf-gedaechtnis-loeschen').disabled = anzahl === 0;
}

$('gedaechtnis-an').addEventListener('change', (e) => {
  const g = gedaechtnisLaden();
  g.an = e.target.checked;
  gedaechtnisSpeichern(g);
  gedaechtnisAnzeigen();
});

$('knopf-gedaechtnis-loeschen').addEventListener('click', () => {
  if (!confirm('Alle gemerkten Stammkunden löschen?')) return;
  const g = gedaechtnisLaden();
  g.kunden = {};
  gedaechtnisSpeichern(g);
  gedaechtnisAnzeigen();
});


// ---------- Route: welche Kunden kommen als Nächstes dran? ----------

// Die nächsten (höchstens 10) Kunden, die nicht übersprungen werden
function naechsteRoute(tour) {
  const nummern = [];
  for (let i = tour.naechste; i < tour.kunden.length && nummern.length < PRO_ROUTE; i++) {
    if (!tour.kunden[i].uebersprungen) nummern.push(i);
  }
  return nummern;
}

function tourFertig(tour) {
  return naechsteRoute(tour).length === 0;
}

function nochOffen(tour) {
  return tour.kunden.slice(tour.naechste).filter((k) => !k.uebersprungen).length;
}


// ---------- Bildschirme umschalten ----------

const BILDSCHIRME = ['seite-fotos', 'seite-lesen', 'seite-pruefen', 'seite-tour'];

function sichtbar(id) {
  return !$(id).classList.contains('versteckt');
}

function zeige(seite) {
  const wechsel = !sichtbar(seite);
  for (const id of BILDSCHIRME) $(id).classList.toggle('versteckt', id !== seite);
  if (wechsel) window.scrollTo(0, 0); // nur beim Wechsel nach oben springen, nicht nach jeder Änderung
}

function fehler(text) {
  $('fehler').textContent = text || '';
  $('fehler').classList.toggle('versteckt', !text);
}

// Nach einer Änderung den Bildschirm neu zeichnen, auf dem man gerade ist
function neuZeichnen() {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  if (sichtbar('seite-pruefen') && fotosPassen(tour)) pruefungAnzeigen();
  else tourAnzeigen(tour);
}

// Gelber Hinweis zu einem Kunden (oder nichts)
function warnText(k) {
  if (k.unsicher) return '⚠️ Straße nicht lesbar – antippen zum Ändern';
  if (k.hinweis) return '⚠️ ' + k.hinweis + ' – bitte prüfen';
  return '';
}

function tourAnzeigen(tour) {
  const kunden = tour.kunden;
  const route = naechsteRoute(tour);
  const fertig = route.length === 0;

  const knopf = $('knopf-naechste');
  knopf.classList.toggle('versteckt', fertig);
  if (!fertig) {
    const erste = kunden[route[0]].pos;
    const letzte = kunden[route[route.length - 1]].pos;
    const bereich = erste !== null && letzte !== null ? ` (Pos. ${erste}–${letzte})` : '';
    knopf.textContent = tour.naechste === 0
      ? `▶️ Route starten: ${route.length} Kunden${bereich}`
      : `▶️ Nächste ${route.length} Kunden${bereich}`;
  }

  const uebersprungen = kunden.filter((k) => k.uebersprungen).length;
  $('tour-stand').textContent = fertig
    ? `✅ Alle Kunden sind abgearbeitet.`
    : `${kunden.length} Kunden in der Tour. Noch ${nochOffen(tour)} offen.`;
  if (uebersprungen) $('tour-stand').textContent += ` ⏭️ ${uebersprungen} übersprungen.`;
  if (tour.stopps && tour.stopps > kunden.length) {
    $('tour-stand').textContent += ` ⚠️ Laut Liste sind es ${tour.stopps} Stopps – ${tour.stopps - kunden.length} fehlen.`;
  }

  $('knopf-nochmal').classList.toggle('versteckt', !tour.letzteRoute);
  $('knopf-fotos-pruefen').classList.toggle('versteckt', !fotosPassen(tour));

  const loeschen = new Date(loeschZeitpunkt(tour)).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  $('loesch-info').textContent = `🔒 Die Kundenadressen werden automatisch gelöscht: ${loeschen} Uhr`;

  karteAnzeigen(tour);

  // Liste aller Kunden. Erledigte werden grau durchgestrichen.
  const aktuellerStart = tour.letzteRoute ? tour.letzteRoute[0] : 0;
  const liste = $('liste');
  liste.innerHTML = '';
  kunden.forEach((k, i) => {
    const li = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'kunde-text';
    const nr = document.createElement('b');
    nr.textContent = k.pos !== null ? k.pos + '.' : '?';
    text.append(nr, ' ' + k.adresse.replace(', Österreich', ''), k.gemerkt ? ' 🧠' : '', ' ✏️');
    if (k.angefahren) text.append(' ✔️');
    const warnung = warnText(k);
    if (warnung) {
      const hinweis = document.createElement('div');
      hinweis.className = 'warnung';
      hinweis.textContent = warnung;
      text.append(hinweis);
    }
    if (k.uebersprungen) {
      li.classList.add('uebersprungen');
      text.prepend('⏭️ ');
    } else if (i < aktuellerStart) {
      li.classList.add('erledigt');
    }
    if (tour.letzteRoute && !k.uebersprungen && i >= tour.letzteRoute[0] && i < tour.letzteRoute[1]) text.prepend('🚚 ');

    // Knopf rechts: Navigation nur zu diesem einen Kunden
    const navi = document.createElement('button');
    navi.className = 'navi';
    navi.textContent = '🧭';
    navi.setAttribute('aria-label', `Navigation zu Pos. ${k.pos ?? '?'} starten`);
    navi.addEventListener('click', (e) => {
      e.stopPropagation();
      naviStarten(i);
    });

    li.append(text, navi);
    li.addEventListener('click', () => kundeBearbeiten(i));
    liste.append(li);
  });

  zeige('seite-tour');
}


// ---------- Karte zum Prüfen der Reihenfolge ----------

// Die Kunden (ohne übersprungene) in 10er-Gruppen, so wie sie auch an Google Maps gehen
function kartenGruppen(tour) {
  const aktiv = tour.kunden.filter((k) => !k.uebersprungen);
  const gruppen = [];
  for (let i = 0; i < aktiv.length; i += PRO_ROUTE) {
    gruppen.push({ von: i + 1, bis: Math.min(i + PRO_ROUTE, aktiv.length), kunden: aktiv.slice(i, i + PRO_ROUTE) });
  }
  return gruppen;
}

// Eingebettete Google-Karte mit der Route (ohne API-Schlüssel): erster Kunde -> zweiter -> ...
function kartenLink(kunden) {
  const adressen = kunden.map((k) => encodeURIComponent(k.adresse));
  if (adressen.length === 1) return `https://maps.google.com/maps?q=${adressen[0]}&output=embed`;
  return `https://maps.google.com/maps?saddr=${adressen[0]}&daddr=${adressen.slice(1).join('+to:')}&output=embed`;
}

function karteAnzeigen(tour) {
  const gruppen = kartenGruppen(tour);
  if (kartenGruppe !== null && kartenGruppe >= gruppen.length) kartenGruppe = gruppen.length ? 0 : null;
  const offen = kartenGruppe !== null;
  $('karte-inhalt').classList.toggle('versteckt', !offen);
  $('knopf-karte').textContent = offen ? '🗺️ Karte schließen' : '🗺️ Route auf der Karte prüfen';
  if (!offen) {
    $('karte').removeAttribute('src');
    return;
  }

  // Knöpfe zum Umschalten zwischen den 10er-Gruppen
  const auswahl = $('karte-auswahl');
  auswahl.innerHTML = '';
  gruppen.forEach((g, gi) => {
    const knopf = document.createElement('button');
    knopf.textContent = `Kunde ${g.von}–${g.bis}`;
    knopf.classList.toggle('aktiv', gi === kartenGruppe);
    knopf.addEventListener('click', () => {
      kartenGruppe = gi;
      karteAnzeigen(tour);
    });
    auswahl.append(knopf);
  });

  // Nur neu laden, wenn sich die Route geändert hat (sonst flackert die Karte bei jeder Änderung)
  const link = kartenLink(gruppen[kartenGruppe].kunden);
  if ($('karte').getAttribute('src') !== link) $('karte').setAttribute('src', link);
}

$('knopf-karte').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  kartenGruppe = kartenGruppe === null ? 0 : null;
  karteAnzeigen(tour);
});


// ---------- Navigation zu einem einzelnen Kunden ----------

function naviLink(kunde) {
  const parameter = new URLSearchParams({
    api: '1',
    destination: kunde.adresse,
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  return 'https://www.google.com/maps/dir/?' + parameter.toString();
}

function naviStarten(nummer) {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  const kunde = tour.kunden[nummer];
  kunde.angefahren = Date.now(); // ✔️ in der Liste, damit man sieht, wo man schon war
  tour.zuletztGeoeffnet = Date.now();
  tourSpeichern(tour);
  tourAnzeigen(tour);
  window.location.href = naviLink(kunde);
}


// ---------- Prüf-Bildschirm: Fotos mit farbigen Markierungen ----------

// Kundenzeilen, die rot markiert werden: Pos. und Kundennummer gesehen, aber kein Kunde daraus geworden
function offeneFehlstellen(tour) {
  return pruefung.fehlend.filter((f) => !tour.kunden.some(
    (k) => k.quelle && k.quelle.seite === f.seite && k.quelle.box.y0 < f.box.y1 && f.box.y0 < k.quelle.box.y1
  ));
}

function pruefungAnzeigen() {
  const tour = aktuelleTour();
  if (!tour || !fotosPassen(tour)) return startbildschirm();

  const anzahl = tour.kunden.length;
  let stand = `${anzahl} Kunden erkannt`;
  if (tour.stopps && tour.stopps > anzahl) stand += ` – laut Liste sind es ${tour.stopps}. ⚠️ Es fehlen ${tour.stopps - anzahl}.`;
  else if (tour.stopps) stand += ` – laut Liste ${tour.stopps}. ✅ Vollständig!`;
  else stand += '.';
  const gemerkt = tour.kunden.filter((k) => k.gemerkt).length;
  if (gemerkt) stand += ` 🧠 ${gemerkt} aus dem Gedächtnis.`;
  $('pruef-stand').textContent = stand;

  const fehlstellen = offeneFehlstellen(tour);
  const behaelter = $('pruef-fotos');
  behaelter.innerHTML = '';

  pruefung.seiten.forEach((s, si) => {
    const rahmen = document.createElement('div');
    rahmen.className = 'foto-rahmen';
    const bild = document.createElement('img');
    bild.src = s.url;
    bild.alt = `Seite ${si + 1}`;
    rahmen.append(bild);

    // Tippen irgendwo ins Foto = an dieser Stelle einen Kunden suchen
    rahmen.addEventListener('click', (e) => {
      const r = rahmen.getBoundingClientRect();
      zeileImFoto(si, ((e.clientY - r.top) / r.height) * s.hoehe);
    });

    tour.kunden.forEach((k, i) => {
      if (!k.quelle || k.quelle.seite !== si) return;
      const art = k.unsicher || k.hinweis ? 'unsicher' : 'ok';
      const text = (k.pos ?? '?') + (k.gemerkt ? ' 🧠' : '');
      rahmen.append(markierung(s, k.quelle.box, art, text, () => kundeBearbeiten(i)));
    });
    fehlstellen.filter((f) => f.seite === si).forEach((f) => {
      rahmen.append(markierung(s, f.box, 'fehlt', '!', () => zeileImFoto(si, (f.box.y0 + f.box.y1) / 2)));
    });

    behaelter.append(rahmen);
  });

  zeige('seite-pruefen');
}

// Ein farbiges Kästchen über einer Zeile im Foto
function markierung(seite, box, art, beschriftung, aktion) {
  const rand = seite.zeilenHoehe * 0.3;
  const m = document.createElement('div');
  m.className = 'markierung ' + art;
  m.style.left = ((box.x0 - rand) / seite.breite) * 100 + '%';
  m.style.top = ((box.y0 - rand) / seite.hoehe) * 100 + '%';
  m.style.width = ((box.x1 - box.x0 + 2 * rand) / seite.breite) * 100 + '%';
  m.style.height = ((box.y1 - box.y0 + 2 * rand) / seite.hoehe) * 100 + '%';
  const b = document.createElement('b');
  b.textContent = beschriftung;
  m.append(b);
  m.addEventListener('click', (e) => {
    e.stopPropagation();
    aktion();
  });
  return m;
}

// Einen Streifen aus dem Foto ausschneiden und doppelt so groß machen (zum Anschauen und genauer Lesen)
async function ausschnittMachen(seite, y0, y1) {
  const bild = new Image();
  bild.src = seite.url;
  await bild.decode();
  const skala = 2;
  const leinwand = document.createElement('canvas');
  leinwand.width = seite.breite * skala;
  leinwand.height = Math.round((y1 - y0) * skala);
  const ctx = leinwand.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bild, 0, y0, seite.breite, y1 - y0, 0, 0, leinwand.width, leinwand.height);
  const url = await alsBildAdresse(leinwand);
  return {
    url,
    leinwand,
    y0,
    skala,
    // So hoch anzeigen, dass die Schrift gut lesbar ist (ca. 20 Pixel)
    anzeigeHoehe: Math.round(((y1 - y0) * 20) / seite.zeilenHoehe),
    freigeben() {
      URL.revokeObjectURL(url);
      leinwand.width = leinwand.height = 0;
    },
  };
}

// Auf eine Stelle im Foto getippt: Kunde dort bearbeiten oder neu hinzufügen
async function zeileImFoto(si, y) {
  const tour = aktuelleTour();
  if (!tour || !fotosPassen(tour)) return startbildschirm();
  const seite = pruefung.seiten[si];
  const h = seite.zeilenHoehe;

  // Liegt dort schon ein erkannter Kunde? Dann den bearbeiten.
  const vorhanden = tour.kunden.findIndex((k) => k.quelle && k.quelle.seite === si
    && y >= k.quelle.box.y0 - h * 0.3 && y <= k.quelle.box.y1 + h * 0.3);
  if (vorhanden !== -1) return kundeBearbeiten(vorhanden);

  const ausschnitt = await ausschnittMachen(seite, Math.max(0, y - 1.5 * h), Math.min(seite.hoehe, y + 2.5 * h));
  const fenster = dialogOeffnen({
    titel: 'Fehlenden Kunden hinzufügen',
    bild: ausschnitt,
    info: '⏳ Ich lese diese Stelle nochmal genauer …',
  });

  // Den Ausschnitt vergrößert nochmal lesen. Das klappt oft besser als beim ganzen Foto.
  try {
    const ergebnis = await (await texterkennungLaden()).recognize(ausschnitt.leinwand);
    const texte = ergebnis.data.lines.map((l) => l.text.trim());
    const mitte = (y - ausschnitt.y0) * ausschnitt.skala;
    const abstand = (k) => {
      const box = ergebnis.data.lines[k.zeilen[k.zeilen.length - 1]].bbox;
      return Math.abs((box.y0 + box.y1) / 2 - mitte);
    };
    const gefunden = findeKunden(texte).sort((a, b) => abstand(a) - abstand(b))[0];
    const nr = gefunden ? gefunden.nr : texte.map(nummerFinden).find((n) => n) || null;
    const gemerkt = nachschlagen(nr);
    if (gemerkt && (!gefunden || gefunden.unsicher || gefunden.hinweis)) {
      fenster.vorbelegen(gefunden ? gefunden.pos : texte.map(positionFinden).find((p) => p !== null) ?? null,
        gemerkt.adresse, '🧠 Adresse aus dem Gedächtnis. Bitte kurz mit dem Ausschnitt vergleichen.', gemerkt.nr);
    } else if (gefunden) {
      fenster.vorbelegen(gefunden.pos, gefunden.adresse, gefunden.unsicher
        ? '⚠️ Die Straße ist nicht lesbar. Bitte aus dem Ausschnitt abtippen.'
        : '✅ Gelesen. Bitte kurz mit dem Ausschnitt vergleichen.', gefunden.nr);
    } else {
      const pos = texte.map(positionFinden).find((p) => p !== null) ?? null;
      fenster.vorbelegen(pos, '', '✍️ Konnte nicht gelesen werden. Bitte aus dem Ausschnitt abtippen.', nr);
    }
  } catch (e) {
    fenster.vorbelegen(null, '', '✍️ Bitte aus dem Ausschnitt abtippen.');
  }

  const antwort = await fenster.ergebnis;
  ausschnitt.freigeben();
  if (antwort.aktion !== 'speichern') return;

  const neu = {
    pos: antwort.pos,
    nr: antwort.nr,
    adresse: antwort.adresse,
    unsicher: false,
    quelle: { seite: si, box: { x0: seite.breite * 0.03, x1: seite.breite * 0.97, y0: y - h * 0.6, y1: y + h * 0.6 } },
  };
  const hinweis = kundeEinfuegen(tour, neu);
  tourSpeichern(tour);
  merken([neu]);
  neuZeichnen();
  if (hinweis) alert(hinweis);
}


// ---------- Fenster zum Ändern oder Hinzufügen ----------

function dialogOeffnen({ titel, bild, info, loeschen = false, ueberspringen = null }) {
  $('dialog-titel').textContent = titel;
  const bildFeld = $('dialog-bild');
  bildFeld.classList.toggle('versteckt', !bild);
  $('dialog-bild-hinweis').classList.toggle('versteckt', !bild);
  if (bild) {
    const img = bildFeld.querySelector('img');
    // Auf der Tourenübersicht beginnt die Spalte "Adresse" bei ungefähr 30 % der Breite.
    // Dorthin vorspulen, damit man die Adresse gleich sieht (Pos. und Nr. liegen links davon).
    img.onload = () => { bildFeld.scrollLeft = bildFeld.scrollWidth * 0.3; };
    img.src = bild.url;
    img.style.height = bild.anzeigeHoehe + 'px';
  }
  $('dialog-pos').value = '';
  $('dialog-adresse').value = '';
  $('dialog-nr').value = '';
  $('dialog-nr-feld').classList.toggle('versteckt', !gedaechtnisLaden().an);
  $('dialog-info').textContent = info || '';
  $('dialog-loeschen').classList.toggle('versteckt', !loeschen);
  // ueberspringen: null = Knopf nicht zeigen, false = "überspringen", true = "doch anfahren"
  $('dialog-ueberspringen').classList.toggle('versteckt', ueberspringen === null);
  $('dialog-ueberspringen').textContent = ueberspringen ? '↩️ Doch anfahren' : '⏭️ Diesmal überspringen';
  $('dialog').classList.remove('versteckt');

  let offen = true;
  let selbstGetippt = false;
  $('dialog-pos').oninput = $('dialog-adresse').oninput = $('dialog-nr').oninput = () => { selbstGetippt = true; };

  const ergebnis = new Promise((fertig) => {
    const schliessen = (aktion) => {
      const adresseText = $('dialog-adresse').value.trim();
      const posText = $('dialog-pos').value.trim();
      const nrText = $('dialog-nr').value.trim();
      if (aktion === 'speichern' && !adresseText) {
        $('dialog-info').textContent = '⚠️ Bitte eine Adresse eingeben.';
        return;
      }
      offen = false;
      $('dialog').classList.add('versteckt');
      fertig({
        aktion,
        pos: /^\d{1,3}$/.test(posText) ? Number(posText) : null,
        nr: /^\d{5}$/.test(nrText) ? nrText : null,
        adresse: /österreich/i.test(adresseText) ? adresseText : adresseText + ', Österreich',
      });
    };
    $('dialog-ok').onclick = () => schliessen('speichern');
    $('dialog-loeschen').onclick = () => schliessen('loeschen');
    $('dialog-ueberspringen').onclick = () => schliessen('ueberspringen');
    $('dialog-abbrechen').onclick = () => schliessen(null);
  });

  return {
    ergebnis,
    // Felder ausfüllen, aber nur, wenn man noch nicht selbst etwas getippt hat
    vorbelegen(pos, adresse, text, nr) {
      if (!offen) return;
      if (!selbstGetippt) {
        $('dialog-pos').value = pos ?? '';
        $('dialog-adresse').value = (adresse || '').replace(', Österreich', '');
        $('dialog-nr').value = nr && /^\d{5}$/.test(nr) ? nr : '';
      }
      if (text) $('dialog-info').textContent = text;
    },
  };
}


// ---------- Kunden ändern, löschen, überspringen, hinzufügen ----------

// Kunde an der passenden Stelle (nach Pos.) einsortieren. Gibt einen Hinweis zurück, falls nötig.
function kundeEinfuegen(tour, kunde) {
  let stelle = tour.kunden.length;
  if (kunde.pos !== null) {
    const naechsterGroesserer = tour.kunden.findIndex((k) => k.pos !== null && k.pos > kunde.pos);
    if (naechsterGroesserer !== -1) stelle = naechsterGroesserer;
  }
  // Schon an Google Maps geschickte Kunden bleiben, wie sie sind.
  // Gehört der neue Kunde eigentlich weiter nach vorne, kommt er in die nächste Route.
  let hinweis = '';
  if (stelle < tour.naechste) {
    stelle = tour.naechste;
    hinweis = 'Dieser Kunde gehört zu einer Route, die schon offen war. Er kommt deshalb in die nächste Route.';
  }
  tour.kunden.splice(stelle, 0, kunde);
  return hinweis;
}

function kundeEntfernen(tour, nummer) {
  tour.kunden.splice(nummer, 1);
  // Die Zähler für erledigte Kunden rutschen mit, wenn davor etwas gelöscht wurde
  if (nummer < tour.naechste) tour.naechste--;
  if (tour.letzteRoute) {
    if (nummer < tour.letzteRoute[0]) tour.letzteRoute[0]--;
    if (nummer < tour.letzteRoute[1]) tour.letzteRoute[1]--;
  }
}

// Kunde antippen (in der Liste oder im Foto) -> ändern, überspringen oder löschen
async function kundeBearbeiten(nummer) {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  const kunde = tour.kunden[nummer];

  // Wenn die Fotos noch da sind: den passenden Ausschnitt zeigen
  let ausschnitt = null;
  if (kunde.quelle && fotosPassen(tour)) {
    const seite = pruefung.seiten[kunde.quelle.seite];
    const h = seite.zeilenHoehe;
    ausschnitt = await ausschnittMachen(seite,
      Math.max(0, kunde.quelle.box.y0 - h), Math.min(seite.hoehe, kunde.quelle.box.y1 + 2.2 * h));
  }

  let info = '';
  if (kunde.unsicher) info = '⚠️ Die Straße war nicht lesbar. Bitte ergänzen.';
  else if (kunde.hinweis) info = '⚠️ ' + kunde.hinweis + '. Bitte prüfen.';
  else if (kunde.gemerkt) info = '🧠 Diese Adresse kommt aus dem Stammkunden-Gedächtnis.';

  const fenster = dialogOeffnen({
    titel: 'Kunde ändern',
    bild: ausschnitt,
    info,
    loeschen: true,
    ueberspringen: !!kunde.uebersprungen,
  });
  fenster.vorbelegen(kunde.pos, kunde.adresse, null, kunde.nr);
  const antwort = await fenster.ergebnis;
  if (ausschnitt) ausschnitt.freigeben();

  let hinweis = '';
  if (antwort.aktion === 'loeschen') {
    if (!confirm('Diesen Kunden aus der Tour löschen?')) return;
    kundeEntfernen(tour, nummer);
  } else if (antwort.aktion === 'ueberspringen') {
    kunde.uebersprungen = !kunde.uebersprungen;
  } else if (antwort.aktion === 'speichern') {
    const geaendert = {
      ...kunde, pos: antwort.pos, nr: antwort.nr || kunde.nr, adresse: antwort.adresse, unsicher: false, hinweis: null,
    };
    if (antwort.adresse !== kunde.adresse) geaendert.gemerkt = false;
    if (antwort.pos !== kunde.pos && nummer >= tour.naechste) {
      // Neue Pos.-Nummer: Kunde an die richtige Stelle umsortieren
      kundeEntfernen(tour, nummer);
      hinweis = kundeEinfuegen(tour, geaendert);
    } else {
      tour.kunden[nummer] = geaendert;
    }
    merken([geaendert]);
  } else {
    return; // Abbrechen
  }
  tourSpeichern(tour);
  neuZeichnen();
  if (hinweis) alert(hinweis);
}

// Kunde, den die Texterkennung übersehen hat, von Hand dazunehmen
async function kundeHinzufuegen() {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();

  const fenster = dialogOeffnen({
    titel: 'Fehlenden Kunden hinzufügen',
    info: fotosPassen(tour)
      ? 'Tipp: Unter „🔍 Fotos prüfen“ kannst du auch direkt auf die Zeile im Foto tippen.'
      : 'Pos.-Nummer unbekannt? Leer lassen, dann kommt der Kunde ans Ende.',
  });
  const antwort = await fenster.ergebnis;
  if (antwort.aktion !== 'speichern') return;

  const neu = { pos: antwort.pos, nr: antwort.nr, adresse: antwort.adresse, unsicher: false };
  const hinweis = kundeEinfuegen(tour, neu);
  tourSpeichern(tour);
  merken([neu]);
  neuZeichnen();
  if (hinweis) alert(hinweis);
}

$('knopf-dazu').addEventListener('click', kundeHinzufuegen);
$('knopf-fotos-pruefen').addEventListener('click', pruefungAnzeigen);
$('knopf-pruefen-fertig').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  merken(tour.kunden); // Wer "Passt" drückt, hat die Kunden geprüft
  kartenGruppe = 0;    // gleich die Karte zeigen, damit man die Reihenfolge prüfen kann
  tourAnzeigen(tour);
});


// ---------- Fotos machen ----------

$('knopf-foto').addEventListener('click', () => $('kamera').click());

$('kamera').addEventListener('change', async (e) => {
  const datei = e.target.files[0];
  e.target.value = ''; // damit man gleich das nächste Foto machen kann
  if (!datei) return;
  const foto = { datei, url: URL.createObjectURL(datei), bewertung: null };
  fotos.push(foto);
  vorschauAnzeigen();
  foto.bewertung = await fotoBewerten(foto.url);
  vorschauAnzeigen();
});

$('knopf-fertig').addEventListener('click', fotosLesen);

// Vorschaubilder der Fotos. Antippen = Foto löschen.
function vorschauAnzeigen() {
  const vorschau = $('vorschau');
  vorschau.innerHTML = '';
  fotos.forEach((foto, i) => {
    const kasten = document.createElement('div');
    kasten.className = 'vorschau-bild';
    const bild = document.createElement('img');
    bild.src = foto.url;
    const text = document.createElement('span');
    const b = foto.bewertung;
    if (b && (b.unscharf || b.dunkel)) {
      kasten.classList.add('schlecht');
      text.textContent = b.dunkel ? '⚠️ zu dunkel' : '⚠️ unscharf';
    } else {
      text.textContent = `Seite ${i + 1}`;
    }
    kasten.append(bild, text);
    kasten.addEventListener('click', () => {
      if (!confirm(`Foto von Seite ${i + 1} löschen?`)) return;
      URL.revokeObjectURL(foto.url);
      fotos.splice(i, 1);
      vorschauAnzeigen();
    });
    vorschau.append(kasten);
  });

  $('foto-zahl').textContent = fotos.length === 0
    ? 'Alle Seiten der Tourenübersicht nacheinander fotografieren. Dann „Fertig“ drücken.'
    : `${fotos.length} ${fotos.length === 1 ? 'Seite' : 'Seiten'} fotografiert. Nächste Seite fotografieren oder „Fertig“ drücken. Foto antippen = löschen.`;
  const schlecht = fotos.map((f, i) => (f.bewertung && (f.bewertung.unscharf || f.bewertung.dunkel) ? i + 1 : 0)).filter(Boolean);
  $('foto-warnung').classList.toggle('versteckt', schlecht.length === 0);
  $('foto-warnung').textContent = schlecht.length === 0 ? '' : (schlecht.length === 1
    ? `⚠️ Das Foto von Seite ${schlecht[0]} ist wahrscheinlich unscharf oder zu dunkel. Antippen zum Löschen und nochmal fotografieren.`
    : `⚠️ Die Fotos der Seiten ${schlecht.join(', ')} sind wahrscheinlich unscharf oder zu dunkel. Antippen zum Löschen und nochmal fotografieren.`);
  $('knopf-fertig').disabled = fotos.length === 0;
}

// Grobe Prüfung direkt nach dem Fotografieren: zu dunkel? verwackelt?
// Gemessen wird, wie stark sich benachbarte Bildpunkte unterscheiden. Scharfe Schrift hat harte Kanten.
// Gemessen: gute Fotos der Tourenübersicht ca. 1000–4000, leicht verwackelt (Schrift unlesbar) unter 100
const SCHAERFE_MINDESTENS = 150;
const HELLIGKEIT_MINDESTENS = 70;

async function fotoBewerten(url) {
  try {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    const breite = 1000;
    const hoehe = Math.round((bild.naturalHeight / bild.naturalWidth) * breite);
    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    const ctx = leinwand.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    const d = ctx.getImageData(0, 0, breite, hoehe).data;

    const grau = new Float32Array(breite * hoehe);
    let summe = 0;
    for (let i = 0; i < grau.length; i++) {
      grau[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      summe += grau[i];
    }
    // Kantenstärke (Laplace) nur im mittleren Bereich, dort liegt das Blatt
    let n = 0, mittel = 0, quadrat = 0;
    for (let y = Math.floor(hoehe * 0.15); y < hoehe * 0.85; y++) {
      for (let x = Math.floor(breite * 0.15); x < breite * 0.85; x++) {
        const i = y * breite + x;
        const l = 4 * grau[i] - grau[i - 1] - grau[i + 1] - grau[i - breite] - grau[i + breite];
        n++;
        mittel += l;
        quadrat += l * l;
      }
    }
    mittel /= n;
    const schaerfe = quadrat / n - mittel * mittel;
    leinwand.width = leinwand.height = 0;
    return { schaerfe, helligkeit: summe / grau.length, unscharf: schaerfe < SCHAERFE_MINDESTENS, dunkel: summe / grau.length < HELLIGKEIT_MINDESTENS };
  } catch (e) {
    return null;
  }
}


// ---------- Texterkennung ----------

async function texterkennungLaden() {
  if (worker) return worker;
  if (!window.Tesseract) {
    throw new Error('Die Texterkennung konnte nicht geladen werden. Bitte Internet prüfen.');
  }
  // Alle Teile der Texterkennung kommen aus dem eigenen Ordner "tesseract", nicht aus dem Internet
  const ordner = new URL('tesseract/', location.href).href;
  worker = await Tesseract.createWorker('deu', 1, {
    workerPath: ordner + 'worker.min.js',
    corePath: ordner,
    langPath: ordner,
    workerBlobURL: false,
    logger: (m) => fortschritt(m),
  });
  await worker.setParameters({
    tessedit_pageseg_mode: '6',     // Seite als einen Textblock lesen, damit Tabellenzeilen zusammenbleiben
    preserve_interword_spaces: '1',
  });
  return worker;
}

// Foto verkleinern und in Graustufen umwandeln. Das macht die Erkennung schneller und genauer.
async function bildVorbereiten(datei) {
  const bild = new Image();
  bild.src = URL.createObjectURL(datei);
  await bild.decode();

  // Nicht zu stark verkleinern, sonst wird die kleine Schrift unlesbar
  const faktor = Math.min(1, 3600 / Math.max(bild.naturalWidth, bild.naturalHeight));
  const leinwand = document.createElement('canvas');
  leinwand.width = Math.round(bild.naturalWidth * faktor);
  leinwand.height = Math.round(bild.naturalHeight * faktor);
  const ctx = leinwand.getContext('2d');
  ctx.drawImage(bild, 0, 0, leinwand.width, leinwand.height);

  const pixel = ctx.getImageData(0, 0, leinwand.width, leinwand.height);
  const d = pixel.data;
  for (let i = 0; i < d.length; i += 4) {
    const grau = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = grau;
  }
  ctx.putImageData(pixel, 0, 0);
  URL.revokeObjectURL(bild.src);
  return leinwand;
}

function alsBildAdresse(leinwand) {
  return new Promise((fertig) => leinwand.toBlob((b) => fertig(URL.createObjectURL(b)), 'image/jpeg', 0.85));
}

async function fotosLesen() {
  fehler('');
  zeige('seite-lesen');
  const balken = $('lese-balken');
  const text = $('lese-text');

  try {
    let seite = 0;
    fortschritt = (m) => {
      if (m.status === 'recognizing text') {
        const gesamt = (seite + m.progress) / fotos.length;
        balken.style.width = Math.round(gesamt * 100) + '%';
        text.textContent = `Lese Seite ${seite + 1} von ${fotos.length} … ${Math.round(gesamt * 100)} %`;
      } else if (seite === 0) {
        text.textContent = 'Texterkennung wird geladen …';
      }
    };

    await plzLaden();
    const w = await texterkennungLaden();
    const alleZeilen = []; // { text, seite, box }
    const seiten = [];
    for (seite = 0; seite < fotos.length; seite++) {
      const leinwand = await bildVorbereiten(fotos[seite].datei);
      const ergebnis = await w.recognize(leinwand);
      const zeilen = ergebnis.data.lines.map((l) => ({ text: l.text.trim(), seite, box: l.bbox }));
      alleZeilen.push(...zeilen);

      // Typische Schrifthöhe auf diesem Foto (für Markierungen und Ausschnitte)
      const hoehen = zeilen.map((z) => z.box.y1 - z.box.y0).sort((a, b) => a - b);
      seiten.push({
        url: await alsBildAdresse(leinwand),
        breite: leinwand.width,
        hoehe: leinwand.height,
        zeilenHoehe: hoehen[Math.floor(hoehen.length / 2)] || 30,
      });
      leinwand.width = leinwand.height = 0; // Arbeitsspeicher freigeben
    }

    const benutzt = new Set();
    const kunden = findeKunden(alleZeilen.map((z) => z.text), benutzt);

    // Merken, wo im Foto jeder Kunde steht
    kunden.forEach((k) => {
      const hauptzeile = alleZeilen[k.zeilen[k.zeilen.length - 1]];
      const teile = k.zeilen.map((i) => alleZeilen[i]).filter((z) => z.seite === hauptzeile.seite);
      k.quelle = {
        seite: hauptzeile.seite,
        box: {
          x0: Math.min(...teile.map((z) => z.box.x0)),
          y0: Math.min(...teile.map((z) => z.box.y0)),
          x1: Math.max(...teile.map((z) => z.box.x1)),
          y1: Math.max(...teile.map((z) => z.box.y1)),
        },
      };
      delete k.zeilen;
    });

    // Stammkunden: geprüfte Adresse aus dem Gedächtnis nehmen
    for (const k of kunden) {
      const gemerkt = nachschlagen(k.nr);
      if (!gemerkt) continue;
      Object.assign(k, { nr: gemerkt.nr, adresse: gemerkt.adresse, unsicher: false, hinweis: null, gemerkt: true });
    }

    // Zeilen mit Pos. und Kundennummer, aus denen kein Kunde wurde.
    // Steht die Kundennummer im Gedächtnis, wird der Kunde trotzdem aufgenommen, sonst später rot markiert.
    const fehlend = [];
    const nachtraeglich = [];
    alleZeilen.forEach((z, i) => {
      if (benutzt.has(i) || !POS_NR.test(zeileBereinigen(z.text))) return;
      const pos = positionFinden(z.text);
      const gemerkt = nachschlagen(nummerFinden(z.text));
      const schonDa = kunden.some((k) => (pos !== null && k.pos === pos) || (gemerkt && k.nr === gemerkt.nr));
      if (gemerkt && !schonDa) {
        nachtraeglich.push({ pos, nr: gemerkt.nr, adresse: gemerkt.adresse, unsicher: false, gemerkt: true, quelle: { seite: z.seite, box: z.box } });
      } else if (!schonDa) {
        fehlend.push({ seite: z.seite, box: z.box });
      }
    });

    // Unten auf der Liste steht "Anzahl Stopps 16". Damit merken wir, ob Kunden fehlen.
    const stopps = alleZeilen.map((z) => z.text).join(' ').match(/Anzahl\s+Stopps\s+(\d{1,3})/i);

    const tour = {
      kunden,
      naechste: 0,
      letzteRoute: null,
      stopps: stopps ? Number(stopps[1]) : null,
      erstellt: Date.now(),
    };
    nachtraeglich.forEach((k) => kundeEinfuegen(tour, k));

    if (tour.kunden.length === 0) {
      seiten.forEach((s) => URL.revokeObjectURL(s.url));
      throw new Error('Auf den Fotos wurden keine Adressen gefunden. Bitte nochmal gerade, hell und scharf fotografieren.');
    }
    tourSpeichern(tour);

    pruefungVerwerfen();
    pruefung = { tourId: tour.erstellt, seiten, fehlend };

    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    fotos = [];
    vorschauAnzeigen();
    if (navigator.vibrate) navigator.vibrate(300);
    pruefungAnzeigen();
  } catch (e) {
    zeige('seite-fotos');
    fehler(e.message);
  }
}


// ---------- Postleitzahlen prüfen ----------
// Quelle: GeoNames (www.geonames.org), Lizenz CC BY 4.0

async function plzLaden() {
  if (plzListe) return plzListe;
  try {
    plzListe = await (await fetch('plz-at.json')).json();
  } catch (e) {
    plzListe = null; // ohne Liste wird einfach nichts geprüft
  }
  return plzListe;
}

// Zum Vergleichen: klein, ohne Leerzeichen, Bindestriche und Punkte ("Klein-Meiseldorf" = "Kleinmeiseldorf")
function ortVergleich(text) {
  return text.toLowerCase().replace(/sankt/g, 'st').replace(/[^a-zäöüß]/g, '');
}

// "Wien, Favoriten" -> "Wien"
function ortKurz(name) {
  return name.split(',')[0].trim();
}

function tippfehler(a, b) {
  const zeile = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vorher = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const merk = zeile[j];
      zeile[j] = Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorher = merk;
    }
  }
  return zeile[b.length];
}

// Passenden Ortsnamen für eine PLZ suchen: genau, abgeschnitten ("Eggenb") oder mit kleinem Lesefehler
function ortFinden(namen, gelesen) {
  const v = ortVergleich(gelesen);
  if (v.length < 3) return null;
  const kandidaten = [];
  for (const name of namen) {
    for (const w of new Set([ortVergleich(name), ortVergleich(ortKurz(name))])) {
      if (w === v) return { name, genau: true };
      if (v.length >= 5 && w.startsWith(v)) kandidaten.push({ name, punkte: 0.5 });
      else {
        const f = tippfehler(w, v);
        if (f <= Math.max(1, Math.floor(w.length / 6))) kandidaten.push({ name, punkte: f });
      }
    }
  }
  kandidaten.sort((a, b) => a.punkte - b.punkte);
  if (kandidaten.length === 0) return null;
  if (kandidaten.length > 1 && kandidaten[1].punkte === kandidaten[0].punkte && kandidaten[1].name !== kandidaten[0].name) return null;
  return { name: kandidaten[0].name, genau: false };
}

// Prüft PLZ und Ort. Korrigiert kleine Lesefehler. ok = false, wenn beides nicht zusammenpasst.
function ortPruefen(plz, ort) {
  if (!plzListe) return { plz, ort, ok: true };
  if (plzListe[plz]) {
    const t = ortFinden(plzListe[plz], ort);
    if (t) return { plz, ort: t.genau ? ort : ortKurz(t.name), ok: true };
  }
  // Vielleicht wurde eine Ziffer der PLZ falsch gelesen: die PLZ mit einer anderen Ziffer probieren
  const treffer = [];
  for (let i = 0; i < 4; i++) {
    for (const ziffer of '0123456789') {
      const andere = plz.slice(0, i) + ziffer + plz.slice(i + 1);
      if (andere === plz || !plzListe[andere]) continue;
      const t = ortFinden(plzListe[andere], ort);
      if (t && t.genau) treffer.push({ plz: andere, ort });
    }
  }
  if (treffer.length === 1) return { ...treffer[0], ok: true };
  return { plz, ort, ok: false };
}


// ---------- Adressen aus dem erkannten Text heraussuchen ----------

// PLZ (4 Ziffern, nicht mit 0) und danach der Ort.
// Davor darf keine Ziffer, kein Buchstabe, Punkt, Doppelpunkt oder Schrägstrich stehen,
// sonst wäre es z. B. ein Datum wie 29.10.2026 oder das Ende der Kundennummer.
// Wörter wie "Uhr" oder "Mobil" sind kein Ort (z. B. "1900 Uhr" oder Telefonnummern).
const PLZ_ORT = /(^|[^\dA-Za-z.,:\/])(?:A\s?-\s?)?([1-9]\d{3})\s+(?!(?:Uhr|Mobil|Telefon|Tel|Fax|Min|Stk|EH)\b)((?:(?:St\.?|Sankt|Bad|Maria|Markt|Deutsch|Groß|Gross|Klein|Wiener|Bruck|Zell|Hall)\s+)?[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ]?[a-zäöüß]+)*(?:\s+(?:an der|ob der|am|im|in|bei|an)\s+[A-ZÄÖÜ][a-zäöüß]+)?)/;

// Typische Endungen von Straßennamen
const STRASSEN_ENDE = /(stra(ß|ss|b)e|str\.?|gasse|weg|platz|allee|ring|zeile|gürtel|kai|lände|promenade|steig|berg|feld|hof|markt|siedlung|park|damm|graben|winkel|leiten|bühel|au|dorf|tal|brücke)$/i;
// Wörter, die alleine stehen ("Wiener Straße") – dann gehört das Wort davor dazu
const STRASSEN_WORT = /^(stra(ß|ss|b)e|str\.?|gasse|weg|platz|allee|ring|zeile|gürtel|kai)$/i;
// Kleine Wörter am Anfang von Straßennamen ("Am Hang", "Unter der Leiten")
const VERBINDER = /^(am|an|auf|im|in|zum|zur|der|die|dem|den|unter|ober|obere|untere|alte|neue|beim|bei|hinter|vor|dr\.?|st\.?|sankt|klein|groß|gross)$/i;

// Pos. und Kundennummer stehen am Anfang jeder Kundenzeile, z. B. "3   10708   Billa-Herzogenburg".
// Die Kundennummer hat 5 Zeichen. Das erste wird manchmal falsch gelesen (z. B. "a1327" statt "81327").
const POS_NR = /(?:^|[^\d+])(\d{1,3})\s+([0-9A-Za-z]\d{4})(?!\d)/;

// Tabellenstriche und doppelte Leerzeichen entfernen
function zeileBereinigen(text) {
  return text.replace(/[|\[\]{}_]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Sucht am Ende von "text" eine Straße mit Hausnummer, z. B. "Müller GmbH Hauptstraße 12" -> "Hauptstraße 12"
function strasseAmEnde(text) {
  const treffer = text.match(/(\d+\s?[a-zA-Z]?(?:\s?[\/\-]\s?\d+\s?[a-zA-Z]?)*)\s*$/);
  if (!treffer) return null;
  const nummer = treffer[1].replace(/\s+/g, '');
  const woerter = text.slice(0, treffer.index).trim().split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return null;

  let start = -1;
  for (let i = woerter.length - 1; i >= Math.max(0, woerter.length - 4); i--) {
    if (STRASSEN_ENDE.test(woerter[i].replace(/[,;]$/, ''))) {
      start = i;
      if (STRASSEN_WORT.test(woerter[i]) && i > 0) start = i - 1;
      break;
    }
  }
  if (start === -1) start = woerter.length - 1; // keine typische Endung: nur das letzte Wort nehmen
  while (start > 0 && VERBINDER.test(woerter[start - 1])) start--;

  const name = woerter.slice(start).join(' ').replace(/[,;]$/, '');
  if (!/[A-Za-zÄÖÜäöü]{3}/.test(name)) return null;
  return name + ' ' + nummer;
}

// Sucht die Straße im Text vor der PLZ
function strasseFinden(davor) {
  // Pos. und Kundennummer vorne abschneiden
  const pn = davor.match(POS_NR);
  const rest = pn ? davor.slice(pn.index + pn[0].length) : davor;

  // Zu lange Namen werden mit ".." abgekürzt ("Weinwelt G.."). Danach kommt direkt die Adresse.
  const punkte = rest.lastIndexOf('..');
  if (punkte >= 0) {
    const nach = rest.slice(punkte + 2).replace(/^[^A-Za-zÄÖÜäöü]+/, '').trim();
    if (/[A-Za-zÄÖÜäöü]{3}/.test(nach)) return nach;
  }
  return strasseAmEnde(rest);
}

// Pos.-Nummer in der Zeile suchen (Zahl vor der 5-stelligen Kundennummer)
function positionFinden(text) {
  const treffer = zeileBereinigen(text).match(POS_NR);
  return treffer ? Number(treffer[1]) : null;
}

// Kundennummer in der Zeile suchen. Ist die erste Stelle keine Ziffer, wird sie zu "?".
function nummerFinden(text) {
  const treffer = zeileBereinigen(text).match(POS_NR);
  if (!treffer) return null;
  return /^\d/.test(treffer[2]) ? treffer[2] : '?' + treffer[2].slice(1);
}

// Findet die Kunden in den Textzeilen.
// Jeder Kunde merkt sich in "zeilen", aus welchen Zeilen er stammt.
// In "benutzt" landen alle Zeilen, die zu einem Kunden gehören.
function findeKunden(zeilen, benutzt = new Set()) {
  zeilen = zeilen.map(zeileBereinigen);

  const gefunden = [];
  zeilen.forEach((zeile, i) => {
    const t = zeile.match(PLZ_ORT);
    if (!t) return;
    const davor = zeile.slice(0, t.index + t[1].length).replace(/[,\s]+$/, '');
    const danach = zeile.slice(t.index + t[0].length);
    const vorige = i > 0 && !PLZ_ORT.test(zeilen[i - 1]) ? zeilen[i - 1] : '';
    let vorigeBenutzt = false;

    // Die Straße steht meistens vor der PLZ, manchmal danach oder eine Zeile darüber
    let strasse = strasseFinden(davor);
    if (!strasse) {
      const nachher = danach.match(/^[,\s]*([A-ZÄÖÜ][^\d]{2,40}?\s\d+[a-zA-Z]?)/);
      if (nachher) strasse = nachher[1].trim();
    }
    if (!strasse && vorige) {
      strasse = strasseFinden(vorige);
      if (strasse) vorigeBenutzt = true;
    }

    // Pos. und Kundennummer stehen in derselben Zeile oder (wenn umgebrochen) eine Zeile darüber
    let pos = positionFinden(davor);
    let nr = nummerFinden(davor);
    if (pos === null && vorige) {
      pos = positionFinden(vorige);
      nr = nummerFinden(vorige);
      if (pos !== null) vorigeBenutzt = true;
    }

    // Weder Straße noch Pos.: das ist wahrscheinlich gar keine Kundenzeile
    if (!strasse && pos === null) return;

    // PLZ und Ort mit dem Verzeichnis vergleichen (kleine Lesefehler werden korrigiert)
    const geprueft = ortPruefen(t[2], t[3]);
    const ortText = `${geprueft.plz} ${geprueft.ort}`;

    const herkunft = vorigeBenutzt ? [i - 1, i] : [i];
    herkunft.forEach((n) => benutzt.add(n));

    // Straße nicht lesbar: Kunde trotzdem aufnehmen, Google Maps fährt dann in den Ort
    gefunden.push({
      pos,
      nr,
      adresse: strasse ? `${strasse}, ${ortText}, Österreich` : `${ortText}, Österreich`,
      unsicher: !strasse,
      hinweis: geprueft.ok ? null : 'PLZ und Ort passen nicht zusammen',
      zeilen: herkunft,
    });
  });

  // Doppelte entfernen (z. B. wenn eine Zeile auf zwei Fotos drauf ist)
  const schonDa = new Set();
  const kunden = gefunden.filter((k) => {
    const doppelt = (!k.unsicher && schonDa.has(k.adresse)) || (k.pos !== null && schonDa.has(k.pos));
    if (doppelt) return false;
    schonDa.add(k.adresse);
    if (k.pos !== null) schonDa.add(k.pos);
    return true;
  });

  // Nach "Pos." sortieren. Wurde die Pos. nicht erkannt, bleibt der Kunde
  // an seinem Platz direkt hinter dem Kunden davor (die Liste ist ja schon sortiert gedruckt).
  let davorNr = 0;
  kunden.forEach((k, i) => {
    k.sortierung = k.pos !== null ? k.pos : davorNr + (i + 1) / 10000;
    davorNr = k.sortierung;
  });
  kunden.sort((a, b) => a.sortierung - b.sortierung);
  kunden.forEach((k) => delete k.sortierung);
  return kunden;
}


// ---------- Google Maps öffnen ----------

// Start ist immer der aktuelle Standort (dafür lassen wir "origin" einfach weg)
function mapsLink(kunden) {
  const parameter = new URLSearchParams({
    api: '1',
    destination: kunden[kunden.length - 1].adresse,
    travelmode: 'driving',
  });
  if (kunden.length > 1) {
    parameter.set('waypoints', kunden.slice(0, -1).map((k) => k.adresse).join('|'));
  }
  return 'https://www.google.com/maps/dir/?' + parameter.toString();
}

// Kunden von Nummer "von" bis vor "bis" an Google Maps schicken (übersprungene nicht)
function routeOeffnen(tour, von, bis) {
  const ziele = tour.kunden.slice(von, bis).filter((k) => !k.uebersprungen);
  if (ziele.length === 0) return tourAnzeigen(tour);
  tour.letzteRoute = [von, bis];
  tour.naechste = Math.max(tour.naechste, bis);
  tour.zuletztGeoeffnet = Date.now();
  tourSpeichern(tour);
  tourAnzeigen(tour);
  window.location.href = mapsLink(ziele);
}

$('knopf-naechste').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  const route = naechsteRoute(tour);
  if (route.length) routeOeffnen(tour, tour.naechste, route[route.length - 1] + 1);
});

$('knopf-nochmal').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  if (tour.letzteRoute) routeOeffnen(tour, tour.letzteRoute[0], tour.letzteRoute[1]);
});

$('knopf-neu').addEventListener('click', () => {
  if (!confirm('Die ganze Tour löschen und eine neue anfangen?')) return;
  tourSpeichern(null);
  pruefungVerwerfen();
  kartenGruppe = null;
  fehler('');
  zeige('seite-fotos');
});


// ---------- Beim Öffnen der App ----------

$('version').textContent = 'Version ' + VERSION;
gedaechtnisAnzeigen();
plzLaden(); // schon mal im Hintergrund laden

function startbildschirm() {
  if (!$('dialog').classList.contains('versteckt')) return; // Fenster offen: nicht stören
  const tour = aktuelleTour();
  if (tour) {
    if (sichtbar('seite-pruefen') && fotosPassen(tour)) return; // beim Prüfen bleiben
    tourAnzeigen(tour);
  } else if (!sichtbar('seite-lesen')) {
    zeige('seite-fotos'); // keine Tour (oder abgelaufen)
  }
}
startbildschirm();

// Die App bleibt im Handy oft im Hintergrund offen. Beim Zurückkommen nochmal prüfen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startbildschirm();
});

// Damit die App vom Home-Bildschirm aus wie eine echte App funktioniert
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
