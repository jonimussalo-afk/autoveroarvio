// Verotusarvon arviomalli, joka on rakennettu erityisesti harvinaisille autoille.
//
// Periaate lyhyesti:
// 1. Jokainen aiempi verotuspäätös "siirretään" kohdeauton ikään, ajokilometreihin, tehoon ja
//    verotushetkeen. Siirrossa käytetään kertoimia, jotka opitaan koko aineistosta vertaamalla
//    saman mallin autoja keskenään (mallin hintataso ei sotke ikä- ja kilometrivaikutusta).
// 2. Verrokit jaetaan neljään tasoon: sama malli, sama mallisarja, saman merkin muut autot ja
//    kaikki merkit. Mitä vähemmän lähellä olevia verrokkeja on, sitä enemmän arvio nojaa
//    ylemmän tason tietoon (porrastettu kutistus).
// 3. Vaihteluväli perustuu mitattuun osumatarkkuuteen: jokainen aineiston päätös on ennustettu
//    ilman sitä itseään, ja virheiden jakauma on tallennettu tukitasoittain.
//
// Tiedosto toimii sekä selaimessa että Nodessa (ES-moduuli).

import { paastoVeroprosentista } from "./verotaulukot.js";

export const VERSIO = "1.3.0";
const VUOSI_MS = 365.25 * 86400000;
const AIKA_ALKU = Date.UTC(2020, 0, 1);

export const TASOT = ["malli", "sarja", "merkki", "kaikki"];
export const TASO_NIMET = {
  malli: "Sama malli",
  sarja: "Sama mallisarja",
  merkki: "Merkin muut mallit",
  kaikki: "Kaikki merkit",
};
export const RYHMAT = ["EV", "HYB", "ICE"];

// Säätöarvot. Kutistusvoimakkuudet (k) on valittu tarkkuustestin perusteella.
export const ASETUKSET = {
  solmut: [1, 2, 3, 5, 8, 12, 20],
  kmKatto: 40, // 400 000 km
  kutistus: { merkki: 2, sarja: 1, malli: 0.25 },
  tehoHajonta: { malli: 0.08, sarja: 0.1, merkki: 0.15, kaikki: 0.1 },
  ikaHajontaMin: 1.0,
  ikaHajontaOsuus: 0.25,
  puoliintumisKk: 18,
  koriKerroin: 0.3,
  vetoKerroin: 0.6,
  maxVerrokit: 4000,
  // Iskutilavuus, vaihteisto ja ovet (kohta 2)
  kaytaCm3: true,
  cm3Hajonta: { malli: 0.1, sarja: 0.15, merkki: 0.25 },
  vaihteistoKerroin: 0.5,
  ovetKerroin: 0.8,
  // Päästöt veroprosentista (kohta 3); hajonta log-asteikolla käyttövoimaryhmittäin
  kaytaPaasto: true,
  paastoHajonta: { ICE: 0.12, HYB: 0.35 },
  pehmeaLattia: 0.02,
  // Iskutilavuus ja päästöt myös siirtokertoimina merkin ja kaikkien merkkien tasolla
  lisaPiirteet: ["cm3", "paasto"],
  // Kuukausittainen hintaindeksi (kohta 1)
  indeksiTasoitus: 300,
  indeksiKierrokset: 6,
  // Siirtokertoimien opetuksessa tuoreet päätökset painavat enemmän (puoliintumisaika kuukausina)
  koulutusPuoliintumisKk: 12,
  // Mukautuva tuoreus: jos saman mallin tuoreita päätöksiä on vähintään tuoreRaja, käytetään lyhyempää puoliintumisaikaa
  tuoreRaja: 2,
  puoliintumisKkRunsas: 4,
  // Poisjättötestissä ja vaihteluvälien laskennassa käytetään viimeisten kuukausien päätöksiä
  kalibrointiKk: 48,
  kalibrointiMinRyhma: 60,
  // Tehon ääripäät (kohta 1): jos teho on saman mallin aiempien päätösten tehoalueen ulkopuolella
  // (toleranssi log-asteikolla), arvioon tehdään oma harhakorjaus erikseen ylä- ja alapuolelle ja väliä
  // levennetään. Tehon vaikutuksen vaimennus (tehoVaimennus < 1) ja saman version lisäpaino (versioPaino)
  // kokeiltiin, mutta ne eivät parantaneet tarkkuutta, joten ne ovat pois päältä.
  tehoVaimennus: 1,
  tehoToleranssi: 0.03,
  ulkonaLevennys: 1.7,
  ulkonaSuunnittain: true,
  // Harhakorjaus suunnittain: alapuolella korjaus paransi molempia testijaksoja, yläpuolella harha vaihteli
  // jaksosta toiseen (korjaus heikensi toista jaksoa), joten siellä vain väliä levennetään.
  ulkonaHarha: { yli: false, ali: true },
  versioPaino: 0,
  // Ensirekisteröinnin läheisyys verrokin painona (0 = pois; kokeiltu, ei parantanut tarkkuutta)
  ensirekHajonta: { malli: 0, sarja: 0, merkki: 0 },
  ensirekLattia: 0.05,
  // Kauppiaiden arviot (koulutustila). Laskuri vertaa kauppiaan arviota omaan arvioonsa samasta autosta ja
  // korjaa lähes samanlaisten autojen arvioita erotuksen mukaan (jäännöskorjaus). Korjaus kutistetaan kohti
  // nollaa kertoimella k0 × tukiKerroin[tukitaso]: yleisissä malleissa (tuki A) laskuri on jo tarkka, joten
  // kauppiaan arvio ei korjaa niitä lainkaan; harvinaisissa (C–E) korjaus on voimakkain. Läheisyys: teho (log),
  // ikä (vuotta), ajokilometrit (log) ja arvion tuoreus. Kun kauppiaiden arvioita on verrattu toteutuneisiin
  // päätöksiin, kuukausiajo säätää kutistusta osuvuuden mukaan (malli.kauppiasKutistus).
  // verrokkina: käytetäänkö arviota myös tavallisena verrokkina (kokeiltu, ei parantanut tarkkuutta).
  kauppias: {
    korjaus: true, k0: 1.5, tukiKerroin: { A: Infinity, B: 4, C: 1.5, D: 1, E: 1 },
    puolitus: 4, // käytetään, jos tukiKerroin = null: kutistus kasvaa lähellä olevien päätösten määrän mukaan
    sarjaPaino: 0.3, kwHajonta: 0.05, ikaHajonta: 1.5, kmHajonta: 0.7, puoliintumisKk: 12,
    verrokkina: false, paino: 1,
  },
  // Kohta 2: mallisukupolvet. Mallin hintatasossa (ikä, km ja teho huomioiden) näkyvät portaat
  // ensirekisteröintipäivän mukaan tulkitaan sukupolven tai mallipäivityksen vaihdoksiksi.
  sukupolvi: {
    minN: 40, minOsa: 15, minHyppy: 0.05, rangaistus: 5, maxRajat: 3,
    kerroin: 0.3, // eri sukupolven verrokin painokerroin (1 = ei vaikutusta)
    siirto: false, // siirretäänkö eri sukupolven verrokin arvo portaan verran
    tasot: ["malli"],
  },
  // Mallikohtainen paikallinen sovitus (Verohallinnon merkki- ja mallikohtaisen mallin jäljittely):
  // saman mallin verrokeista sovitetaan oma ikä-, kilometri-, teho- ja aikavaikutus, joka kutistetaan
  // kohti yleisiä kertoimia. priori = sallittu poikkeama yleisestä kertoimesta (log-asteikko):
  // ikä / vuosi, km / 10 000 km, teho (log), aika / vuosi.
  paikallinen: { kaytossa: true, minLkm: 6, minEss: 3, sarjaPaino: 0, jaannos: 0.05,
    priori: [0.015, 0.005, 0.15, 0.025], ikaKaarevuus: 0.005, kmHajonta: 0, ikaLevennys: 1,
    // Lähes sama auto (sama teho, ikä ja kilometrit hyvin lähellä) saa lisäpainoa: Verohallinto arvottaa
    // tällaiset autot lähes samoin, joten ne kertovat kohdeauton arvon tarkimmin.
    tarkkaPaino: 10, tarkkaIka: 0.5, tarkkaKm: 0.25 },
  // Eri käyttövoima saman ryhmän sisällä (esim. bensiini ja diesel) saa pienemmän painon
  kayttovoimaKerroin: 1,
};

// ---------- apufunktiot ----------

export function pvmLuvusta(n) {
  const v = Math.floor(n / 10000), k = Math.floor(n / 100) % 100, p = n % 100;
  return Date.UTC(v, k - 1, p);
}

export function pvmMerkkijonosta(s) {
  const [v, k, p] = s.split("-").map(Number);
  return Date.UTC(v, k - 1, p || 1);
}

export function polttoaineryhma(kayttovoima) {
  const s = String(kayttovoima || "").toLowerCase();
  if (s === "sähkö" || s === "vety") return "EV";
  if (s.includes("sähkö")) return "HYB";
  return "ICE";
}

const YLEISSANAT = new Set(["MODEL", "SERIES", "SARJA", "CLASS", "NEW", "THE", "TYPE", "ID", "E", "GRAND"]);

export function mallisarja(merkki, malli) {
  const osat = String(malli).toUpperCase().split(/[\s/]+/).filter(Boolean);
  if (!osat.length) return "";
  let eka = osat[0];
  if (merkki === "BMW" && /^\d{3}[A-Z]*$/.test(eka)) return eka[0] + "-SARJA";
  if ((eka === "AMG" || eka === "MERCEDES-AMG") && osat[1]) return "AMG " + osat[1];
  if (YLEISSANAT.has(eka) && osat[1]) return eka + " " + osat[1];
  return eka;
}

export function normalisoiMalli(malli) {
  return String(malli || "").toUpperCase().replace(/\s+/g, " ").trim().replace(/^[ .,\-/]+|[ .,\-/]+$/g, "");
}

// Mallinimen sanat, jotka eivät yksinään erottele mallia (vetotapa, korimalli, varustetaso tms.)
const YLEISET_SANAT = new Set([
  "AMG", "4MATIC", "XDRIVE", "QUATTRO", "AWD", "4WD", "4X4", "FWD", "RWD", "ALLGRIP", "HYBRID", "PLUGIN", "PHEV",
  "HEV", "MHEV", "EV", "E", "D", "I", "S", "T", "A", "L", "X", "LONG", "RANGE", "SPORT", "LINE", "EDITION", "PREMIUM",
  "BUSINESS", "LUXURY", "COUPE", "CABRIO", "CABRIOLET", "SEDAN", "TOURING", "AVANT", "SPORTBACK", "ESTATE", "WAGON",
  "SW", "KOMBI", "LIM", "AUT", "AUTOMATIC", "DSG", "TDI", "TSI", "TFSI", "CDI", "PLUS", "MODEL", "SERIES", "CLASS",
  "NEW", "THE", "SE", "LE", "LX", "EX", "DUAL", "MOTOR", "BASE", "PRO", "MAX", "ALLTERRAIN", "SUV",
]);

export function malliSanat(malli) {
  return new Set(normalisoiMalli(malli).replace(/[+\-.,/()]/g, "").split(" ").filter(Boolean));
}

/**
 * Kuinka läheinen aineiston mallinimi on haettuun: "malli", "sarja" tai "merkki".
 * Sama malli: sanat ovat samat järjestyksestä riippumatta, tai toinen nimi sisältää toisen kaikki sanat
 * (esim. "911" ja "911 CARRERA S"). Teho erottelee tällöin versiot.
 * Sama sarja: sama mallisarja (ensimmäinen sana) tai yhteinen erotteleva sana.
 */
export function mallienLaheisyys(haku, haunSarja, ehdokas, ehdokkaanSarja) {
  let yhteiset = 0, erottelevia = 0, kirjaimellisia = 0;
  for (const s of haku) {
    if (!ehdokas.has(s)) continue;
    yhteiset++;
    if (!YLEISET_SANAT.has(s)) { erottelevia++; if (/[A-Z]/.test(s)) kirjaimellisia++; }
  }
  if (erottelevia > 0 && (yhteiset === haku.size || yhteiset === ehdokas.size)) return "malli";
  if (haunSarja === ehdokkaanSarja || kirjaimellisia > 0) return "sarja";
  return "merkki";
}

function piirteet(ika, km, lkw, solmut, ulos, alku = 0) {
  // Ikä paloittain lineaarisena, ajokilometrit ja teho (log ja sen neliö).
  // Verotushetken hintataso käsitellään erikseen kuukausittaisella hintaindeksillä.
  ulos[alku] = ika;
  for (let j = 0; j < solmut.length; j++) ulos[alku + 1 + j] = Math.max(0, ika - solmut[j]);
  ulos[alku + 1 + solmut.length] = Math.min(km, ASETUKSET.kmKatto * 10) / 10;
  ulos[alku + 2 + solmut.length] = lkw;
  ulos[alku + 3 + solmut.length] = (lkw - 5) * (lkw - 5);
  return ulos;
}
const PIIRRE_LKM = ASETUKSET.solmut.length + 4;

export function kuukausiNumero(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function indeksiArvo(indeksi, kk) {
  if (!indeksi) return 0;
  const i = Math.max(0, Math.min(indeksi.arvot.length - 1, kk - indeksi.alku));
  return indeksi.arvot[i];
}

// Korimallit, joiden autoja ei verrata muihin korimalleihin (esim. matkailuautot)
export const ERIKOISKORIT = new Set(["Muu korimalli", "Umpipakettiauto", "Avolava"]);

function ratkaise(A, b) {
  // Gaussin eliminointi osittaisella tukialkion valinnalla. A: n x n (taulukko taulukoita)
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]));
}

// ---------- aineisto ----------

/**
 * Yhdistää vuosittaiset JSON-tiedostot yhdeksi sarakemuotoiseksi aineistoksi.
 */
export function yhdistaAineisto(tiedostot) {
  const sanasto = { merkki: [], malli: [], sarja: [], kayttovoima: [], korimalli: [], vetotapa: [], vaihteisto: [] };
  const hakemisto = Object.fromEntries(Object.keys(sanasto).map((k) => [k, new Map()]));
  const koodaa = (k, v) => {
    let i = hakemisto[k].get(v);
    if (i === undefined) { i = sanasto[k].length; sanasto[k].push(v); hakemisto[k].set(v, i); }
    return i;
  };
  // Hylätään rivit, joiden teho on selvästi virheellinen (esim. 1 kW tai iskutilavuus tehon paikalla)
  const kelpaa = (t, r) => t.sarakkeet.kw[r] >= 10 && t.sarakkeet.kw[r] <= 1500 && t.sarakkeet.arvo[r] > 1;
  let n = 0;
  for (const t of tiedostot) for (let r = 0; r < t.rivit; r++) if (kelpaa(t, r)) n++;
  const A = {
    merkki: new Int32Array(n), malli: new Int32Array(n), sarja: new Int32Array(n),
    kayttovoima: new Int16Array(n), korimalli: new Int16Array(n), vetotapa: new Int16Array(n),
    vaihteisto: new Int16Array(n), ryhma: new Int8Array(n),
    kw: new Float32Array(n), lkw: new Float64Array(n), ensirek: new Float64Array(n), paatos: new Float64Array(n),
    ika: new Float64Array(n), km: new Float64Array(n), arvo: new Float64Array(n), y: new Float64Array(n),
    t: new Float64Array(n), kk: new Int32Array(n), veropros: new Float32Array(n),
    cm3: new Float32Array(n), lcm3: new Float64Array(n), ovet: new Int8Array(n), paasto: new Float32Array(n),
    // lähde: 0 = Verohallinnon päätös, 1 = kauppiaan arvio (koulutustila)
    lahde: new Uint8Array(n), palauteId: new Float64Array(n),
  };
  let i = 0;
  let viimeisin = 0;
  for (const t of tiedostot) {
    const S = t.sarakkeet, D = t.sanastot;
    for (let r = 0; r < t.rivit; r++) {
      if (!kelpaa(t, r)) continue;
      const merkki = D.merkki[S.merkki[r]];
      const malli = normalisoiMalli(D.malli[S.malli[r]]);
      A.merkki[i] = koodaa("merkki", merkki);
      A.malli[i] = koodaa("malli", merkki + "|" + malli);
      A.sarja[i] = koodaa("sarja", merkki + "|" + mallisarja(merkki, malli));
      const kv = D.kayttovoima[S.kayttovoima[r]];
      A.kayttovoima[i] = koodaa("kayttovoima", kv);
      A.ryhma[i] = RYHMAT.indexOf(polttoaineryhma(kv));
      A.korimalli[i] = koodaa("korimalli", D.korimalli[S.korimalli[r]]);
      A.vetotapa[i] = koodaa("vetotapa", D.vetotapa[S.vetotapa[r]]);
      A.vaihteisto[i] = koodaa("vaihteisto", D.vaihteisto[S.vaihteisto[r]]);
      A.kw[i] = S.kw[r];
      A.lkw[i] = Math.log(S.kw[r]);
      A.ensirek[i] = pvmLuvusta(S.ensirek[r]);
      A.paatos[i] = pvmLuvusta(S.paatos[r]);
      A.ika[i] = Math.max(0, (A.paatos[i] - A.ensirek[i]) / VUOSI_MS);
      A.km[i] = S.km[r] ?? 0;
      A.arvo[i] = S.arvo[r];
      A.y[i] = Math.log(S.arvo[r]);
      A.t[i] = (A.paatos[i] - AIKA_ALKU) / VUOSI_MS;
      A.kk[i] = kuukausiNumero(A.paatos[i]);
      A.veropros[i] = S.veropros[r] ?? NaN;
      const cm3 = S.cm3 ? S.cm3[r] || 0 : 0;
      A.cm3[i] = cm3;
      A.lcm3[i] = cm3 > 0 ? Math.log(cm3) : NaN;
      A.ovet[i] = S.ovet ? S.ovet[r] || 0 : 0;
      A.paasto[i] = A.ryhma[i] === 0 ? NaN : paastoVeroprosentista(A.veropros[i], S.ensirek[r]);
      A.lahde[i] = S.lahde && S.lahde[r] ? 1 : 0;
      A.palauteId[i] = S.palauteId ? S.palauteId[r] || 0 : 0;
      if (!A.lahde[i] && S.paatos[r] > viimeisin) viimeisin = S.paatos[r];
      i++;
    }
  }
  return rakennaHakemistot({ n, A, sanasto, hakemisto, viimeisinPaatos: viimeisin });
}

function rakennaHakemistot(aineisto) {
  const { n, A, sanasto } = aineisto;
  // Hakemistot nopeaa verrokkihakua varten: merkki+ryhmä -> rivit, merkki -> mallit
  const merkkiRyhma = new Map();
  const ryhmaRivit = [[], [], []];
  const malliLkm = new Map();
  const merkinMallit = new Map();
  let kauppiasRivit = 0;
  for (let r = 0; r < n; r++) {
    const k = A.merkki[r] * 3 + A.ryhma[r];
    if (!merkkiRyhma.has(k)) merkkiRyhma.set(k, []);
    merkkiRyhma.get(k).push(r);
    // Kauppiaiden arviot ovat vain verrokkeja: mallin opetus ja päätösmäärät perustuvat Verohallinnon päätöksiin
    if (A.lahde && A.lahde[r]) { kauppiasRivit++; if (!malliLkm.has(A.malli[r])) malliLkm.set(A.malli[r], 0); }
    else {
      ryhmaRivit[A.ryhma[r]].push(r);
      malliLkm.set(A.malli[r], (malliLkm.get(A.malli[r]) || 0) + 1);
    }
    if (!merkinMallit.has(A.merkki[r])) merkinMallit.set(A.merkki[r], new Set());
    merkinMallit.get(A.merkki[r]).add(A.malli[r]);
  }
  const malliTiedot = aineisto.malliTiedot || sanasto.malli.map((avain) => {
    const [merkki, nimi] = avain.split("|");
    return { nimi, sanat: malliSanat(nimi), sarja: mallisarja(merkki, nimi) };
  });
  return { ...aineisto, merkkiRyhma, ryhmaRivit, malliLkm, merkinMallit, malliTiedot, kauppiasRivit };
}

/** Uusi aineisto, jossa on vain ehdon täyttävät rivit (sanastot ovat yhteiset alkuperäisen kanssa). */
export function osajoukko(aineisto, ehto) {
  const valitut = [];
  for (let r = 0; r < aineisto.n; r++) if (ehto(r)) valitut.push(r);
  const A = {};
  for (const [k, sarake] of Object.entries(aineisto.A)) {
    const uusi = new sarake.constructor(valitut.length);
    for (let i = 0; i < valitut.length; i++) uusi[i] = sarake[valitut[i]];
    A[k] = uusi;
  }
  let viimeisin = 0;
  for (let i = 0; i < valitut.length; i++) {
    if (A.lahde && A.lahde[i]) continue;
    const d = new Date(A.paatos[i]);
    const luku = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    if (luku > viimeisin) viimeisin = luku;
  }
  return rakennaHakemistot({
    n: valitut.length, A, sanasto: aineisto.sanasto, hakemisto: aineisto.hakemisto,
    malliTiedot: aineisto.malliTiedot, viimeisinPaatos: viimeisin,
  });
}

/** Aineiston rivi kohdeauton muodossa (tarkkuustestejä varten). */
export function rivinKohde(aineisto, r) {
  const { A, sanasto } = aineisto;
  return {
    merkki: sanasto.merkki[A.merkki[r]], malli: sanasto.malli[A.malli[r]].split("|")[1], kw: A.kw[r],
    ryhma: RYHMAT[A.ryhma[r]], ensirek: A.ensirek[r], verotus: A.paatos[r], km: A.km[r],
    korimalli: sanasto.korimalli[A.korimalli[r]], vetotapa: sanasto.vetotapa[A.vetotapa[r]],
    vaihteisto: sanasto.vaihteisto[A.vaihteisto[r]], cm3: A.cm3[r], ovet: A.ovet[r], paasto: A.paasto[r],
    kayttovoima: sanasto.kayttovoima[A.kayttovoima[r]],
  };
}

/** Palauttaa kartan malli-indeksi -> taso ("malli" | "sarja" | "merkki") kohteen merkin malleille. */
export function malliTasot(aineisto, merkki, malli) {
  const kartta = new Map();
  const merkkiI = aineisto.hakemisto.merkki.get(merkki);
  if (merkkiI === undefined || !aineisto.merkinMallit.has(merkkiI)) return kartta;
  const nimi = normalisoiMalli(malli);
  const sanat = malliSanat(nimi);
  const sarja = mallisarja(merkki, nimi);
  const mallit = [...aineisto.merkinMallit.get(merkkiI)];
  // Jos täsmälleen sama nimi löytyy aineistosta, vain se on "sama malli" ja nimeltään lähellä olevat
  // ovat samaa sarjaa. Jos ei löydy, nimeltään lähimmät (esim. "911" haulle "911 GT3") ovat "sama malli".
  // (vain mallit, joista on Verohallinnon päätöksiä: kauppiaan arvion uusi mallinimi ei muuta muiden tasoja)
  const tasmaava = mallit.some((mi) => aineisto.malliTiedot[mi].nimi === nimi && (aineisto.malliLkm.get(mi) || 0) > 0);
  for (const mi of mallit) {
    const t = aineisto.malliTiedot[mi];
    if (t.nimi === nimi) { kartta.set(mi, "malli"); continue; }
    const l = mallienLaheisyys(sanat, sarja, t.sanat, t.sarja);
    kartta.set(mi, tasmaava && l === "malli" ? "sarja" : l);
  }
  return kartta;
}

// ---------- koulutus ----------

function luokkaPiirteet(aineisto, ryhmanRivit, minLkm = 50) {
  // Korimallin ja vetotavan luokat, joilla on riittävästi havaintoja (ensimmäinen on vertailuluokka)
  const { A, sanasto } = aineisto;
  const laske = (sarake) => {
    const m = new Map();
    for (const r of ryhmanRivit) m.set(A[sarake][r], (m.get(A[sarake][r]) || 0) + 1);
    return [...m.entries()].filter(([, c]) => c >= minLkm).sort((a, b) => b[1] - a[1])
      .slice(1).map(([k]) => sanasto[sarake][k]);
  };
  const ryhma = A.ryhma[ryhmanRivit[0]];
  const lisat = ryhma === 0 ? [] : ASETUKSET.lisaPiirteet.slice();
  return { korimalli: laske("korimalli"), vetotapa: laske("vetotapa"), lisat };
}

export function luokkaLkm(luokat) {
  return luokat.korimalli.length + luokat.vetotapa.length + 2 * (luokat.lisat ? luokat.lisat.length : 0);
}

// Iskutilavuus ja päästöt piirteinä: [onko tieto, keskitetty log-arvo]
function lisaArvot(lisa, cm3, paasto, ulos, j) {
  if (lisa === "cm3") { const on = cm3 > 0; ulos[j] = on ? 1 : 0; ulos[j + 1] = on ? Math.log(cm3) - 7.6 : 0; }
  else { const on = paasto > 0; ulos[j] = on ? 1 : 0; ulos[j + 1] = on ? Math.log(paasto) - 5 : 0; }
}

function rivinPiirteet(aineisto, r, luokat, ulos) {
  const { A, sanasto } = aineisto;
  piirteet(A.ika[r], A.km[r], A.lkw[r], ASETUKSET.solmut, ulos, 0);
  let j = PIIRRE_LKM;
  if (luokat) {
    const kori = sanasto.korimalli[A.korimalli[r]], veto = sanasto.vetotapa[A.vetotapa[r]];
    for (const k of luokat.korimalli) ulos[j++] = kori === k ? 1 : 0;
    for (const v of luokat.vetotapa) ulos[j++] = veto === v ? 1 : 0;
    for (const l of luokat.lisat || []) { lisaArvot(l, A.cm3[r], A.paasto[r], ulos, j); j += 2; }
  }
  return ulos;
}

function sovita(aineisto, rivit, ryhmaSarake, luokat, vakio = false, Y = null, jaannokset = null, W = null) {
  // Painotettu pienimmän neliösumman sovitus ryhmäkeskiarvoista poikkeamina (tai vakiotermillä).
  // W: rivikohtaiset painot (esim. tuoreemmat päätökset painavammin), oletuksena kaikille 1.
  const A = { ...aineisto.A, y: Y || aineisto.A.y };
  const paino = W ? (r) => W[r] : () => 1;
  const p = PIIRRE_LKM + (luokat ? luokkaLkm(luokat) : 0) + (vakio ? 1 : 0);
  const x = new Float64Array(p);
  const keskiarvot = new Map();
  if (!vakio) {
    for (const r of rivit) {
      const g = ryhmaSarake(r);
      let s = keskiarvot.get(g);
      if (!s) { s = { lkm: 0, w: 0, x: new Float64Array(p), y: 0 }; keskiarvot.set(g, s); }
      rivinPiirteet(aineisto, r, luokat, x);
      const w = paino(r);
      s.lkm++; s.w += w; s.y += w * A.y[r];
      for (let j = 0; j < p; j++) s.x[j] += w * x[j];
    }
    for (const s of keskiarvot.values()) {
      if (s.w <= 0) continue;
      s.y /= s.w; for (let j = 0; j < p; j++) s.x[j] /= s.w;
    }
  }
  const valmistele = (r) => {
    rivinPiirteet(aineisto, r, luokat, x);
    let yy = A.y[r];
    if (vakio) { x[p - 1] = 1; return yy; }
    const s = keskiarvot.get(ryhmaSarake(r));
    if (s.lkm < 2 || s.w <= 0) return null;
    for (let j = 0; j < p; j++) x[j] -= s.x[j];
    return yy - s.y;
  };
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  let nKaytetty = 0;
  for (const r of rivit) {
    const yy = valmistele(r);
    if (yy === null) continue;
    const w = paino(r);
    if (w <= 0) continue;
    nKaytetty++;
    for (let a = 0; a < p; a++) {
      const wa = w * x[a];
      Xty[a] += wa * yy;
      for (let b = a; b < p; b++) XtX[a][b] += wa * x[b];
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  let jalki = 0;
  for (let a = 0; a < p; a++) jalki += XtX[a][a];
  for (let a = 0; a < p; a++) XtX[a][a] += 1e-6 * (jalki / p) + 1e-9;
  const beta = ratkaise(XtX, Xty);
  // Jäännöshajonta (painotettu)
  let ss = 0, sw = 0, m = 0;
  for (const r of rivit) {
    const yy = valmistele(r);
    if (yy === null) continue;
    let e = yy;
    for (let j = 0; j < p; j++) e -= beta[j] * x[j];
    if (jaannokset) jaannokset[r] = e;
    const w = paino(r);
    ss += w * e * e; sw += w; m++;
  }
  const hajonta = Math.sqrt((ss / Math.max(1e-9, sw)) * (m / Math.max(1, m - p)));
  return { beta: beta.map((b) => Math.round(b * 1e6) / 1e6), hajonta, n: nKaytetty };
}

/**
 * Kuukausittainen hintaindeksi ja mallin sisäiset siirtokertoimet vuorottelevalla sovituksella:
 * hinta = mallin taso + ikä/km/teho-vaikutus + kuukauden hintataso. Peräkkäisten kuukausien eroja
 * rangaistaan, jotta harvojen havaintojen kuukaudet eivät heilu.
 */
function sovitaIndeksi(aineisto, rivit) {
  const { A } = aineisto;
  let kkMin = Infinity, kkMax = -Infinity;
  for (const r of rivit) { if (A.kk[r] < kkMin) kkMin = A.kk[r]; if (A.kk[r] > kkMax) kkMax = A.kk[r]; }
  const M = kkMax - kkMin + 1;
  let I = new Float64Array(M);
  const Y = new Float64Array(aineisto.n);
  const e = new Float64Array(aineisto.n).fill(NaN);
  let malliTaso;
  for (let kierros = 0; kierros < ASETUKSET.indeksiKierrokset; kierros++) {
    for (const r of rivit) Y[r] = A.y[r] - I[A.kk[r] - kkMin];
    e.fill(NaN);
    malliTaso = sovita(aineisto, rivit, (r) => A.malli[r], null, false, Y, e);
    if (M === 1) break;
    const S = new Float64Array(M), N = new Float64Array(M);
    for (const r of rivit) {
      if (Number.isNaN(e[r])) continue;
      const m = A.kk[r] - kkMin;
      S[m] += e[r] + I[m]; N[m]++;
    }
    // (diag(N) + λ D'D) I = S, D = ensimmäiset erotukset
    const lam = ASETUKSET.indeksiTasoitus;
    const K = Array.from({ length: M }, () => new Array(M).fill(0));
    for (let m = 0; m < M; m++) {
      K[m][m] += N[m] + 1e-6;
      if (m > 0) { K[m][m] += lam; K[m - 1][m - 1] += lam; K[m][m - 1] -= lam; K[m - 1][m] -= lam; }
    }
    const uusi = ratkaise(K, Array.from(S));
    let ka = 0, nn = 0;
    for (let m = 0; m < M; m++) { ka += uusi[m] * N[m]; nn += N[m]; }
    ka /= Math.max(1, nn);
    I = Float64Array.from(uusi, (v) => v - ka);
  }
  for (const r of rivit) Y[r] = A.y[r] - I[A.kk[r] - kkMin];
  // Lopulliset siirtokertoimet painotetaan tuoreisiin päätöksiin: arvonaleneman muoto muuttuu ajan myötä,
  // mutta hintaindeksi tarvitsee koko historian.
  const W = koulutusPainot(aineisto, rivit, kkMax);
  if (W) malliTaso = sovita(aineisto, rivit, (r) => A.malli[r], null, false, Y, null, W);
  return {
    indeksi: { alku: kkMin, arvot: Array.from(I, (v) => Math.round(v * 1e5) / 1e5) },
    malliTaso,
    yKorjattu: Y,
    W,
  };
}

function koulutusPainot(aineisto, rivit, kkMax) {
  const H = ASETUKSET.koulutusPuoliintumisKk;
  if (!Number.isFinite(H)) return null;
  const W = new Float64Array(aineisto.n);
  for (const r of rivit) W[r] = Math.pow(0.5, Math.max(0, kkMax - aineisto.A.kk[r]) / H);
  return W;
}

/**
 * Opettaa siirtokertoimet jokaiselle polttoaineryhmälle kolmella tasolla.
 */
export function koulutaMalli(aineisto) {
  const { A } = aineisto;
  const kertoimet = {};
  RYHMAT.forEach((ryhma, gi) => {
    const rivit = aineisto.ryhmaRivit[gi];
    if (rivit.length < 30) return;
    const luokat = luokkaPiirteet(aineisto, rivit);
    const { indeksi, malliTaso, yKorjattu, W } = sovitaIndeksi(aineisto, rivit);
    const merkkiTaso = sovita(aineisto, rivit, (r) => A.merkki[r], luokat, false, yKorjattu, null, W);
    const kaikkiTaso = sovita(aineisto, rivit, null, luokat, true, yKorjattu, null, W);
    kertoimet[ryhma] = { luokat, indeksi, malli: malliTaso, merkki: merkkiTaso, kaikki: kaikkiTaso, n: rivit.length };
  });
  const tulos = {
    versio: VERSIO,
    koulutettu: new Date().toISOString(),
    aineisto: { rivit: aineisto.n, viimeisinPaatos: aineisto.viimeisinPaatos },
    asetukset: { solmut: ASETUKSET.solmut },
    kertoimet,
    kalibrointi: null,
  };
  tulos.sukupolvet = tunnistaSukupolvet(aineisto, tulos);
  return tulos;
}

/**
 * Mallisukupolvien tunnistus. Kullekin riittävän yleiselle mallille lasketaan päätösten poikkeamat
 * mallin sisäisestä hintamallista (ikä, km, teho, hintataso) ja etsitään ensirekisteröintipäivän mukaan
 * järjestetystä sarjasta portaat (mallin oma ikäkulmakerroin huomioiden). Merkitsevä porras tulkitaan
 * sukupolven tai mallipäivityksen vaihdokseksi.
 * Palauttaa { ryhmä: { "MERKKI|MALLI": { rajat: [ms...], tasot: [0, ...] } } }.
 */
export function tunnistaSukupolvet(aineisto, malli, asetukset = ASETUKSET.sukupolvi) {
  const { A, sanasto } = aineisto;
  const { minN, minOsa, minHyppy, rangaistus, maxRajat } = asetukset;
  const x = new Float64Array(PIIRRE_LKM + 1);
  const kaikki = {};
  RYHMAT.forEach((ryhma, gi) => {
    const K = malli.kertoimet[ryhma];
    if (!K) return;
    const mallit = new Map();
    for (const r of aineisto.ryhmaRivit[gi]) {
      let l = mallit.get(A.malli[r]);
      if (!l) mallit.set(A.malli[r], (l = []));
      l.push(r);
    }
    const ryhmanTulos = {};
    for (const [mi, rivitKaikki] of mallit) {
      if (rivitKaikki.length < minN) continue;
      // poikkeamat mallin sisäisestä hintamallista
      const tiedot = rivitKaikki.map((r) => {
        rivinPiirteet(aineisto, r, null, x);
        return { e: A.ensirek[r], u: A.ika[r], y: A.y[r] - indeksiArvo(K.indeksi, A.kk[r]) - pistetulo(K.malli.beta, x, PIIRRE_LKM) };
      });
      // karkeat poikkeamat pois (virheelliset rivit)
      const jarj = tiedot.map((t) => t.y).sort((a, b) => a - b);
      const med = jarj[Math.floor(jarj.length / 2)];
      const d = tiedot.filter((t) => Math.abs(t.y - med) < 0.6).sort((a, b) => a.e - b.e);
      if (d.length < minN) continue;
      const rajat = [];
      const etsi = (lo, hi, syvyys) => {
        const m = hi - lo;
        if (m < 2 * minOsa || rajat.length >= maxRajat) return;
        let S0 = 0, Su = 0, Suu = 0, Sy = 0, Suy = 0, Syy = 0;
        for (let i = lo; i < hi; i++) { const t = d[i]; S0++; Su += t.u; Suu += t.u * t.u; Sy += t.y; Suy += t.u * t.y; Syy += t.y * t.y; }
        const det0 = S0 * Suu - Su * Su;
        if (det0 <= 1e-9) return;
        const a0 = (Sy * Suu - Su * Suy) / det0, b0 = (S0 * Suy - Su * Sy) / det0;
        const sse0 = Math.max(1e-12, Syy - a0 * Sy - b0 * Suy);
        // yläosan summat (i >= k) käydään läpi lopusta alkuun
        let T0 = 0, Tu = 0, Ty = 0, paras = null;
        for (let k = hi - 1; k > lo; k--) {
          const t = d[k]; T0++; Tu += t.u; Ty += t.y;
          if (T0 < minOsa || m - T0 < minOsa || d[k].e === d[k - 1].e) continue;
          // 3x3 normaaliyhtälöt [1, u, porras]
          const M = [[S0, Su, T0], [Su, Suu, Tu], [T0, Tu, T0]], v = [Sy, Suy, Ty];
          const b = ratkaise(M.map((rv) => rv.slice()), v.slice());
          if (!b.every(Number.isFinite)) continue;
          const sse = Syy - b[0] * Sy - b[1] * Suy - b[2] * Ty;
          if (!paras || sse < paras.sse) paras = { k, sse, hyppy: b[2] };
        }
        if (!paras || paras.sse <= 0) return;
        const lr = m * Math.log(sse0 / paras.sse);
        if (lr < rangaistus * Math.log(m) || Math.abs(paras.hyppy) < minHyppy) return;
        rajat.push(paras.k);
        etsi(lo, paras.k, syvyys + 1);
        etsi(paras.k, hi, syvyys + 1);
      };
      etsi(0, d.length, 0);
      if (!rajat.length) continue;
      rajat.sort((a, b) => a - b);
      // yhteinen sovitus kaikille portaille: y = a + b·ikä + Σ c_j·[ensirek ≥ raja_j]
      const p = 2 + rajat.length;
      const XtX = Array.from({ length: p }, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
      const rivi = new Float64Array(p);
      d.forEach((t, i) => {
        rivi[0] = 1; rivi[1] = t.u;
        for (let j = 0; j < rajat.length; j++) rivi[2 + j] = i >= rajat[j] ? 1 : 0;
        for (let a = 0; a < p; a++) { Xty[a] += rivi[a] * t.y; for (let b = 0; b < p; b++) XtX[a][b] += rivi[a] * rivi[b]; }
      });
      const c = ratkaise(XtX, Xty);
      const tasot = [0];
      for (let j = 0; j < rajat.length; j++) tasot.push(Math.round((tasot[j] + c[2 + j]) * 1e4) / 1e4);
      // raja: puolivälissä portaan molemmin puolin olevia ensirekisteröintejä
      ryhmanTulos[sanasto.malli[mi]] = {
        rajat: rajat.map((k) => Math.round((d[k - 1].e + d[k].e) / 2)),
        tasot,
        n: d.length,
      };
    }
    kaikki[ryhma] = ryhmanTulos;
  });
  return kaikki;
}

/** Sukupolven indeksi: montako rajaa ensirekisteröinti on ylittänyt. */
function sukupolviIndeksi(rajat, ensirek) {
  let j = 0;
  while (j < rajat.length && ensirek >= rajat[j]) j++;
  return j;
}

// ---------- arviointi ----------

function kohdePiirteet(kohde, luokat, kanssaLuokat) {
  const p = PIIRRE_LKM + (kanssaLuokat ? luokkaLkm(luokat) : 0);
  const x = new Float64Array(p + 1);
  const lkwK = Number.isFinite(kohde.lkwSiirto) ? kohde.lkwSiirto : Math.log(kohde.kw);
  piirteet(kohde.ika, kohde.km, lkwK, ASETUKSET.solmut, x, 0);
  if (kanssaLuokat) {
    let j = PIIRRE_LKM;
    for (const k of luokat.korimalli) x[j++] = kohde.korimalli === k ? 1 : 0;
    for (const v of luokat.vetotapa) x[j++] = kohde.vetotapa === v ? 1 : 0;
    for (const l of luokat.lisat || []) { lisaArvot(l, kohde.cm3 || 0, kohde.paasto || 0, x, j); j += 2; }
  }
  return x;
}

function pistetulo(beta, x, p) {
  let s = 0;
  for (let j = 0; j < p; j++) s += beta[j] * x[j];
  return s;
}

/**
 * Tunnistaa kohteen verrokit aineistosta (ilman painoja). Käytetään myös harvinaisuuden laskemiseen.
 */
export function harvinaisuus(aineisto, kohde) {
  const { A, hakemisto } = aineisto;
  const gi = RYHMAT.indexOf(kohde.ryhma);
  const merkkiI = hakemisto.merkki.get(kohde.merkki);
  const tasoKartta = kohde.tasoKartta || malliTasot(aineisto, kohde.merkki, kohde.malli);
  const lkw = Math.log(kohde.kw);
  let malli = 0, sarja = 0, merkki = 0, kauppias = 0;
  const rivit = merkkiI === undefined ? [] : aineisto.merkkiRyhma.get(merkkiI * 3 + gi) || [];
  for (const r of rivit) {
    const kori = aineisto.sanasto.korimalli[A.korimalli[r]];
    if (kohde.korimalli && kori !== kohde.korimalli && (ERIKOISKORIT.has(kori) || ERIKOISKORIT.has(kohde.korimalli))) continue;
    const taso = tasoKartta.get(A.malli[r]);
    const lahella = Math.abs(A.lkw[r] - lkw) <= 0.1 && (taso === "malli" || taso === "sarja");
    if (A.lahde[r]) { if (lahella) kauppias++; continue; } // kauppiaiden arviot eivät ole päätöksiä
    merkki++;
    if (!lahella) continue;
    if (taso === "malli") malli++;
    sarja++;
  }
  let luokka, selite;
  const lahella = Math.max(malli, sarja);
  if (lahella >= 30) { luokka = "yleinen"; selite = "Yleinen malli"; }
  else if (lahella >= 5) { luokka = "harvinainen"; selite = "Harvinainen"; }
  else { luokka = "erittain"; selite = "Erittäin harvinainen"; }
  return { luokka, selite, malli, sarja, merkki, kauppias };
}

/**
 * Arvioi kohdeauton verotusarvon.
 * kohde: { merkki, malli, kw, ryhma, ensirek(ms), verotus(ms), km (tuhansina), korimalli?, vetotapa? }
 * Valinnainen poissulje: rivin indeksi, jota ei käytetä (tarkkuustestiä varten).
 */
export function arvioi(aineisto, malli, kohde, { poissulje = -1, verrokkeja = 15, palauteSuodin = null } = {}) {
  const { A, hakemisto, sanasto } = aineisto;
  const gi = RYHMAT.indexOf(kohde.ryhma);
  const K = malli.kertoimet[kohde.ryhma];
  if (!K) return { virhe: "Tälle käyttövoimalle ei ole riittävästi aineistoa." };
  const ika = Math.max(0, (kohde.verotus - kohde.ensirek) / VUOSI_MS);
  const k2 = { ...kohde, ika };
  const indT = indeksiArvo(K.indeksi, kuukausiNumero(kohde.verotus));
  const lkw = Math.log(kohde.kw);
  const merkkiI = hakemisto.merkki.get(kohde.merkki);
  const tasoKartta = kohde.tasoKartta || malliTasot(aineisto, kohde.merkki, kohde.malli);
  const rivit = merkkiI === undefined ? [] : aineisto.merkkiRyhma.get(merkkiI * 3 + gi) || [];

  // Tehon ääripäät: onko kohdeauton teho saman mallin verrokkien tehoalueen ulkopuolella (esimerkiksi
  // erikoisversio)? Silloin käytetään omaa harhakorjausta ja leveämpää väliä (ks. valitseKalibrointi).
  let minM = Infinity, maxM = -Infinity;
  for (const r of rivit) {
    if (r === poissulje || A.lahde[r] || tasoKartta.get(A.malli[r]) !== "malli") continue;
    if (A.lkw[r] < minM) minM = A.lkw[r];
    if (A.lkw[r] > maxM) maxM = A.lkw[r];
  }
  let lkwSiirto = lkw, tehoUlkona = 0;
  if (Number.isFinite(minM)) {
    const toleranssi = ASETUKSET.tehoToleranssi;
    const reuna = Math.min(maxM + toleranssi, Math.max(minM - toleranssi, lkw));
    if (reuna !== lkw) {
      tehoUlkona = lkw - reuna;
      lkwSiirto = reuna + ASETUKSET.tehoVaimennus * (lkw - reuna);
    }
  }
  const kSiirto = { ...k2, lkwSiirto };

  const xMalli = kohdePiirteet(kSiirto, K.luokat, false);
  const xMerkki = kohdePiirteet(k2, K.luokat, true);
  const pM = PIIRRE_LKM, pB = PIIRRE_LKM + luokkaLkm(K.luokat);
  const fMalli = pistetulo(K.malli.beta, xMalli, pM);
  const fMerkki = pistetulo(K.merkki.beta, xMerkki, pB);

  const sA = Math.max(ASETUKSET.ikaHajontaMin, ASETUKSET.ikaHajontaOsuus * ika);
  // sw* = kaikki verrokit, swR/sw2R = vain Verohallinnon päätökset (tukitaso), swK/lkmK = kauppiaiden arviot
  const uusiTaso = () => ({ sw: 0, sw2: 0, swy: 0, swyy: 0, lkm: 0, swR: 0, sw2R: 0, swK: 0, lkmK: 0 });
  const tasot = { malli: uusiTaso(), sarja: uusiTaso(), merkki: uusiTaso() };
  const kauppiasPaino = Number.isFinite(malli.kauppiasPaino) ? malli.kauppiasPaino : ASETUKSET.kauppias.paino;
  const ehdokkaat = [];
  const x = new Float64Array(pB + 1);
  const SP = ASETUKSET.sukupolvi.kerroin < 1 || ASETUKSET.sukupolvi.siirto ? ASETUKSET.sukupolvi : null;
  const sukupolvetRyhma = malli.sukupolvet && malli.sukupolvet[kohde.ryhma];
  for (const r of rivit) {
    if (r === poissulje) continue;
    const onKauppias = A.lahde[r] === 1;
    if (onKauppias && (!ASETUKSET.kauppias.verrokkina || (palauteSuodin && !palauteSuodin(A.palauteId[r])))) continue;
    const taso = tasoKartta.get(A.malli[r]) || "merkki";
    const dk = A.lkw[r] - lkw;
    const sK = ASETUKSET.tehoHajonta[taso];
    if (Math.abs(dk) > 3.5 * sK) continue;
    const di = (A.ika[r] - ika) / (taso === "malli" && ASETUKSET.paikallinen.kaytossa ? sA * ASETUKSET.paikallinen.ikaLevennys : sA);
    if (Math.abs(di) > 3.5) continue;
    const kori = sanasto.korimalli[A.korimalli[r]];
    if (kohde.korimalli && kori !== kohde.korimalli && (ERIKOISKORIT.has(kori) || ERIKOISKORIT.has(kohde.korimalli))) continue;
    let w = Math.exp(-0.5 * (dk / sK) ** 2 - 0.5 * di * di);
    // Etäisyys ajassa (testeissä verrokki voi olla myös myöhemmältä ajalta)
    const kkSitten = Math.abs(kohde.verotus - A.paatos[r]) / (VUOSI_MS / 12);
    if (taso !== "malli") {
      if (kohde.korimalli && kori !== kohde.korimalli) w *= ASETUKSET.koriKerroin;
      if (kohde.vetotapa && sanasto.vetotapa[A.vetotapa[r]] !== kohde.vetotapa) w *= ASETUKSET.vetoKerroin;
    }
    if (ASETUKSET.kayttovoimaKerroin < 1 && kohde.kayttovoima && sanasto.kayttovoima[A.kayttovoima[r]] !== kohde.kayttovoima) {
      w *= ASETUKSET.kayttovoimaKerroin;
    }
    // Kohta 2: iskutilavuus, vaihteisto, ovet
    if (ASETUKSET.kaytaCm3 && kohde.cm3 > 0 && A.cm3[r] > 0) {
      const d = (Math.log(kohde.cm3) - A.lcm3[r]) / ASETUKSET.cm3Hajonta[taso];
      w *= Math.max(ASETUKSET.pehmeaLattia, Math.exp(-0.5 * d * d));
    }
    if (ASETUKSET.vaihteistoKerroin < 1 && kohde.vaihteisto != null && sanasto.vaihteisto[A.vaihteisto[r]] !== kohde.vaihteisto) {
      w *= ASETUKSET.vaihteistoKerroin;
    }
    if (ASETUKSET.ovetKerroin < 1 && kohde.ovet > 0 && A.ovet[r] > 0 && A.ovet[r] !== kohde.ovet) w *= ASETUKSET.ovetKerroin;
    // Kohta 3: päästöjen läheisyys (veroprosentista päätelty)
    if (ASETUKSET.kaytaPaasto && kohde.ryhma !== "EV" && kohde.paasto > 0 && A.paasto[r] > 0) {
      const d = Math.log(kohde.paasto / A.paasto[r]) / ASETUKSET.paastoHajonta[kohde.ryhma];
      w *= Math.max(ASETUKSET.pehmeaLattia, Math.exp(-0.5 * d * d));
    }
    // Kohta 2: tunnistettu sukupolven vaihdos verrokin ja kohteen välillä
    let sukupolviSiirto = 0, eriSukupolvi = false;
    if (SP && SP.tasot.includes(taso)) {
      const sp = sukupolvetRyhma && sukupolvetRyhma[sanasto.malli[A.malli[r]]];
      if (sp) {
        const jK = sukupolviIndeksi(sp.rajat, kohde.ensirek), jV = sukupolviIndeksi(sp.rajat, A.ensirek[r]);
        if (jK !== jV) {
          eriSukupolvi = true;
          w *= SP.kerroin;
          if (SP.siirto) sukupolviSiirto = sp.tasot[jK] - sp.tasot[jV];
        }
      }
    }
    // Saman ikäisistä verrokeista suositaan samoihin aikoihin rekisteröityjä
    // (sama sukupolvi ja varustetaso); ikäero siirretään ikäkäyrällä.
    const hE = ASETUKSET.ensirekHajonta[taso];
    if (hE > 0) {
      const d = (A.ensirek[r] - kohde.ensirek) / VUOSI_MS / hE;
      w *= Math.max(ASETUKSET.ensirekLattia, Math.exp(-0.5 * d * d));
    }
    if (taso === "malli" && ASETUKSET.versioPaino > 0 && Math.abs(dk) < 0.015 &&
      !(kohde.cm3 > 0 && A.cm3[r] > 0 && Math.abs(Math.log(A.cm3[r] / kohde.cm3)) > 0.03)) {
      w *= 1 + ASETUKSET.versioPaino; // sama versio: sama teho (ja iskutilavuus)
    }
    if (taso === "malli" && ASETUKSET.paikallinen.kaytossa && ASETUKSET.paikallinen.tarkkaPaino > 0 && Math.abs(dk) < 0.012) {
      const P = ASETUKSET.paikallinen;
      const a = (A.ika[r] - ika) / P.tarkkaIka, b = Math.log((A.km[r] + 5) / (kohde.km + 5)) / P.tarkkaKm;
      w *= 1 + P.tarkkaPaino * Math.exp(-0.5 * (a * a + b * b));
    }
    if (onKauppias) w *= kauppiasPaino;
    if (w < 1e-6) continue;
    // Siirretään verrokin arvo kohdeauton ominaisuuksiin
    let siirretty;
    if (taso === "merkki") {
      rivinPiirteet(aineisto, r, K.luokat, x);
      siirretty = A.y[r] - indeksiArvo(K.indeksi, A.kk[r]) + indT + fMerkki - pistetulo(K.merkki.beta, x, pB);
    } else {
      rivinPiirteet(aineisto, r, null, x);
      siirretty = A.y[r] - indeksiArvo(K.indeksi, A.kk[r]) + indT + fMalli - pistetulo(K.malli.beta, x, pM);
    }
    siirretty += sukupolviSiirto;
    ehdokkaat.push({ r, taso, w, siirretty, kkSitten, eriSukupolvi, kauppias: onKauppias });
  }

  // Päätösten tuoreus: jos saman mallin tuoreita, lähellä olevia päätöksiä on runsaasti, vanhat päätökset
  // painavat vähän (lyhyt puoliintumisaika). Harvinaisille autoille vanhemmatkin päätökset pidetään mukana.
  let tuoreita = 0;
  for (const e of ehdokkaat) if (e.taso === "malli" && !e.kauppias && e.kkSitten <= 12 && e.w > 0.3) tuoreita++;
  const puoliintuminen = tuoreita >= ASETUKSET.tuoreRaja ? ASETUKSET.puoliintumisKkRunsas : ASETUKSET.puoliintumisKk;
  for (const e of ehdokkaat) e.w *= Math.pow(0.5, e.kkSitten / puoliintuminen);
  // Kauppiaiden arviot painavat sitä vähemmän, mitä enemmän lähellä olevia Verohallinnon päätöksiä on
  let swL = 0, sw2L = 0;
  for (const e of ehdokkaat) if (!e.kauppias && e.taso !== "merkki") { swL += e.w; sw2L += e.w * e.w; }
  const essLahella = sw2L > 0 ? (swL * swL) / sw2L : 0;
  const kauppiasKerroin = 1 / (1 + essLahella / ASETUKSET.kauppias.puolitus);
  const jaljella = [];
  for (const e of ehdokkaat) {
    if (e.kauppias) e.w *= kauppiasKerroin;
    if (e.w < 1e-4) continue;
    const T = tasot[e.taso];
    T.sw += e.w; T.sw2 += e.w * e.w; T.swy += e.w * e.siirretty; T.swyy += e.w * e.siirretty * e.siirretty; T.lkm++;
    if (e.kauppias) { T.swK += e.w; T.lkmK++; } else { T.swR += e.w; T.sw2R += e.w * e.w; }
    jaljella.push(e);
  }
  ehdokkaat.length = 0;
  ehdokkaat.push(...jaljella);

  // Kaikkien merkkien taso: yleinen hintamalli ilman merkkiä (+ merkin keskimääräinen poikkeama, jos tiedossa)
  const xK = kohdePiirteet(k2, K.luokat, true);
  xK[pB] = 1;
  let yleinen = pistetulo(K.kaikki.beta, xK, pB + 1) + indT;
  let yleinenHajonta = K.kaikki.hajonta;
  if (malli.merkkiPoikkeamat && malli.merkkiPoikkeamat[kohde.ryhma]) {
    const mp = malli.merkkiPoikkeamat[kohde.ryhma][kohde.merkki];
    if (mp) { yleinen += mp.poikkeama; yleinenHajonta = mp.hajonta; }
  }

  const paikallinen = ASETUKSET.paikallinen.kaytossa ? paikallinenSovitus(ehdokkaat, A, kSiirto, ika) : null;

  // Porrastettu kutistus: kaikki -> merkki -> sarja -> malli
  const tulosTasot = { kaikki: { arvio: yleinen, ess: 0, paino: 0, lkm: 0 } };
  let ennakko = yleinen;
  let ennakkoPaino = 0; // ennakon "efektiivinen otoskoko" esitystä varten
  const osuudet = { kaikki: 1 };
  for (const taso of ["merkki", "sarja", "malli"]) {
    const T = tasot[taso];
    const ess = T.sw > 0 ? (T.sw * T.sw) / T.sw2 : 0;
    const ka = taso === "malli" && paikallinen ? paikallinen.arvio : T.sw > 0 ? T.swy / T.sw : null;
    const k = ASETUKSET.kutistus[taso];
    const uusi = ess > 0 ? (ess * ka + k * ennakko) / (ess + k) : ennakko;
    const osuus = ess / (ess + k);
    for (const t in osuudet) osuudet[t] *= 1 - osuus;
    osuudet[taso] = osuus;
    // Tukitaso ja vaihteluväli lasketaan vain Verohallinnon päätöksistä: kauppiaan arvio siirtää arviota,
    // mutta ei kavenna väliä ennen kuin arvioiden osuvuus on todettu toteutuneilla päätöksillä.
    const essTuki = T.swR > 0 ? (T.swR * T.swR) / T.sw2R : 0;
    tulosTasot[taso] = { arvio: ka, ess, essTuki, lkm: T.lkm - T.lkmK, kauppias: T.lkmK };
    ennakko = uusi;
    ennakkoPaino = ess + ennakkoPaino;
  }
  const mu = ennakko;

  // Tukiluokka kalibrointia varten
  const essM = tulosTasot.malli.essTuki, essS = tulosTasot.sarja.essTuki, essB = tulosTasot.merkki.essTuki;
  // Kauppiaiden arvioiden osuus lopullisesta arviosta (tasojen osuuksien ja painojen mukaan)
  let kauppiasOsuus = 0, kauppiasLkm = 0;
  for (const taso of ["merkki", "sarja", "malli"]) {
    const T = tasot[taso];
    if (T.sw > 0) kauppiasOsuus += (osuudet[taso] || 0) * (T.swK / T.sw);
    kauppiasLkm += T.lkmK;
  }
  let tuki;
  if (essM >= 8) tuki = "A";
  else if (essM >= 2) tuki = "B";
  else if (essM + essS >= 2) tuki = "C";
  else if (essM + essS + essB >= 2) tuki = "D";
  else tuki = "E";

  const kal = valitseKalibrointi(malli.kalibrointi, tuki, kohde.ryhma, ika, tehoUlkona);
  const q = kal ? kal.kvantiilit : OLETUSKVANTIILIT[tuki];
  // Laskurin oma harhakorjaus koskee vain laskurin omaa osuutta arviosta, ei kauppiaiden arvioita
  const keskikorjaus = (kal ? kal.mediaani : 0) * (1 - kauppiasOsuus);
  const keski = mu + keskikorjaus; // virhe = toteutunut − arvio, joten mediaanivirhe lisätään

  ehdokkaat.sort((a, b) => b.w - a.w);
  const naytettavat = ehdokkaat.slice(0, verrokkeja).map((e) => ({
    merkki: sanasto.merkki[A.merkki[e.r]],
    malli: sanasto.malli[A.malli[e.r]].split("|")[1],
    kayttovoima: sanasto.kayttovoima[A.kayttovoima[e.r]],
    korimalli: sanasto.korimalli[A.korimalli[e.r]],
    kw: A.kw[e.r],
    ensirek: A.ensirek[e.r],
    paatos: A.paatos[e.r],
    km: A.km[e.r],
    arvo: A.arvo[e.r],
    veropros: A.veropros[e.r],
    taso: e.taso,
    siirretty: Math.exp(e.siirretty),
    paino: e.w,
    eriSukupolvi: e.eriSukupolvi,
    lahde: A.lahde[e.r],
    palauteId: A.palauteId[e.r],
  }));
  // Kohdemallin tunnistetut sukupolvirajat (näytetään käyttäjälle)
  let sukupolviRajat = null;
  if (sukupolvetRyhma) {
    for (const [mi, t] of tasoKartta) {
      const sp = t === "malli" && sukupolvetRyhma[sanasto.malli[mi]];
      if (sp && (!sukupolviRajat || sp.n > sukupolviRajat.n)) sukupolviRajat = { rajat: sp.rajat, n: sp.n };
    }
  }
  // Veroprosentit lähimmistä verrokeista (tarkistusta varten)
  const vp = ehdokkaat.filter((e) => e.taso !== "merkki").slice(0, 30)
    .map((e) => A.veropros[e.r]).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);

  return {
    arvio: Math.exp(keski),
    ala80: Math.exp(keski + q.p10),
    yla80: Math.exp(keski + q.p90),
    ala50: Math.exp(keski + q.p25),
    yla50: Math.exp(keski + q.p75),
    logArvio: keski,
    tuki,
    tehoUlkona,
    kauppias: { lkm: kauppiasLkm, osuus: kauppiasOsuus, paino: kauppiasPaino },
    essLahella,
    tehoAlue: Number.isFinite(minM) ? [Math.round(Math.exp(minM)), Math.round(Math.exp(maxM))] : null,
    sukupolviRajat: sukupolviRajat ? sukupolviRajat.rajat : null,
    tasot: tulosTasot,
    osuudet,
    ika,
    verrokit: naytettavat,
    verrokkeja: ehdokkaat.length,
    verrokkienVeroprosentit: vp.length ? { min: vp[0], mediaani: vp[Math.floor(vp.length / 2)], max: vp[vp.length - 1], n: vp.length } : null,
  };
}

const kauppiasArvioValimuisti = new WeakMap(); // aineisto -> Map(rivi -> laskurin log-arvio kauppiaan autosta)

/**
 * Kauppiaiden arvioihin perustuva korjaus (koulutustila). Jokaisesta kauppiaan arviosta lasketaan jäännös:
 * kauppiaan arvio − laskurin oma arvio samasta autosta arvion antopäivänä (log). Kohteen korjaus on lähes
 * samanlaisten autojen jäännösten painotettu keskiarvo, kutistettuna kohti nollaa sitä voimakkaammin, mitä
 * enemmän kohteella on lähellä olevia Verohallinnon päätöksiä (tulos.essLahella).
 */
export function kauppiasKorjaus(aineisto, malli, kohde, tulos, { palauteSuodin = null } = {}) {
  const KA = ASETUKSET.kauppias;
  const tyhja = { korjaus: 0, lkm: 0, osuus: 0, verrokit: [] };
  if (!KA.korjaus || !aineisto.kauppiasRivit || !tulos || tulos.virhe) return tyhja;
  const { A, hakemisto, sanasto } = aineisto;
  const gi = RYHMAT.indexOf(kohde.ryhma);
  const bi = hakemisto.merkki.get(kohde.merkki);
  if (bi === undefined || gi < 0) return tyhja;
  const tasoKartta = kohde.tasoKartta || malliTasot(aineisto, kohde.merkki, kohde.malli);
  const ika = Math.max(0, (kohde.verotus - kohde.ensirek) / VUOSI_MS);
  const lkw = Math.log(kohde.kw);
  let muisti = kauppiasArvioValimuisti.get(aineisto);
  if (!muisti) { muisti = new Map(); kauppiasArvioValimuisti.set(aineisto, muisti); }
  let sw = 0, swe = 0;
  const lista = [];
  for (const r of aineisto.merkkiRyhma.get(bi * 3 + gi) || []) {
    if (!A.lahde[r]) continue;
    if (palauteSuodin && !palauteSuodin(A.palauteId[r])) continue;
    const taso = tasoKartta.get(A.malli[r]);
    const tasoPaino = taso === "malli" ? 1 : taso === "sarja" ? KA.sarjaPaino : 0;
    if (!tasoPaino) continue;
    const dk = (A.lkw[r] - lkw) / KA.kwHajonta;
    const di = (A.ika[r] - ika) / KA.ikaHajonta;
    const dm = Math.log((A.km[r] + 5) / (kohde.km + 5)) / KA.kmHajonta;
    const kkSitten = Math.abs(kohde.verotus - A.paatos[r]) / (VUOSI_MS / 12);
    const w = tasoPaino * Math.exp(-0.5 * (dk * dk + di * di + dm * dm)) * Math.pow(0.5, kkSitten / KA.puoliintumisKk);
    if (w < 0.01) continue;
    let m = muisti.get(r);
    if (m === undefined) {
      const t = arvioi(aineisto, malli, rivinKohde(aineisto, r), { verrokkeja: 0 });
      m = t.virhe ? NaN : t.logArvio;
      muisti.set(r, m);
    }
    if (!Number.isFinite(m)) continue;
    const jaannos = A.y[r] - m;
    sw += w; swe += w * jaannos;
    lista.push({ r, paino: w, jaannos, laskuri: m });
  }
  if (!sw) return tyhja;
  const harvinaisuusKerroin = KA.tukiKerroin ? (KA.tukiKerroin[tulos.tuki] ?? 1) : 1 + (tulos.essLahella || 0) / KA.puolitus;
  const kutistus = KA.k0 * harvinaisuusKerroin * (Number.isFinite(malli.kauppiasKutistus) ? malli.kauppiasKutistus : 1);
  if (!Number.isFinite(kutistus)) return { ...tyhja, lkm: lista.length };
  lista.sort((a, b) => b.paino - a.paino);
  return {
    korjaus: swe / (sw + kutistus),
    lkm: lista.length,
    osuus: sw / (sw + kutistus), // kuinka suuren osan kauppiaiden keskimääräisestä erosta korjaus ottaa mukaan
    verrokit: lista.slice(0, 5).map((e) => ({
      palauteId: A.palauteId[e.r], merkki: sanasto.merkki[A.merkki[e.r]], malli: sanasto.malli[A.malli[e.r]].split("|")[1],
      kw: A.kw[e.r], ensirek: A.ensirek[e.r], km: A.km[e.r], annettu: A.paatos[e.r], veropros: A.veropros[e.r],
      kauppiaanArvo: A.arvo[e.r], laskurinArvo: Math.exp(e.laskuri), ero: e.jaannos, paino: e.paino,
    })),
  };
}

/** Laskurin arvio, johon on lisätty kauppiaiden arvioihin perustuva korjaus. */
export function arvioiKauppiaat(aineisto, malli, kohde, valinnat = {}) {
  const t = arvioi(aineisto, malli, kohde, valinnat);
  if (t.virhe) return t;
  const kk = kauppiasKorjaus(aineisto, malli, kohde, t, valinnat);
  if (!kk.korjaus) return { ...t, kauppias: kk, laskurinOmaArvio: t.arvio };
  const f = Math.exp(kk.korjaus);
  return {
    ...t, arvio: t.arvio * f, ala80: t.ala80 * f, yla80: t.yla80 * f, ala50: t.ala50 * f, yla50: t.yla50 * f,
    logArvio: t.logArvio + kk.korjaus, laskurinOmaArvio: t.arvio, kauppias: kk,
  };
}

/**
 * Saman mallin verrokeista sovitetaan painotettu paikallinen regressio. Verrokit on jo siirretty kohdeautoon
 * yleisillä kertoimilla; tämä sovitus korjaa mallikohtaisen poikkeaman iän, kilometrien, tehon ja ajan
 * vaikutuksessa. Korjaukset kutistetaan kohti nollaa (= yleiset kertoimet), joten vähällä aineistolla tulos
 * on lähellä painotettua keskiarvoa. Vakiotermi on arvio kohdeautolle.
 */
function paikallinenSovitus(ehdokkaat, A, kohde, ika) {
  const P = ASETUKSET.paikallinen;
  const rivit = ehdokkaat.filter((e) => e.taso === "malli" || (P.sarjaPaino > 0 && e.taso === "sarja"));
  if (rivit.length < P.minLkm) return null;
  let W = 0, W2 = 0;
  for (const e of rivit) { e._w = e.taso === "malli" ? e.w : e.w * P.sarjaPaino; W += e._w; W2 += e._w * e._w; }
  const ess = (W * W) / W2;
  if (ess < P.minEss) return null;
  const norm = ess / W;
  const lkwT = Number.isFinite(kohde.lkwSiirto) ? kohde.lkwSiirto : Math.log(kohde.kw), kmT = kohde.km / 10;
  const p = P.ikaKaarevuus > 0 ? 6 : 5;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  const d = new Float64Array(p);
  for (const e of rivit) {
    const r = e.r;
    d[0] = 1; d[1] = A.ika[r] - ika; d[2] = A.km[r] / 10 - kmT; d[3] = A.lkw[r] - lkwT; d[4] = (A.paatos[r] - kohde.verotus) / VUOSI_MS;
    if (p === 6) d[5] = d[1] * d[1];
    let w = e._w * norm;
    if (P.kmHajonta > 0) {
      const dk = Math.log((A.km[r] + 5) / (kohde.km + 5)) / P.kmHajonta;
      w *= Math.exp(-0.5 * dk * dk);
    }
    for (let a = 0; a < p; a++) {
      Xty[a] += w * d[a] * e.siirretty;
      for (let b = 0; b < p; b++) XtX[a][b] += w * d[a] * d[b];
    }
  }
  const priorit = p === 6 ? [...P.priori, P.ikaKaarevuus] : P.priori;
  for (let j = 1; j < p; j++) XtX[j][j] += (P.jaannos * P.jaannos) / (priorit[j - 1] * priorit[j - 1]);
  const beta = ratkaise(XtX, Xty);
  if (!Number.isFinite(beta[0])) return null;
  return { arvio: beta[0], korjaukset: beta.slice(1), ess };
}

// Vaihteluvälit lasketaan tukitason lisäksi käyttövoiman ja iän mukaan, jos ryhmässä on tarpeeksi testituloksia:
// esim. vanhojen polttomoottoriautojen arviot heittelevät enemmän kuin uusien sähköautojen.
function kalibrointiAvain(tuki, ryhma, ika) {
  return `${tuki}|${ryhma === "EV" ? "S" : "P"}|${ika < 6 ? "U" : ika < 12 ? "K" : "V"}`;
}
export function valitseKalibrointi(kalibrointi, tuki, ryhma, ika, tehoUlkona = 0) {
  if (!kalibrointi) return null;
  const perus = kalibrointi.tuki[tuki] || null;
  if (!perus) return null;
  if (tehoUlkona) {
    // Kohteen teho on mallin aiempien päätösten tehoalueen ulkopuolella: oma harha ja leveämpi väli
    const U = kalibrointi.ulkona || {};
    const suuntaNimi = tehoUlkona > 0 ? "yli" : "ali";
    const suunta = ASETUKSET.ulkonaSuunnittain ? U[suuntaNimi] : null;
    const omaSuunta = suunta && suunta.n >= ASETUKSET.kalibrointiMinRyhma;
    const ulk = omaSuunta ? suunta : U.kaikki;
    if (ulk && ulk.n >= ASETUKSET.kalibrointiMinRyhma) {
      const harha = omaSuunta && ASETUKSET.ulkonaHarha[suuntaNimi] ? ulk.mediaani : 0;
      return { ...ulk, mediaani: perus.mediaani + harha };
    }
    const q = perus.kvantiilit, L = ASETUKSET.ulkonaLevennys;
    return { ...perus, kvantiilit: { p10: q.p10 * L, p25: q.p25 * L, p75: q.p75 * L, p90: q.p90 * L } };
  }
  const ryhmaKal = kalibrointi.ryhmat && kalibrointi.ryhmat[kalibrointiAvain(tuki, ryhma, ika)];
  if (!ryhmaKal) return perus;
  return { ...ryhmaKal, mediaani: perus.mediaani };
}

// Oletusvälit (log-asteikko), jos kalibrointia ei ole saatavilla
const OLETUSKVANTIILIT = {
  A: { p10: -0.1, p25: -0.05, p75: 0.05, p90: 0.1 },
  B: { p10: -0.15, p25: -0.07, p75: 0.07, p90: 0.15 },
  C: { p10: -0.25, p25: -0.12, p75: 0.12, p90: 0.25 },
  D: { p10: -0.4, p25: -0.2, p75: 0.2, p90: 0.4 },
  E: { p10: -0.7, p25: -0.35, p75: 0.35, p90: 0.7 },
};
export const TUKI_SELITE = {
  A: "Runsaasti saman mallin päätöksiä lähellä kohdeautoa",
  B: "Muutama saman mallin päätös lähellä kohdeautoa",
  C: "Vähän saman mallin tai mallisarjan päätöksiä",
  D: "Hyvin vähän lähellä olevia päätöksiä, merkin muut mallit tukevat arviota",
  E: "Merkistä ei juuri ole päätöksiä, arvio on hyvin suuntaa antava",
};

// ---------- merkkien keskimääräiset poikkeamat (kaikkien merkkien tasolle) ----------

export function laskeMerkkiPoikkeamat(aineisto, malli) {
  const { A, sanasto } = aineisto;
  const tulos = {};
  RYHMAT.forEach((ryhma, gi) => {
    const K = malli.kertoimet[ryhma];
    if (!K) return;
    const pB = PIIRRE_LKM + luokkaLkm(K.luokat);
    const x = new Float64Array(pB + 1);
    const summat = new Map();
    for (const r of aineisto.ryhmaRivit[gi]) {
      rivinPiirteet(aineisto, r, K.luokat, x);
      x[pB] = 1;
      const e = A.y[r] - indeksiArvo(K.indeksi, A.kk[r]) - pistetulo(K.kaikki.beta, x, pB + 1);
      const m = A.merkki[r];
      const s = summat.get(m) || { n: 0, s: 0, ss: 0 };
      s.n++; s.s += e; s.ss += e * e;
      summat.set(m, s);
    }
    tulos[ryhma] = {};
    for (const [m, s] of summat) {
      if (s.n < 3) continue;
      const ka = s.s / s.n;
      const hajonta = Math.sqrt(Math.max(0.01, s.ss / s.n - ka * ka));
      // kutistetaan pienillä otoksilla kohti nollaa
      tulos[ryhma][sanasto.merkki[m]] = {
        poikkeama: Math.round((ka * s.n) / (s.n + 5) * 1e4) / 1e4,
        hajonta: Math.round(hajonta * 1e4) / 1e4,
        n: s.n,
      };
    }
  });
  return tulos;
}

// ---------- tarkkuustesti ja kalibrointi ----------

function kvantiili(lajiteltu, p) {
  if (!lajiteltu.length) return 0;
  const i = (lajiteltu.length - 1) * p;
  const a = Math.floor(i), b = Math.ceil(i);
  return lajiteltu[a] + (lajiteltu[b] - lajiteltu[a]) * (i - a);
}

/**
 * Ennustaa jokaisen valitun päätöksen ilman sitä itseään ja kokoaa virhejakaumat.
 * Kaikki harvinaiset päätökset testataan; yleisistä otetaan satunnaisotos.
 */
export function kalibroi(aineisto, malli, { yleisiaOtos = 4000, siemen = 7, maxTestit = 15000 } = {}) {
  const { A, sanasto } = aineisto;
  let s = siemen;
  const satunnainen = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const virheet = { A: [], B: [], C: [], D: [], E: [] };
  const virheetTarkka = {};
  const ulkonaVirheet = [];
  const luokittain = { yleinen: [], harvinainen: [], erittain: [] };
  const rivit = [];
  // Testataan vain viimeisen vuoden päätökset: välit kuvaavat silloin nykyistä markkinaa
  const v = Math.floor(aineisto.viimeisinPaatos / 10000), kk = Math.floor(aineisto.viimeisinPaatos / 100) % 100;
  const testiAlku = Date.UTC(v, kk - 1 - ASETUKSET.kalibrointiKk, 1);
  for (let r = 0; r < aineisto.n; r++) {
    if (A.lahde[r]) continue; // kauppiaiden arvioita ei testata
    if (A.arvo[r] < 500) continue; // hyvin vanhat autot, joiden arvo on lähes nolla
    if (A.paatos[r] < testiAlku) continue;
    const lkm = aineisto.malliLkm.get(A.malli[r]);
    if (lkm < 30 || satunnainen() < yleisiaOtos / aineisto.n) rivit.push(r);
  }
  // Suurella aineistolla rajataan testattavien määrä satunnaisotokseksi, jotta ajo pysyy nopeana
  if (rivit.length > maxTestit) {
    for (let i = rivit.length - 1; i > 0; i--) {
      const j = Math.floor(satunnainen() * (i + 1));
      [rivit[i], rivit[j]] = [rivit[j], rivit[i]];
    }
    rivit.length = maxTestit;
  }
  const tasoValimuisti = new Map();
  for (const r of rivit) {
    const kohde = rivinKohde(aineisto, r);
    if (!tasoValimuisti.has(A.malli[r])) tasoValimuisti.set(A.malli[r], malliTasot(aineisto, kohde.merkki, kohde.malli));
    kohde.tasoKartta = tasoValimuisti.get(A.malli[r]);
    const tulos = arvioi(aineisto, { ...malli, kalibrointi: null }, kohde, { poissulje: r, verrokkeja: 0 });
    if (tulos.virhe) continue;
    const e = A.y[r] - tulos.logArvio;
    virheet[tulos.tuki].push(e);
    const avain = kalibrointiAvain(tulos.tuki, kohde.ryhma, tulos.ika);
    (virheetTarkka[avain] ||= []).push(e);
    // harvinaisuus ilman testattavaa riviä
    const h = harvinaisuus(aineisto, kohde);
    const vahennys = 1;
    const lahella = Math.max(h.malli, h.sarja) - vahennys;
    const luokka = lahella >= 30 ? "yleinen" : lahella >= 5 ? "harvinainen" : "erittain";
    luokittain[luokka].push({ e, tuki: tulos.tuki, ryhma: kohde.ryhma, ika: tulos.ika, ulkona: tulos.tehoUlkona });
    if (tulos.tehoUlkona !== 0) ulkonaVirheet.push({ e, tuki: tulos.tuki, suunta: tulos.tehoUlkona > 0 ? "yli" : "ali" });
  }
  const kalibrointi = { tuki: {}, ryhmat: {}, luokat: {}, testattu: rivit.length, tehty: new Date().toISOString() };
  const jakauma = (lista) => {
    const l = lista.slice().sort((a, b) => a - b);
    const med = kvantiili(l, 0.5);
    const keskitetty = l.map((v) => v - med);
    const abs = keskitetty.map(Math.abs).sort((a, b) => a - b);
    return {
      n: l.length,
      mediaani: Math.round(med * 1e4) / 1e4,
      kvantiilit: {
        p10: kvantiili(keskitetty, 0.1), p25: kvantiili(keskitetty, 0.25),
        p75: kvantiili(keskitetty, 0.75), p90: kvantiili(keskitetty, 0.9),
      },
      mediaaniVirhePros: Math.round((Math.exp(kvantiili(abs, 0.5)) - 1) * 1000) / 10,
    };
  };
  for (const [tuki, lista] of Object.entries(virheet)) {
    kalibrointi.tuki[tuki] = lista.length < 20
      ? { n: lista.length, mediaani: 0, kvantiilit: OLETUSKVANTIILIT[tuki] } : jakauma(lista);
  }
  for (const [avain, lista] of Object.entries(virheetTarkka)) {
    if (lista.length >= ASETUKSET.kalibrointiMinRyhma) kalibrointi.ryhmat[avain] = jakauma(lista);
  }
  // Tehon ääripäät: virheet suhteessa tukitason harhaan
  // (erikseen mallin tehoalueen ylä- ja alapuolelle: harha on eri suuntiin)
  const ulkonaJakauma = (lista) => (lista.length ? jakauma(lista.map((o) => o.e - (kalibrointi.tuki[o.tuki]?.mediaani || 0))) : null);
  kalibrointi.ulkona = {
    yli: ulkonaJakauma(ulkonaVirheet.filter((o) => o.suunta === "yli")),
    ali: ulkonaJakauma(ulkonaVirheet.filter((o) => o.suunta === "ali")),
    kaikki: ulkonaJakauma(ulkonaVirheet),
  };
  for (const [luokka, lista] of Object.entries(luokittain)) {
    const abs = lista.map((o) => Math.abs(o.e - (valitseKalibrointi(kalibrointi, o.tuki, o.ryhma, o.ika, o.ulkona)?.mediaani || 0))).sort((a, b) => a - b);
    const sisalla = lista.filter((o) => {
      const k = valitseKalibrointi(kalibrointi, o.tuki, o.ryhma, o.ika, o.ulkona);
      const e = o.e - k.mediaani;
      return e >= k.kvantiilit.p10 && e <= k.kvantiilit.p90;
    }).length;
    kalibrointi.luokat[luokka] = {
      n: lista.length,
      mediaaniVirhePros: lista.length ? Math.round((Math.exp(kvantiili(abs, 0.5)) - 1) * 1000) / 10 : null,
      alle10Pros: lista.length ? Math.round((abs.filter((v) => v < Math.log(1.1)).length / abs.length) * 1000) / 10 : null,
      valinOsuma: lista.length ? Math.round((sisalla / lista.length) * 1000) / 10 : null,
    };
  }
  return kalibrointi;
}

/**
 * Ajallinen testi: malli opetetaan päätöksillä ennen rajapäivää ja sillä ennustetaan rajan jälkeiset
 * päätökset. Vastaa todellista käyttöä paremmin kuin satunnainen poisjättö.
 */
export function ajallinenTesti(aineisto, raja, { kalibroiOpetus = true, historiaAlku = -Infinity, luokittelu = null } = {}) {
  const opetus = osajoukko(aineisto, (r) => aineisto.A.paatos[r] < raja && aineisto.A.paatos[r] >= historiaAlku);
  const malli = koulutaMalli(opetus);
  malli.merkkiPoikkeamat = laskeMerkkiPoikkeamat(opetus, malli);
  if (kalibroiOpetus) malli.kalibrointi = kalibroi(opetus, malli);
  const { A } = aineisto;
  const luokat = { yleinen: [], harvinainen: [], erittain: [] };
  const valimuisti = new Map();
  for (let r = 0; r < aineisto.n; r++) {
    if (A.paatos[r] < raja || A.arvo[r] < 500 || A.lahde[r]) continue;
    const kohde = rivinKohde(aineisto, r);
    const avain = kohde.merkki + "|" + kohde.malli;
    if (!valimuisti.has(avain)) valimuisti.set(avain, malliTasot(opetus, kohde.merkki, kohde.malli));
    kohde.tasoKartta = valimuisti.get(avain);
    const t = arvioi(opetus, malli, kohde, { verrokkeja: 0 });
    if (t.virhe) continue;
    const h = luokittelu ? harvinaisuus(luokittelu, { ...kohde, tasoKartta: undefined }) : harvinaisuus(opetus, kohde);
    luokat[h.luokka].push({ e: A.y[r] - t.logArvio, sisalla: A.arvo[r] >= t.ala80 && A.arvo[r] <= t.yla80 });
  }
  const tulos = {};
  for (const [l, lista] of Object.entries(luokat)) {
    const abs = lista.map((o) => Math.abs(o.e)).sort((a, b) => a - b);
    tulos[l] = {
      n: lista.length,
      mediaaniVirhePros: lista.length ? Math.round((Math.exp(kvantiili(abs, 0.5)) - 1) * 1000) / 10 : null,
      alle10Pros: lista.length ? Math.round((abs.filter((v) => v < Math.log(1.1)).length / abs.length) * 1000) / 10 : null,
      valinOsuma: lista.length ? Math.round((lista.filter((o) => o.sisalla).length / lista.length) * 1000) / 10 : null,
    };
  }
  return tulos;
}

// ---------- uushintamenetelmä (autoverolaki: arvo johdetaan uuden auton hinnasta) ----------

/**
 * Laskennallinen arvo vastaavan uuden auton hinnasta: −3 % käyttöönottokuukaudelta,
 * −2 % kahdelta seuraavalta täydeltä kuukaudelta ja sen jälkeen −1 % kuukaudessa jäännösarvosta.
 */
export function uushintaKerroin(ensirek, verotus) {
  const a = new Date(ensirek), b = new Date(verotus);
  let taydet = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - 1;
  taydet = Math.max(0, taydet);
  return 0.97 * Math.pow(0.98, Math.min(2, taydet)) * Math.pow(0.99, Math.max(0, taydet - 2));
}
