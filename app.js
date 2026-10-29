// Touren-App: Fotos der Tourenübersicht -> Adressen -> Google Maps
// Alles läuft im Handy-Browser. Es gibt keinen Server.

const PRO_ROUTE = 10;            // So viele Kunden schickt die App auf einmal an Google Maps
const SPEICHER_NAME = 'tour-v1'; // Unter diesem Namen merkt sich das Handy die Tour

let fotos = [];      // Die Fotos, die gerade gemacht wurden
let worker = null;   // Die Texterkennung (wird erst beim ersten Mal geladen)
let fortschritt = () => {};

const $ = (id) => document.getElementById(id);


// ---------- Speichern und Laden ----------

function tourLaden() {
  try {
    return JSON.parse(localStorage.getItem(SPEICHER_NAME));
  } catch (e) {
    return null;
  }
}

function tourSpeichern(tour) {
  try {
    if (tour) localStorage.setItem(SPEICHER_NAME, JSON.stringify(tour));
    else localStorage.removeItem(SPEICHER_NAME);
  } catch (e) {
    // Wenn das Handy nichts speichern lässt, läuft die App trotzdem weiter
  }
}


// ---------- Bildschirme umschalten ----------

function zeige(seite) {
  for (const id of ['seite-fotos', 'seite-lesen', 'seite-tour']) {
    $(id).classList.toggle('versteckt', id !== seite);
  }
}

function fehler(text) {
  $('fehler').textContent = text || '';
  $('fehler').classList.toggle('versteckt', !text);
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
    $('tour-stand').textContent += ` ⚠️ Laut Liste sind es ${tour.stopps} Stopps – ${tour.stopps - kunden.length} fehlen. Bitte „Neue Tour“ und schärfer fotografieren.`;
  }

  $('knopf-nochmal').classList.toggle('versteckt', !tour.letzteRoute);

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
    li.addEventListener('click', () => adresseAendern(i));
    liste.append(li);
  });

  zeige('seite-tour');
}

// Adresse antippen -> von Hand ändern oder löschen
function adresseAendern(nummer) {
  const tour = tourLaden();
  if (!tour) return;
  const kunde = tour.kunden[nummer];
  const neu = prompt(
    'Adresse ändern (Straße Hausnummer, PLZ Ort).\nLeer lassen und OK drücken = Kunde löschen.',
    kunde.adresse.replace(', Österreich', '')
  );
  if (neu === null) return; // "Abbrechen" gedrückt

  const text = neu.trim();
  if (text === '') {
    if (!confirm('Diesen Kunden aus der Tour löschen?')) return;
    tour.kunden.splice(nummer, 1);
    // Die Zähler für erledigte Kunden rutschen mit, wenn davor etwas gelöscht wurde
    if (nummer < tour.naechste) tour.naechste--;
    if (tour.letzteRoute) {
      if (nummer < tour.letzteRoute[0]) tour.letzteRoute[0]--;
      if (nummer < tour.letzteRoute[1]) tour.letzteRoute[1]--;
    }
  } else {
    kunde.adresse = /österreich/i.test(text) ? text : text + ', Österreich';
    kunde.unsicher = false;
  }
  tourSpeichern(tour);
  tourAnzeigen(tour);
}

// Kunde, den die Texterkennung übersehen hat, von Hand dazunehmen
function kundeHinzufuegen() {
  const tour = tourLaden();
  if (!tour) return;

  const adresse = prompt('Adresse des fehlenden Kunden (Straße Hausnummer, PLZ Ort):', '');
  if (adresse === null || adresse.trim() === '') return;

  const posText = prompt('Pos.-Nummer von der Liste (z. B. 25).\nUnbekannt? Leer lassen, dann kommt der Kunde ans Ende.', '');
  if (posText === null) return;
  const pos = /^\d{1,3}$/.test(posText.trim()) ? Number(posText.trim()) : null;

  const kunde = {
    pos,
    adresse: /österreich/i.test(adresse) ? adresse.trim() : adresse.trim() + ', Österreich',
    unsicher: false,
  };

  // Passende Stelle nach Pos. suchen
  let stelle = tour.kunden.length;
  if (pos !== null) {
    const naechsterGroesserer = tour.kunden.findIndex((k) => k.pos !== null && k.pos > pos);
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
  tourSpeichern(tour);
  tourAnzeigen(tour);
  if (hinweis) alert(hinweis);
}

$('knopf-dazu').addEventListener('click', kundeHinzufuegen);


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
  worker = await Tesseract.createWorker('deu', 1, {
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
    let alleZeilen = [];
    for (seite = 0; seite < fotos.length; seite++) {
      const leinwand = await bildVorbereiten(fotos[seite]);
      const ergebnis = await w.recognize(leinwand);
      alleZeilen = alleZeilen.concat(ergebnis.data.text.split('\n'));
    }

    const kunden = findeKunden(alleZeilen);
    if (kunden.length === 0) {
      throw new Error('Auf den Fotos wurden keine Adressen gefunden. Bitte nochmal gerade, hell und scharf fotografieren.');
    }

    // Unten auf der Liste steht "Anzahl Stopps 16". Damit merken wir, ob Kunden fehlen.
    const stopps = alleZeilen.join(' ').match(/Anzahl\s+Stopps\s+(\d{1,3})/i);

    const tour = { kunden, naechste: 0, letzteRoute: null, stopps: stopps ? Number(stopps[1]) : null };
    tourSpeichern(tour);
    fotos = [];
    $('vorschau').innerHTML = '';
    if (navigator.vibrate) navigator.vibrate(300);
    tourAnzeigen(tour);
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
  const treffer = text.match(POS_NR);
  return treffer ? Number(treffer[1]) : null;
}

function findeKunden(zeilen) {
  // Tabellenstriche und doppelte Leerzeichen entfernen
  zeilen = zeilen.map((z) => z.replace(/[|\[\]{}_]/g, ' ').replace(/\s+/g, ' ').trim());

  const gefunden = [];
  zeilen.forEach((zeile, i) => {
    const t = zeile.match(PLZ_ORT);
    if (!t) return;
    const plz = t[2];
    const ort = t[3];
    const davor = zeile.slice(0, t.index + t[1].length).replace(/[,\s]+$/, '');
    const danach = zeile.slice(t.index + t[0].length);
    const vorige = i > 0 && !PLZ_ORT.test(zeilen[i - 1]) ? zeilen[i - 1] : '';

    // Die Straße steht meistens vor der PLZ, manchmal danach oder eine Zeile darüber
    let strasse = strasseFinden(davor);
    if (!strasse) {
      const nachher = danach.match(/^[,\s]*([A-ZÄÖÜ][^\d]{2,40}?\s\d+[a-zA-Z]?)/);
      if (nachher) strasse = nachher[1].trim();
    }
    if (!strasse && vorige) strasse = strasseFinden(vorige);

    // Die Pos. steht in derselben Zeile oder (wenn die Zeile umgebrochen wurde) eine Zeile darüber
    let pos = positionFinden(davor);
    if (pos === null && vorige) pos = positionFinden(vorige);

    // Weder Straße noch Pos.: das ist wahrscheinlich gar keine Kundenzeile
    if (!strasse && pos === null) return;

    // Straße nicht lesbar: Kunde trotzdem aufnehmen, Google Maps fährt dann in den Ort
    gefunden.push({
      pos,
      adresse: strasse ? `${strasse}, ${plz} ${ort}, Österreich` : `${plz} ${ort}, Österreich`,
      unsicher: !strasse,
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
  tourSpeichern(tour);
  tourAnzeigen(tour);
  window.location.href = mapsLink(tour.kunden.slice(von, bis));
}

$('knopf-naechste').addEventListener('click', () => {
  const tour = tourLaden();
  if (!tour) return;
  routeOeffnen(tour, tour.naechste, Math.min(tour.naechste + PRO_ROUTE, tour.kunden.length));
});

$('knopf-nochmal').addEventListener('click', () => {
  const tour = tourLaden();
  if (tour && tour.letzteRoute) routeOeffnen(tour, tour.letzteRoute[0], tour.letzteRoute[1]);
});

$('knopf-neu').addEventListener('click', () => {
  if (!confirm('Die ganze Tour löschen und eine neue anfangen?')) return;
  tourSpeichern(null);
  fehler('');
  zeige('seite-fotos');
});


// ---------- Beim Öffnen der App ----------

const gespeichert = tourLaden();
if (gespeichert && gespeichert.kunden && gespeichert.kunden.length) {
  tourAnzeigen(gespeichert);
} else {
  zeige('seite-fotos');
}

// Damit die App vom Home-Bildschirm aus wie eine echte App funktioniert
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
