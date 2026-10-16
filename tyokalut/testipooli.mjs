// Arviointitestin autopooli (data/testi.json).
//
// Testissä kauppias arvioi autoja, jotka Verohallinto on jo verottanut, näkemättä laskurin arviota tai
// toteutunutta veroa (sokkotesti). Pooliin valitaan viimeisten kuukausien päätöksistä merkeittäin ja
// harvinaisuusluokittain enintään `perRyhma` autoa, eri malleja ensin. Jokaiselle lasketaan laskurin arvio
// ilman autoa itseään, jotta kauppiaan ja laskurin osuvuutta voidaan verrata reilusti.
// Lisäksi tallennetaan nykyhintakerroin: kuinka paljon saman auton verotusarvo on muuttunut verotuskuukaudesta
// uusimpaan kuukauteen laskurin hintaindeksin mukaan (käyttövoimaryhmittäin). Kauppias arvioi nykyhinnoin,
// joten vertailussa toteutunut arvo kerrotaan tällä.
//
// Käyttö: kuukausiajo (rakenna_malli.mjs) kutsuu funktiota teeTestipooli.

import {
  arvioi, harvinaisuus, malliTasot, rivinKohde, ERIKOISKORIT, polttoaineryhma, kuukausiNumero, indeksiArvo, pvmLuvusta,
} from "../js/malli.js";

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
// Pakettiauto- ja matkailuautopohjat eivät ole kauppiaiden tavallisia henkilöautoja
const PAKETTIMALLIT = /\b(SPRINTER|CRAFTER|DUCATO|TRANSIT|MASTER|MOVANO|BOXER|JUMPER|DAILY|GRAND CALIFORNIA|CALIFORNIA|NV400|INTERSTAR)\b/;

/** Lyhyt pysyvä tunniste auton tiedoista (FNV-1a). */
function tunniste(teksti) {
  let h = 0x811c9dc5;
  for (let i = 0; i < teksti.length; i++) { h ^= teksti.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export function teeTestipooli(aineisto, malli, { kuukausia = 6, perRyhma = 10, siemen = 20261016 } = {}) {
  const { A, sanasto } = aineisto;
  const v = Math.floor(aineisto.viimeisinPaatos / 10000), kk = Math.floor(aineisto.viimeisinPaatos / 100) % 100;
  const alku = Date.UTC(v, kk - kuukausia, 1);
  const ryhmat = new Map(); // "MERKKI|luokka" -> ehdokkaat
  const tasoMuisti = new Map();
  for (let r = 0; r < aineisto.n; r++) {
    if (A.lahde[r] || A.paatos[r] < alku) continue;
    // Verottomat ja hyvin edulliset autot eivät kerro arvioinnin osuvuudesta; erikoiskorit eivät ole kauppiaiden tavallisia autoja
    if (!(A.veropros[r] > 0) || A.arvo[r] < 3000 || A.arvo[r] > 300000) continue;
    if (A.ika[r] < 1.5 || A.ika[r] > 20 || !(A.km[r] > 0)) continue;
    if (ERIKOISKORIT.has(sanasto.korimalli[A.korimalli[r]])) continue;
    const kohde = rivinKohde(aineisto, r);
    if (PAKETTIMALLIT.test(kohde.malli)) continue;
    const avain = kohde.merkki + "|" + kohde.malli;
    if (!tasoMuisti.has(avain)) tasoMuisti.set(avain, malliTasot(aineisto, kohde.merkki, kohde.malli));
    kohde.tasoKartta = tasoMuisti.get(avain);
    const h = harvinaisuus(aineisto, kohde);
    const lahella = Math.max(h.malli, h.sarja) - 1; // ilman autoa itseään
    const luokka = lahella >= 30 ? "yleinen" : lahella >= 5 ? "harvinainen" : "erittain";
    const g = kohde.merkki + "|" + luokka;
    if (!ryhmat.has(g)) ryhmat.set(g, []);
    ryhmat.get(g).push({ r, kohde, luokka });
  }

  // Nykyinen hintataso = uusimman päätöskuukauden taso
  const nytKk = kuukausiNumero(pvmLuvusta(aineisto.viimeisinPaatos));
  const nykyhinta = (kayttovoima, paatos) => {
    const K = malli.kertoimet[polttoaineryhma(kayttovoima)];
    if (!K) return 1;
    return Math.round(Math.exp(indeksiArvo(K.indeksi, nytKk) - indeksiArvo(K.indeksi, kuukausiNumero(paatos))) * 10000) / 10000;
  };
  let s = siemen;
  const satunnainen = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const autot = [];
  for (const [, lista] of [...ryhmat.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(satunnainen() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    const mallit = new Set();
    const valitut = [];
    for (const o of lista) {
      if (valitut.length >= perRyhma) break;
      if (mallit.has(A.malli[o.r])) continue;
      mallit.add(A.malli[o.r]);
      valitut.push(o);
    }
    for (const o of lista) {
      if (valitut.length >= perRyhma) break;
      if (!valitut.includes(o)) valitut.push(o);
    }
    for (const o of valitut) {
      const t = arvioi(aineisto, malli, { ...o.kohde }, { poissulje: o.r, verrokkeja: 0 });
      if (t.virhe) continue;
      const r = o.r;
      const auto = {
        merkki: o.kohde.merkki, malli: o.kohde.malli, kw: A.kw[r], kayttovoima: o.kohde.kayttovoima,
        korimalli: o.kohde.korimalli || null, vetotapa: o.kohde.vetotapa || null,
        vaihteisto: sanasto.vaihteisto[A.vaihteisto[r]] === "AUT" ? "AUT" : "",
        cm3: A.cm3[r] || 0, ovet: A.ovet[r] || 0, ensirek: iso(A.ensirek[r]), km: Math.round(A.km[r] * 1000),
      };
      autot.push({
        id: tunniste(JSON.stringify(auto) + iso(A.paatos[r]) + A.arvo[r]),
        luokka: o.luokka, tuki: t.tuki, auto, verotettu: iso(A.paatos[r]), veroprosentti: Math.round(A.veropros[r] * 10) / 10,
        laskuri: { arvo: Math.round(t.arvio), ala80: Math.round(t.ala80), yla80: Math.round(t.yla80) },
        toteutunut: { arvo: A.arvo[r] },
        nykyhinta: { kerroin: nykyhinta(o.kohde.kayttovoima, A.paatos[r]) },
      });
    }
  }
  const lkm = { yleinen: 0, harvinainen: 0, erittain: 0 };
  for (const a of autot) lkm[a.luokka]++;
  return {
    tyyppi: "autoveroarvio-testipooli", versio: 1, luotu: new Date().toISOString(), laskurinVersio: malli.versio,
    jakso: { alku: iso(alku), loppu: iso(Date.UTC(v, kk - 1, aineisto.viimeisinPaatos % 100)) },
    hintatasoKuukausi: `${v}-${String(kk).padStart(2, "0")}`, lkm, autot,
  };
}
