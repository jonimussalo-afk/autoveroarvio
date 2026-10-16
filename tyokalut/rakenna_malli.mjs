// Opettaa arviomallin data/-kansion päätöksistä, mittaa sen tarkkuuden ja tallentaa:
//   data/malli.json            kertoimet, hintaindeksi, tarkkuus ja valintalistat
//   data/merkit/<merkki>.json  kunkin merkin päätökset (selain lataa vain valitun merkin) sekä kauppiaiden
//                              arviot koulutustilasta (data/palaute/*.json), joita ei ole vielä korvannut päätös
// Käyttö: node tyokalut/rakenna_malli.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  yhdistaAineisto, koulutaMalli, laskeMerkkiPoikkeamat, kalibroi, ajallinenTesti, TUKI_SELITE,
} from "../js/malli.js";
import { tuoJson, yhdistaPalautteet, etsiToteutunut, arvoKauppiaalta, palautteetTiedostoksi } from "../js/palaute.js";
import { teeTestipooli } from "./testipooli.mjs";

const juuri = join(dirname(fileURLToPath(import.meta.url)), "..");
const kansio = join(juuri, "data");
const hakemisto = JSON.parse(readFileSync(join(kansio, "hakemisto.json"), "utf8"));
const tiedostot = hakemisto.tiedostot.map((t) => JSON.parse(readFileSync(join(kansio, t), "utf8")));

let alku = Date.now();
const aineisto = yhdistaAineisto(tiedostot);
console.log(`Aineisto: ${aineisto.n} päätöstä (${hakemisto.tiedostot.join(", ")}), luettu ${Date.now() - alku} ms`);

alku = Date.now();
const malli = koulutaMalli(aineisto);
malli.merkkiPoikkeamat = laskeMerkkiPoikkeamat(aineisto, malli);
console.log(`Koulutus valmis ${Date.now() - alku} ms`);
{
  let mallit = 0, rajat = 0;
  for (const T of Object.values(malli.sukupolvet || {})) for (const sp of Object.values(T)) { mallit++; rajat += sp.rajat.length; }
  console.log(`  Mallisukupolvet: ${mallit} mallissa tunnistettu yhteensä ${rajat} hintatason porrasta`);
}
for (const [ryhma, K] of Object.entries(malli.kertoimet)) {
  const a = K.indeksi.arvot;
  console.log(`  ${ryhma}: n=${K.n}, mallin sisäinen hajonta ${(K.malli.hajonta * 100).toFixed(1)} %, ` +
    `merkin sisäinen ${(K.merkki.hajonta * 100).toFixed(1)} %, hintataso nyt vs. alussa ${((Math.exp(a[a.length - 1] - a[0]) - 1) * 100).toFixed(1)} %`);
}

alku = Date.now();
malli.kalibrointi = kalibroi(aineisto, malli);
console.log(`Tarkkuustesti: ${malli.kalibrointi.testattu} päätöstä ennustettu ilman itseään (${((Date.now() - alku) / 1000).toFixed(1)} s)`);
for (const [tuki, k] of Object.entries(malli.kalibrointi.tuki)) {
  const q = k.kvantiilit;
  console.log(`  Tuki ${tuki} (${TUKI_SELITE[tuki]}): n=${k.n}, mediaanivirhe ${k.mediaaniVirhePros ?? "-"} %, ` +
    `80 % väli ${(Math.exp(q.p10) * 100 - 100).toFixed(0)} % … +${(Math.exp(q.p90) * 100 - 100).toFixed(0)} %`);
}
for (const [luokka, k] of Object.entries(malli.kalibrointi.luokat)) {
  console.log(`  ${luokka}: n=${k.n}, mediaanivirhe ${k.mediaaniVirhePros} %, alle 10 % virhe ${k.alle10Pros} %, 80 % välin osuma ${k.valinOsuma} %`);
}
for (const [suunta, k] of Object.entries(malli.kalibrointi.ulkona || {})) {
  if (!k) continue;
  console.log(`  Teho mallin tehoalueen ${suunta === "yli" ? "yläpuolella" : suunta === "ali" ? "alapuolella" : "ulkopuolella"}: n=${k.n}, ` +
    `harha ${((Math.exp(k.mediaani) - 1) * 100).toFixed(1)} %, mediaanivirhe ${k.mediaaniVirhePros} %`);
}

// Ajallinen testi: opetetaan kolmea kuukautta aiemmilla päätöksillä, ennustetaan viimeiset kolme kuukautta
const v = Math.floor(aineisto.viimeisinPaatos / 10000), k = Math.floor(aineisto.viimeisinPaatos / 100) % 100;
const raja = Date.UTC(v, k - 3, 1);
alku = Date.now();
malli.ajallinen = { raja: new Date(raja).toISOString().slice(0, 10), luokat: ajallinenTesti(aineisto, raja) };
console.log(`Ajallinen testi (ennustettu ${malli.ajallinen.raja} alkaen tehdyt päätökset, ${((Date.now() - alku) / 1000).toFixed(1)} s):`);
for (const [luokka, t] of Object.entries(malli.ajallinen.luokat)) {
  console.log(`  ${luokka}: n=${t.n}, mediaanivirhe ${t.mediaaniVirhePros} %, alle 10 % virhe ${t.alle10Pros} %, 80 % välin osuma ${t.valinOsuma} %`);
}

// ---------- kauppiaiden arviot (koulutustila) ----------
// Arviot luetaan kansiosta data/palaute/. Jos samasta autosta on sittemmin tehty Verohallinnon päätös, arvio
// korvautuu päätöksellä, ja sitä käytetään kauppiaiden osuvuuden mittaamiseen. Muut arviot lisätään
// merkkitiedostoihin verrokeiksi (lähde = kauppiaan arvio).
const palauteKansio = join(kansio, "palaute");
let palautteet = [];
if (existsSync(palauteKansio)) {
  for (const f of readdirSync(palauteKansio).filter((f) => f.endsWith(".json")).sort()) {
    try {
      palautteet = yhdistaPalautteet(palautteet, tuoJson(readFileSync(join(palauteKansio, f), "utf8")));
    } catch (e) {
      console.warn(`VAROITUS: ${f} ei ole kelvollinen arviotiedosto (${e.message})`);
    }
  }
}
const tarkistetut = [], kaytossa = [];
for (const pa of palautteet) {
  const r = etsiToteutunut(aineisto, pa);
  if (r >= 0) tarkistetut.push({ pa, r }); else kaytossa.push(pa);
}
const mediaani = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const virheKauppias = tarkistetut.map(({ pa, r }) => Math.abs(Math.log(arvoKauppiaalta(pa) / aineisto.A.arvo[r])));
const virheLaskuri = tarkistetut.filter(({ pa }) => pa.laskuri && pa.laskuri.arvo > 0)
  .map(({ pa, r }) => Math.abs(Math.log(pa.laskuri.arvo / aineisto.A.arvo[r])));
const pros = (x) => (x == null ? null : Math.round((Math.exp(x) - 1) * 1000) / 10);
malli.koulutus = {
  arvioita: palautteet.length,
  verrokkeina: kaytossa.length,
  kauppiaita: new Set(palautteet.map((pa) => pa.kauppias || "?")).size,
  tarkistettu: {
    n: tarkistetut.length,
    kauppiaanMediaaniVirhePros: pros(mediaani(virheKauppias)),
    laskurinMediaaniVirhePros: pros(mediaani(virheLaskuri)),
    kauppiasLahempana: tarkistetut.filter(({ pa, r }) => pa.laskuri && pa.laskuri.arvo > 0
      && Math.abs(Math.log(arvoKauppiaalta(pa) / aineisto.A.arvo[r])) < Math.abs(Math.log(pa.laskuri.arvo / aineisto.A.arvo[r]))).length,
  },
};
// Kun arvioita on verrattu riittävän moneen päätökseen, korjauksen kutistus säädetään osuvuuden mukaan:
// (kauppiaan virhe / laskurin virhe)², rajattuna välille 0,25–4. Osuvat kauppiaat korjaavat siis enemmän.
if (virheKauppias.length >= 20 && virheLaskuri.length >= 20) {
  const suhde = (mediaani(virheKauppias) / Math.max(0.005, mediaani(virheLaskuri))) ** 2;
  malli.kauppiasKutistus = Math.round(Math.min(4, Math.max(0.25, suhde)) * 100) / 100;
}
console.log(`Kauppiaiden arviot: ${palautteet.length} (${malli.koulutus.kauppiaita} kauppiasta), verrokkeina ${kaytossa.length}, ` +
  `toteutuneeseen päätökseen verrattu ${tarkistetut.length}` +
  (tarkistetut.length ? ` (kauppiaan mediaanivirhe ${malli.koulutus.tarkistettu.kauppiaanMediaaniVirhePros} %, ` +
    `laskurin ${malli.koulutus.tarkistettu.laskurinMediaaniVirhePros} %)` : "") +
  (malli.kauppiasKutistus ? `, korjauksen kutistuskerroin ${malli.kauppiasKutistus}` : ""));

// Arviointitestin perusteella tehty kauppiaskohtainen kalibrointi (harha ja paino), ks. README
const kalibrointiPolku = join(kansio, "kalibrointi.json");
if (existsSync(kalibrointiPolku)) {
  try {
    const kal = JSON.parse(readFileSync(kalibrointiPolku, "utf8"));
    const kauppiaat = {};
    for (const [tunnus, k] of Object.entries(kal.kauppiaat || {})) {
      const harha = Number(k.harha), paino = Number(k.paino);
      kauppiaat[tunnus] = {
        harha: Number.isFinite(harha) ? Math.max(-0.5, Math.min(0.5, harha)) : 0,
        paino: Number.isFinite(paino) ? Math.max(0, Math.min(5, paino)) : 1,
      };
    }
    malli.kauppiaskalibrointi = { paivitetty: kal.paivitetty || null, kauppiaat };
    console.log(`Kalibrointi: ${Object.keys(kauppiaat).length} kauppiaan harha ja paino (data/kalibrointi.json)`);
  } catch (e) {
    console.warn(`VAROITUS: data/kalibrointi.json ei ole kelvollinen (${e.message})`);
  }
}

// ---------- merkkikohtaiset tiedostot ----------
const merkkiKansio = join(kansio, "merkit");
mkdirSync(merkkiKansio, { recursive: true });
for (const f of readdirSync(merkkiKansio)) if (f.endsWith(".json")) unlinkSync(join(merkkiKansio, f));

const SARAKKEET = ["merkki", "malli", "kayttovoima", "korimalli", "vetotapa", "vaihteisto"];
const merkit = new Map(); // nimi -> { sanastot, hakemistot, sarakkeet, rivit }
const LAHDESARAKKEET = ["lahde", "palauteId", "kauppias"]; // vain merkeille, joilla on kauppiaiden arvioita
const kauppiasTiedosto = kaytossa.length ? [palautteetTiedostoksi(kaytossa)] : [];
for (const t of [...tiedostot, ...kauppiasTiedosto]) {
  const S = t.sarakkeet, D = t.sanastot;
  const lukusarakkeet = Object.keys(S).filter((c) => !SARAKKEET.includes(c) && !LAHDESARAKKEET.includes(c));
  for (let r = 0; r < t.rivit; r++) {
    const nimi = D.merkki[S.merkki[r]];
    let m = merkit.get(nimi);
    if (!m) {
      m = { sanastot: Object.fromEntries(SARAKKEET.map((c) => [c, []])), hak: Object.fromEntries(SARAKKEET.map((c) => [c, new Map()])),
        sarakkeet: {}, rivit: 0, lahde: [], palauteId: [], kauppias: 0, kauppiasSanasto: [""], kauppiasHak: new Map([["", 0]]), kauppiasRivit: [] };
      merkit.set(nimi, m);
    }
    const onKauppias = S.lahde ? S.lahde[r] === 1 : false;
    m.lahde.push(onKauppias ? 1 : 0);
    m.palauteId.push(onKauppias ? S.palauteId[r] : 0);
    const tunnus = onKauppias && S.kauppias ? D.kauppias[S.kauppias[r]] || "" : "";
    if (!m.kauppiasHak.has(tunnus)) { m.kauppiasHak.set(tunnus, m.kauppiasSanasto.length); m.kauppiasSanasto.push(tunnus); }
    m.kauppiasRivit.push(m.kauppiasHak.get(tunnus));
    if (onKauppias) m.kauppias++;
    for (const c of SARAKKEET) {
      const arvo = D[c][S[c][r]];
      let i = m.hak[c].get(arvo);
      if (i === undefined) { i = m.sanastot[c].length; m.sanastot[c].push(arvo); m.hak[c].set(arvo, i); }
      (m.sarakkeet[c] ||= []).push(i);
    }
    for (const c of lukusarakkeet) (m.sarakkeet[c] ||= []).push(S[c][r]);
    m.rivit++;
  }
}
const tiedostonimi = (nimi) => nimi.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "MUU";
const kaytetyt = new Set();
const merkkiLista = [];
for (const [nimi, m] of [...merkit.entries()].sort((a, b) => b[1].rivit - a[1].rivit)) {
  let f = tiedostonimi(nimi);
  while (kaytetyt.has(f)) f += "-2";
  kaytetyt.add(f);
  const sanastot = m.kauppias ? { ...m.sanastot, kauppias: m.kauppiasSanasto } : m.sanastot;
  if (m.kauppias) { m.sarakkeet.lahde = m.lahde; m.sarakkeet.palauteId = m.palauteId; m.sarakkeet.kauppias = m.kauppiasRivit; }
  writeFileSync(join(merkkiKansio, f + ".json"), JSON.stringify({ merkki: nimi, rivit: m.rivit, sanastot, sarakkeet: m.sarakkeet }));
  merkkiLista.push([nimi, m.rivit - m.kauppias, f + ".json"]);
}
console.log(`Kirjoitettu ${merkkiLista.length} merkkitiedostoa kansioon data/merkit/`);

// ---------- arviointitestin autopooli ----------
alku = Date.now();
const pooli = teeTestipooli(aineisto, malli);
writeFileSync(join(kansio, "testi.json"), JSON.stringify(pooli));
console.log(`Arviointitesti: ${pooli.autot.length} autoa (yleisiä ${pooli.lkm.yleinen}, harvinaisia ${pooli.lkm.harvinainen}, ` +
  `erittäin harvinaisia ${pooli.lkm.erittain}) päätöksistä ${pooli.jakso.alku}–${pooli.jakso.loppu} (${((Date.now() - alku) / 1000).toFixed(1)} s)`);

// Valintalistat selaimelle (yleisin ensin)
const laske = (sarake) => {
  const c = new Map();
  for (let r = 0; r < aineisto.n; r++) {
    const arvo = aineisto.sanasto[sarake][aineisto.A[sarake][r]];
    c.set(arvo, (c.get(arvo) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};
malli.yhteenveto = {
  merkit: merkkiLista,
  kayttovoima: laske("kayttovoima"),
  korimalli: laske("korimalli"),
  vetotapa: laske("vetotapa"),
};
malli.aineisto.tiedostot = hakemisto.tiedostot;
malli.aineisto.paivitetty = hakemisto.paivitetty;
writeFileSync(join(kansio, "malli.json"), JSON.stringify(malli));
console.log("Tallennettu data/malli.json");
