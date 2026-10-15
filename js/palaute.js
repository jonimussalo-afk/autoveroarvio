// Kauppiaiden arviot (koulutustila).
//
// Kauppias syöttää auton, näkee laskurin arvion ja antaa oman, kokemukseensa perustuvan arvionsa autoverosta.
// Arvio muutetaan verotusarvoksi (vero / veroprosentti) ja sitä käytetään laskurissa verrokkina, jonka lähde on
// "kauppiaan arvio". Harvinaisissa autoissa verrokkeja on vähän, joten kauppiaan arvio vaikuttaa niissä eniten.
//
// Sama tiedosto toimii selaimessa (tallennus selaimen muistiin) ja kuukausiajossa (Node), jossa arviot luetaan
// kansiosta data/palaute/.

import { yhdistaAineisto, normalisoiMalli, pvmMerkkijonosta } from "./malli.js";
import { yhtenaistaMerkki } from "./apu.js";

export const PALAUTE_VERSIO = 1;
const AVAIN = "autoveroarvio.palaute.v1";
const KAUPPIAS_AVAIN = "autoveroarvio.kauppias.v1";
const PAIVA_MS = 86400000;

// ---------- tallennus selaimeen ----------

let muisti = []; // varalla, jos selaimen muisti ei ole käytettävissä (esim. yksityinen ikkuna)

function varasto() {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.setItem("__autoveroarvio", "1");
    localStorage.removeItem("__autoveroarvio");
    return localStorage;
  } catch {
    return null;
  }
}

/** Onko selaimen pysyvä muisti käytössä (muuten arviot säilyvät vain sivun auki ollessa). */
export function pysyvaTallennus() {
  return varasto() !== null;
}

export function luePalautteet() {
  const v = varasto();
  if (!v) return muisti.slice();
  try {
    const lista = JSON.parse(v.getItem(AVAIN) || "[]");
    return Array.isArray(lista) ? lista.filter((p) => tarkistaPalaute(p).ok) : [];
  } catch {
    return [];
  }
}

export function tallennaPalautteet(lista) {
  const v = varasto();
  muisti = lista.slice();
  if (!v) return false;
  try { v.setItem(AVAIN, JSON.stringify(lista)); return true; } catch { return false; }
}

/** Satunnainen, nimetön kauppiastunnus (sama selaimessa). Ei sisällä henkilö- tai yritystietoja. */
export function kauppiasTunnus() {
  const v = varasto();
  let t = v ? v.getItem(KAUPPIAS_AVAIN) : null;
  if (!t) {
    t = "K-" + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, "0");
    if (v) try { v.setItem(KAUPPIAS_AVAIN, t); } catch { /* ei tallennusta */ }
  }
  return t;
}

export const uusiId = () => 1 + Math.floor(Math.random() * 2147483646);

// ---------- tarkistus ----------

const PVM = /^\d{4}-\d{2}-\d{2}$/;
const onLuku = (x, min, max) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;

/** Tarkistaa arvion rakenteen. Palauttaa { ok, virhe }. */
export function tarkistaPalaute(p) {
  if (!p || typeof p !== "object") return { ok: false, virhe: "ei arvio" };
  if (!Number.isInteger(p.id) || p.id <= 0) return { ok: false, virhe: "tunniste puuttuu" };
  const a = p.auto || {};
  if (!a.merkki || !a.malli || typeof a.merkki !== "string" || typeof a.malli !== "string") return { ok: false, virhe: "merkki tai malli puuttuu" };
  if (!onLuku(a.kw, 10, 1500)) return { ok: false, virhe: "teho" };
  if (!a.kayttovoima) return { ok: false, virhe: "käyttövoima" };
  if (!PVM.test(a.ensirek || "")) return { ok: false, virhe: "ensirekisteröinti" };
  if (!onLuku(a.km, 0, 3000000)) return { ok: false, virhe: "ajokilometrit" };
  if (!PVM.test(p.annettu || "")) return { ok: false, virhe: "päivämäärä" };
  if (!onLuku(p.veroprosentti, 0.1, 100)) return { ok: false, virhe: "veroprosentti" };
  if (!onLuku(p.kauppiaanVero, 1, 2000000)) return { ok: false, virhe: "kauppiaan arvio" };
  if (a.ensirek > p.annettu) return { ok: false, virhe: "ensirekisteröinti on arvion jälkeen" };
  return { ok: true };
}

/** Kauppiaan arviosta johdettu verotusarvo: vero / veroprosentti. */
export const arvoKauppiaalta = (p) => p.kauppiaanVero / (p.veroprosentti / 100);

// ---------- arviot verrokkiriveiksi ----------

const pvmLuvuksi = (s) => Number(String(s).slice(0, 10).replaceAll("-", ""));

/**
 * Muuntaa arviot samaan sarakemuotoon kuin Verohallinnon päätökset (data/merkit/*.json), lähde = 1.
 * Päätöspäiväksi tulee arvion antopäivä.
 */
export function palautteetTiedostoksi(lista) {
  const SAN = ["merkki", "malli", "kayttovoima", "korimalli", "vetotapa", "vaihteisto"];
  const sanastot = Object.fromEntries(SAN.map((c) => [c, []]));
  const hak = Object.fromEntries(SAN.map((c) => [c, new Map()]));
  const koodaa = (c, v) => {
    const arvo = v == null ? "" : String(v);
    let i = hak[c].get(arvo);
    if (i === undefined) { i = sanastot[c].length; sanastot[c].push(arvo); hak[c].set(arvo, i); }
    return i;
  };
  const S = Object.fromEntries([...SAN, "kw", "cm3", "ovet", "ensirek", "paatos", "km", "arvo", "veropros", "lahde", "palauteId"]
    .map((c) => [c, []]));
  for (const p of lista) {
    const a = p.auto;
    S.merkki.push(koodaa("merkki", yhtenaistaMerkki(a.merkki)));
    S.malli.push(koodaa("malli", String(a.malli).toUpperCase().trim()));
    S.kayttovoima.push(koodaa("kayttovoima", a.kayttovoima));
    S.korimalli.push(koodaa("korimalli", a.korimalli || ""));
    S.vetotapa.push(koodaa("vetotapa", a.vetotapa || ""));
    // Tuntematon vaihteisto omana luokkanaan, ettei se sekoitu käsivaihteiston ("") kanssa
    S.vaihteisto.push(koodaa("vaihteisto", a.vaihteisto === "AUT" ? "AUT" : a.vaihteisto === "" ? "" : "?"));
    S.kw.push(a.kw);
    S.cm3.push(a.cm3 > 0 ? a.cm3 : 0);
    S.ovet.push(a.ovet > 0 ? a.ovet : 0);
    S.ensirek.push(pvmLuvuksi(a.ensirek));
    S.paatos.push(pvmLuvuksi(p.annettu));
    S.km.push(Math.round(a.km / 100) / 10); // tuhansina kuten päätöksissä
    S.arvo.push(Math.round(arvoKauppiaalta(p)));
    S.veropros.push(p.veroprosentti);
    S.lahde.push(1);
    S.palauteId.push(p.id);
  }
  return { merkki: null, rivit: lista.length, sanastot, sarakkeet: S };
}

// ---------- toteutuneen päätöksen etsiminen ----------

/**
 * Etsii Verohallinnon päätöksen, joka on todennäköisesti tehty samasta autosta arvion antamisen jälkeen
 * (sama malli ja teho, ensirekisteröinti saman kuukauden sisällä, kilometrit lähellä). Palauttaa rivin tai −1.
 */
export function etsiToteutunut(aineisto, p) {
  const { A, hakemisto } = aineisto;
  const merkki = yhtenaistaMerkki(p.auto.merkki);
  const mi = hakemisto.malli.get(merkki + "|" + normalisoiMalli(String(p.auto.malli).toUpperCase().trim()));
  const bi = hakemisto.merkki.get(merkki);
  if (mi === undefined || bi === undefined) return -1;
  const kw = p.auto.kw, ensirek = pvmMerkkijonosta(p.auto.ensirek), km = p.auto.km / 1000;
  const annettu = pvmMerkkijonosta(p.annettu);
  let paras = -1, parasEtaisyys = Infinity;
  for (let g = 0; g < 3; g++) {
    for (const r of aineisto.merkkiRyhma.get(bi * 3 + g) || []) {
      if (A.lahde[r] || A.malli[r] !== mi) continue;
      if (Math.abs(A.kw[r] - kw) > Math.max(1, 0.01 * kw)) continue;
      const dE = Math.abs(A.ensirek[r] - ensirek) / PAIVA_MS;
      if (dE > 45) continue;
      const dKm = Math.abs(A.km[r] - km);
      if (dKm > Math.max(3, 0.05 * km)) continue;
      const dP = (A.paatos[r] - annettu) / PAIVA_MS;
      if (dP < -30 || dP > 400) continue;
      const etaisyys = dE / 45 + dKm / Math.max(3, 0.05 * km) + Math.abs(dP) / 400;
      if (etaisyys < parasEtaisyys) { parasEtaisyys = etaisyys; paras = r; }
    }
  }
  return paras;
}

// ---------- merkin aineisto selaimessa ----------

/**
 * Yhdistää merkin julkaistut tiedot (Verohallinnon päätökset ja jo julkaistut kauppiaiden arviot) ja tämän
 * selaimen omat arviot. Omat arviot ohitetaan, jos ne on jo julkaistu tai jos samasta autosta on jo tehty päätös.
 */
export function merkkiAineisto(json, merkki, omat = luePalautteet()) {
  const julkaistut = new Set(json && json.sarakkeet.palauteId ? json.sarakkeet.palauteId.filter(Boolean) : []);
  const tiedostot = json ? [json] : [];
  const perus = yhdistaAineisto(tiedostot);
  const kaytettavat = omat.filter((p) => yhtenaistaMerkki(p.auto.merkki) === merkki && !julkaistut.has(p.id)
    && etsiToteutunut(perus, p) < 0);
  if (!kaytettavat.length) return perus;
  return yhdistaAineisto([...tiedostot, palautteetTiedostoksi(kaytettavat)]);
}

// ---------- vienti ja tuonti ----------

/** Lähetettävä tiedosto: vain auton tiedot, laskurin ja kauppiaan arviot. Huomiot jäävät selaimeen. */
export function vientiJson(lista) {
  const siivottu = lista.map(({ huomio, lahetetty, ...p }) => p);
  return JSON.stringify({ versio: PALAUTE_VERSIO, luotu: new Date().toISOString(), palautteet: siivottu }, null, 1);
}

/** Lukee tiedoston (oma vienti tai lista). Palauttaa kelvolliset arviot. */
export function tuoJson(teksti) {
  const data = JSON.parse(teksti);
  const lista = Array.isArray(data) ? data : Array.isArray(data.palautteet) ? data.palautteet : [];
  return lista.filter((p) => tarkistaPalaute(p).ok);
}

/** Yhdistää arviolistat tunnisteen mukaan (samalla tunnisteella uudempi antopäivä voittaa). */
export function yhdistaPalautteet(...listat) {
  const kartta = new Map();
  for (const lista of listat) for (const p of lista) {
    const vanha = kartta.get(p.id);
    if (!vanha || (p.annettu || "") >= (vanha.annettu || "")) kartta.set(p.id, { ...vanha, ...p });
  }
  return [...kartta.values()].sort((a, b) => (a.annettu < b.annettu ? 1 : a.annettu > b.annettu ? -1 : 0));
}

/** Onko kaksi arviota samasta autosta (korvataan vanha uudella). */
export function samaAuto(p, q) {
  const a = p.auto, b = q.auto;
  return yhtenaistaMerkki(a.merkki) === yhtenaistaMerkki(b.merkki)
    && normalisoiMalli(String(a.malli).toUpperCase()) === normalisoiMalli(String(b.malli).toUpperCase())
    && Math.abs(a.kw - b.kw) <= 1 && a.ensirek === b.ensirek && Math.abs(a.km - b.km) <= Math.max(500, 0.01 * a.km);
}
