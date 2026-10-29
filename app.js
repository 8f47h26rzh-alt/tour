// Touren-App: Fotos der Tourenübersicht -> Adressen -> Google Maps
// Alles läuft im Handy-Browser. Es gibt keinen Server.

// Bei jeder Änderung um eins erhöhen (Verlauf steht in ANLEITUNG.md)
const VERSION = '1.4';

const PRO_ROUTE = 10;            // So viele Kunden schickt die App auf einmal an Google Maps
const SPEICHER_NAME = 'tour-v1'; // Unter diesem Namen merkt sich das Handy die Tour

// Datenschutz: Die Tour wird automatisch gelöscht ...
const STUNDE = 60 * 60 * 1000;
const LOESCHEN_NACH = 36 * STUNDE;        // ... spätestens 36 Stunden nach dem Fotografieren
                                          //     (die Liste wird oft schon am Vortag fotografiert)
const LOESCHEN_WENN_FERTIG = 6 * STUNDE;  // ... oder 6 Stunden nachdem die letzte Route geöffnet wurde

let fotos = [];        // Die Fotos, die gerade gemacht wurden
let worker = null;     // Die Texterkennung (wird erst beim ersten Mal geladen)
let fortschritt = () => {};

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
  const fertig = tour.naechste >= tour.kunden.length;
  if (fertig && tour.zuletztGeoeffnet) zeit = Math.min(zeit, tour.zuletztGeoeffnet + LOESCHEN_WENN_FERTIG);
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


// ---------- Bildschirme umschalten ----------

const BILDSCHIRME = ['seite-fotos', 'seite-lesen', 'seite-pruefen', 'seite-tour'];

function zeige(seite) {
  const wechsel = !sichtbar(seite);
  for (const id of BILDSCHIRME) $(id).classList.toggle('versteckt', id !== seite);
  if (wechsel) window.scrollTo(0, 0); // nur beim Wechsel nach oben springen, nicht nach jeder Änderung
}

function sichtbar(id) {
  return !$(id).classList.contains('versteckt');
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

function tourAnzeigen(tour) {
  const kunden = tour.kunden;
  const fertig = tour.naechste >= kunden.length;
  const von = tour.naechste + 1;
  const bis = Math.min(tour.naechste + PRO_ROUTE, kunden.length);

  const knopf = $('knopf-naechste');
  knopf.classList.toggle('versteckt', fertig);
  knopf.textContent = tour.naechste === 0
    ? `▶️ Route starten (Kunde ${von}–${bis})`
    : `▶️ Nächste 10 Kunden (${von}–${bis})`;

  $('tour-stand').textContent = fertig
    ? `✅ Alle ${kunden.length} Kunden sind abgearbeitet.`
    : `${kunden.length} Kunden erkannt. Noch ${kunden.length - tour.naechste} übrig.`;
  if (tour.stopps && tour.stopps > kunden.length) {
    $('tour-stand').textContent += ` ⚠️ Laut Liste sind es ${tour.stopps} Stopps – ${tour.stopps - kunden.length} fehlen.`;
  }

  $('knopf-nochmal').classList.toggle('versteckt', !tour.letzteRoute);
  $('knopf-fotos-pruefen').classList.toggle('versteckt', !fotosPassen(tour));

  const loeschen = new Date(loeschZeitpunkt(tour)).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  $('loesch-info').textContent = `🔒 Die Kundenadressen werden automatisch gelöscht: ${loeschen} Uhr`;

  // Liste aller Kunden. Erledigte werden grau durchgestrichen.
  const aktuellerStart = tour.letzteRoute ? tour.letzteRoute[0] : 0;
  const liste = $('liste');
  liste.innerHTML = '';
  kunden.forEach((k, i) => {
    const li = document.createElement('li');
    const nr = document.createElement('b');
    nr.textContent = k.pos !== null ? k.pos + '.' : '?';
    li.append(nr, ' ' + k.adresse.replace(', Österreich', ''), ' ✏️');
    if (k.unsicher) {
      const hinweis = document.createElement('div');
      hinweis.className = 'warnung';
      hinweis.textContent = '⚠️ Straße nicht lesbar – antippen zum Ändern';
      li.append(hinweis);
    }
    if (i < aktuellerStart) li.classList.add('erledigt');
    if (tour.letzteRoute && i >= tour.letzteRoute[0] && i < tour.letzteRoute[1]) li.prepend('🚚 ');
    li.addEventListener('click', () => kundeBearbeiten(i));
    liste.append(li);
  });

  zeige('seite-tour');
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
      rahmen.append(markierung(s, k.quelle.box, k.unsicher ? 'unsicher' : 'ok', k.pos ?? '?', () => kundeBearbeiten(i)));
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
    loeschen: false,
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
    if (gefunden) {
      fenster.vorbelegen(gefunden.pos, gefunden.adresse, gefunden.unsicher
        ? '⚠️ Die Straße ist nicht lesbar. Bitte aus dem Ausschnitt abtippen.'
        : '✅ Gelesen. Bitte kurz mit dem Ausschnitt vergleichen.');
    } else {
      const pos = texte.map(positionFinden).find((p) => p !== null) ?? null;
      fenster.vorbelegen(pos, '', '✍️ Konnte nicht gelesen werden. Bitte aus dem Ausschnitt abtippen.');
    }
  } catch (e) {
    fenster.vorbelegen(null, '', '✍️ Bitte aus dem Ausschnitt abtippen.');
  }

  const antwort = await fenster.ergebnis;
  ausschnitt.freigeben();
  if (antwort.aktion !== 'speichern') return;

  const neu = {
    pos: antwort.pos,
    adresse: antwort.adresse,
    unsicher: false,
    quelle: { seite: si, box: { x0: seite.breite * 0.03, x1: seite.breite * 0.97, y0: y - h * 0.6, y1: y + h * 0.6 } },
  };
  const hinweis = kundeEinfuegen(tour, neu);
  tourSpeichern(tour);
  neuZeichnen();
  if (hinweis) alert(hinweis);
}


// ---------- Fenster zum Ändern oder Hinzufügen ----------

function dialogOeffnen({ titel, bild, info, loeschen }) {
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
  $('dialog-info').textContent = info || '';
  $('dialog-loeschen').classList.toggle('versteckt', !loeschen);
  $('dialog').classList.remove('versteckt');

  let offen = true;
  let selbstGetippt = false;
  $('dialog-pos').oninput = $('dialog-adresse').oninput = () => { selbstGetippt = true; };

  const ergebnis = new Promise((fertig) => {
    const schliessen = (aktion) => {
      const adresseText = $('dialog-adresse').value.trim();
      const posText = $('dialog-pos').value.trim();
      if (aktion === 'speichern' && !adresseText) {
        $('dialog-info').textContent = '⚠️ Bitte eine Adresse eingeben.';
        return;
      }
      offen = false;
      $('dialog').classList.add('versteckt');
      fertig({
        aktion,
        pos: /^\d{1,3}$/.test(posText) ? Number(posText) : null,
        adresse: /österreich/i.test(adresseText) ? adresseText : adresseText + ', Österreich',
      });
    };
    $('dialog-ok').onclick = () => schliessen('speichern');
    $('dialog-loeschen').onclick = () => schliessen('loeschen');
    $('dialog-abbrechen').onclick = () => schliessen(null);
  });

  return {
    ergebnis,
    // Felder ausfüllen, aber nur, wenn man noch nicht selbst etwas getippt hat
    vorbelegen(pos, adresse, text) {
      if (!offen) return;
      if (!selbstGetippt) {
        $('dialog-pos').value = pos ?? '';
        $('dialog-adresse').value = (adresse || '').replace(', Österreich', '');
      }
      if (text) $('dialog-info').textContent = text;
    },
  };
}


// ---------- Kunden ändern, löschen, hinzufügen ----------

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

// Kunde antippen (in der Liste oder im Foto) -> ändern oder löschen
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

  const fenster = dialogOeffnen({
    titel: 'Kunde ändern',
    bild: ausschnitt,
    info: kunde.unsicher ? '⚠️ Die Straße war nicht lesbar. Bitte ergänzen.' : '',
    loeschen: true,
  });
  fenster.vorbelegen(kunde.pos, kunde.adresse);
  const antwort = await fenster.ergebnis;
  if (ausschnitt) ausschnitt.freigeben();

  let hinweis = '';
  if (antwort.aktion === 'loeschen') {
    if (!confirm('Diesen Kunden aus der Tour löschen?')) return;
    kundeEntfernen(tour, nummer);
  } else if (antwort.aktion === 'speichern') {
    const geaendert = { ...kunde, pos: antwort.pos, adresse: antwort.adresse, unsicher: false };
    if (antwort.pos !== kunde.pos && nummer >= tour.naechste) {
      // Neue Pos.-Nummer: Kunde an die richtige Stelle umsortieren
      kundeEntfernen(tour, nummer);
      hinweis = kundeEinfuegen(tour, geaendert);
    } else {
      tour.kunden[nummer] = geaendert;
    }
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
    loeschen: false,
  });
  const antwort = await fenster.ergebnis;
  if (antwort.aktion !== 'speichern') return;

  const hinweis = kundeEinfuegen(tour, { pos: antwort.pos, adresse: antwort.adresse, unsicher: false });
  tourSpeichern(tour);
  neuZeichnen();
  if (hinweis) alert(hinweis);
}

$('knopf-dazu').addEventListener('click', kundeHinzufuegen);
$('knopf-fotos-pruefen').addEventListener('click', pruefungAnzeigen);
$('knopf-pruefen-fertig').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (tour) tourAnzeigen(tour);
  else startbildschirm();
});


// ---------- Fotos machen ----------

$('knopf-foto').addEventListener('click', () => $('kamera').click());

$('kamera').addEventListener('change', (e) => {
  const datei = e.target.files[0];
  e.target.value = ''; // damit man gleich das nächste Foto machen kann
  if (!datei) return;

  fotos.push(datei);
  const bild = document.createElement('img');
  bild.src = URL.createObjectURL(datei);
  $('vorschau').append(bild);

  $('foto-zahl').textContent = fotos.length === 1
    ? '1 Seite fotografiert. Nächste Seite fotografieren oder „Fertig“ drücken.'
    : `${fotos.length} Seiten fotografiert. Nächste Seite fotografieren oder „Fertig“ drücken.`;
  $('knopf-fertig').disabled = false;
});

$('knopf-fertig').addEventListener('click', fotosLesen);


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

    const w = await texterkennungLaden();
    const alleZeilen = []; // { text, seite, box }
    const seiten = [];
    for (seite = 0; seite < fotos.length; seite++) {
      const leinwand = await bildVorbereiten(fotos[seite]);
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
    if (kunden.length === 0) {
      seiten.forEach((s) => URL.revokeObjectURL(s.url));
      throw new Error('Auf den Fotos wurden keine Adressen gefunden. Bitte nochmal gerade, hell und scharf fotografieren.');
    }

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

    // Zeilen mit Pos. und Kundennummer, aus denen kein Kunde wurde -> später rot markieren
    const fehlend = alleZeilen
      .filter((z, i) => !benutzt.has(i) && POS_NR.test(zeileBereinigen(z.text)))
      .map((z) => ({ seite: z.seite, box: z.box }));

    // Unten auf der Liste steht "Anzahl Stopps 16". Damit merken wir, ob Kunden fehlen.
    const stopps = alleZeilen.map((z) => z.text).join(' ').match(/Anzahl\s+Stopps\s+(\d{1,3})/i);

    const tour = {
      kunden,
      naechste: 0,
      letzteRoute: null,
      stopps: stopps ? Number(stopps[1]) : null,
      erstellt: Date.now(),
    };
    tourSpeichern(tour);

    pruefungVerwerfen();
    pruefung = { tourId: tour.erstellt, seiten, fehlend };

    fotos = [];
    $('vorschau').querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
    $('vorschau').innerHTML = '';
    $('knopf-fertig').disabled = true;
    if (navigator.vibrate) navigator.vibrate(300);
    pruefungAnzeigen();
  } catch (e) {
    zeige('seite-fotos');
    fehler(e.message);
  }
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
const POS_NR = /(?:^|[^\d+])(\d{1,3})\s+[0-9A-Za-z]\d{4}(?!\d)/;

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

// Findet die Kunden in den Textzeilen.
// Jeder Kunde merkt sich in "zeilen", aus welchen Zeilen er stammt.
// In "benutzt" landen alle Zeilen, die zu einem Kunden gehören.
function findeKunden(zeilen, benutzt = new Set()) {
  zeilen = zeilen.map(zeileBereinigen);

  const gefunden = [];
  zeilen.forEach((zeile, i) => {
    const t = zeile.match(PLZ_ORT);
    if (!t) return;
    const plz = t[2];
    const ort = t[3];
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

    // Die Pos. steht in derselben Zeile oder (wenn die Zeile umgebrochen wurde) eine Zeile darüber
    let pos = positionFinden(davor);
    if (pos === null && vorige) {
      pos = positionFinden(vorige);
      if (pos !== null) vorigeBenutzt = true;
    }

    // Weder Straße noch Pos.: das ist wahrscheinlich gar keine Kundenzeile
    if (!strasse && pos === null) return;

    const herkunft = vorigeBenutzt ? [i - 1, i] : [i];
    herkunft.forEach((nr) => benutzt.add(nr));

    // Straße nicht lesbar: Kunde trotzdem aufnehmen, Google Maps fährt dann in den Ort
    gefunden.push({
      pos,
      adresse: strasse ? `${strasse}, ${plz} ${ort}, Österreich` : `${plz} ${ort}, Österreich`,
      unsicher: !strasse,
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

function routeOeffnen(tour, von, bis) {
  tour.letzteRoute = [von, bis];
  tour.naechste = Math.max(tour.naechste, bis);
  tour.zuletztGeoeffnet = Date.now();
  tourSpeichern(tour);
  tourAnzeigen(tour);
  window.location.href = mapsLink(tour.kunden.slice(von, bis));
}

$('knopf-naechste').addEventListener('click', () => {
  const tour = aktuelleTour();
  if (!tour) return startbildschirm();
  routeOeffnen(tour, tour.naechste, Math.min(tour.naechste + PRO_ROUTE, tour.kunden.length));
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
  fehler('');
  zeige('seite-fotos');
});


// ---------- Beim Öffnen der App ----------

$('version').textContent = 'Version ' + VERSION;

function startbildschirm() {
  if (!$('dialog').classList.contains('versteckt')) return; // Fenster offen: nicht stören
  const tour = aktuelleTour();
  if (tour) {
    if (sichtbar('seite-pruefen') && fotosPassen(tour)) return; // beim Prüfen bleiben
    tourAnzeigen(tour);
  } else if (!sichtbar('seite-lesen') && !sichtbar('seite-fotos')) {
    zeige('seite-fotos'); // Tour ist abgelaufen oder gelöscht
  } else if (!sichtbar('seite-lesen')) {
    zeige('seite-fotos');
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
