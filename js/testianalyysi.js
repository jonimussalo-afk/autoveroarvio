// Arviointitestin tulosten laskenta. Käytössä sekä testisivulla (tulokset) että analyysityökalussa
// (tyokalut/analysoi_testi.mjs), jotta luvut ovat samat molemmissa.

export const LUOKKA_NIMET = { yleinen: "Yleiset mallit", harvinainen: "Harvinaiset", erittain: "Erittäin harvinaiset" };
export const VARMUUS_NIMET = { arvaus: "Arvaus", melko: "Melko varma", varma: "Varma" };

const mediaani = (v) => {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** Log-ero prosentteina (yksi desimaali). */
export const prosentiksi = (x) => (x == null || !Number.isFinite(x) ? null : Math.round((Math.exp(x) - 1) * 1000) / 10);

/** Merkkitesti: todennäköisyys saada vähintään näin epätasainen jako, jos kauppias ja laskuri olisivat yhtä hyviä. */
function merkkitesti(k, n) {
  if (!n) return null;
  const kerroin = (a, b) => { let c = 1; for (let i = 1; i <= b; i++) c = (c * (a - b + i)) / i; return c; };
  let yla = 0, ala = 0;
  for (let i = 0; i <= n; i++) {
    const p = kerroin(n, i) / 2 ** n;
    if (i >= k) yla += p;
    if (i <= k) ala += p;
  }
  return Math.min(1, 2 * Math.min(yla, ala));
}

/**
 * Rivikohtaiset virheet log-asteikolla. Kauppias arvioi nykyhinnoin, joten hänen arviotaan verrataan toteutuneeseen
 * verotusarvoon, joka on muutettu nykyiseen hintatasoon (nykyhinta.kerroin). Laskurin arvio on laskettu
 * verotushetken hintatasolla, joten sitä verrataan toteutuneeseen sellaisenaan.
 */
export function testinRivit(raportti) {
  return raportti.autot.map((a) => {
    const v = a.vastaus || {};
    const toteutunut = a.toteutunut.arvo;
    const kerroin = a.nykyhinta && a.nykyhinta.kerroin > 0 ? a.nykyhinta.kerroin : 1;
    const kauppiaanArvo = v.vero > 0 && a.veroprosentti > 0 ? v.vero / (a.veroprosentti / 100) : null;
    return {
      ...a,
      kauppiaanArvo,
      kerroin,
      toteutunutNyt: toteutunut * kerroin,
      eK: kauppiaanArvo ? Math.log(kauppiaanArvo / (toteutunut * kerroin)) : null,
      eKverotushetki: kauppiaanArvo ? Math.log(kauppiaanArvo / toteutunut) : null,
      eL: Math.log(a.laskuri.arvo / toteutunut),
    };
  });
}

function tunnusluvut(rivit) {
  const v = rivit.filter((r) => r.eK !== null);
  const voitot = v.filter((r) => Math.abs(r.eK) < Math.abs(r.eL)).length;
  return {
    n: v.length,
    kauppiaanMediaaniVirhePros: prosentiksi(mediaani(v.map((r) => Math.abs(r.eK)))),
    laskurinMediaaniVirhePros: prosentiksi(mediaani(v.map((r) => Math.abs(r.eL)))),
    kauppiaanHarhaPros: prosentiksi(mediaani(v.map((r) => r.eK))),
    laskurinHarhaPros: prosentiksi(mediaani(v.map((r) => r.eL))),
    kauppiasLahempana: voitot,
    merkkitesti: v.length ? Math.round(merkkitesti(voitot, v.length) * 1000) / 1000 : null,
  };
}

/**
 * Paras painotus w (kauppiaan osuus) yhdistelmälle w·kauppias + (1 − w)·laskuri: neliövirheen minimi
 * w = (σL² − c) / (σK² + σL² − 2c), kun virheet on rajattu ±0,5:een (log), jottei yksittäinen kirjausvirhe ratkaise.
 */
function painotus(rivit, harha = 0) {
  const raja = (x) => Math.max(-0.5, Math.min(0.5, x));
  const v = rivit.filter((r) => r.eK !== null).map((r) => [raja(r.eK - harha), raja(r.eL)]);
  if (v.length < 3) return { w: null, n: v.length };
  const ka = (f) => v.reduce((s, x) => s + f(x), 0) / v.length;
  const vk = ka(([a]) => a * a), vl = ka(([, b]) => b * b), c = ka(([a, b]) => a * b);
  const nimittaja = vk + vl - 2 * c;
  const w = nimittaja <= 1e-9 ? 0.5 : Math.max(0, Math.min(1, (vl - c) / nimittaja));
  return { w: Math.round(w * 100) / 100, mediaaniVirhePros: prosentiksi(mediaani(v.map(([a, b]) => Math.abs(w * a + (1 - w) * b)))), n: v.length };
}

/**
 * Koko analyysi. Kalibrointiehdotus:
 * - harha: kauppiaan virheiden mediaani (log), kutistettuna kertoimella n / (n + 10)
 * - paino: kauppiaan arvion paino koulutustilan korjauksessa. Paino 1 vastaa oletusta, jossa kauppiaan arvio
 *   samasta erittäin harvinaisesta autosta (tukitaso D) siirtää arviota 40 % erosta (paino / (paino + 1,5)).
 *   Ehdotus valitaan niin, että tämä osuus vastaa harvinaisten autojen parasta painotusta.
 */
export function analysoiTesti(raportti) {
  const rivit = testinRivit(raportti);
  const vastatut = rivit.filter((r) => r.eK !== null);
  const luokittain = Object.fromEntries(Object.keys(LUOKKA_NIMET).map((l) => [l, tunnusluvut(rivit.filter((r) => r.luokka === l))]));
  const varmuuksittain = Object.fromEntries(Object.keys(VARMUUS_NIMET)
    .map((v) => [v, tunnusluvut(rivit.filter((r) => r.vastaus && r.vastaus.varmuus === v))]));
  const harhaRaaka = mediaani(vastatut.map((r) => r.eK)) ?? 0;
  const harha = (harhaRaaka * vastatut.length) / (vastatut.length + 10);
  const harvinaiset = rivit.filter((r) => r.luokka !== "yleinen");
  const pKaikki = painotus(rivit, harha);
  const pHarvinaiset = painotus(harvinaiset, harha);
  // Paras painotus kutistetaan kohti oletusta 0,4 (paino 1) painolla 20 autoa, koska 10–20 autosta se on epävarma
  const nH = pHarvinaiset.n;
  const f = pHarvinaiset.w === null ? null : (nH * pHarvinaiset.w + 20 * 0.4) / (nH + 20);
  let paino = null;
  if (f !== null) paino = f <= 0.02 ? 0 : f >= 0.77 ? 5 : Math.round(((1.5 * f) / (1 - f)) * 100) / 100;
  const riittava = vastatut.length >= 15 && pHarvinaiset.n >= 8;
  const kertoimet = rivit.map((r) => r.kerroin);
  const nykyhinta = {
    kerroinPienin: Math.min(...kertoimet), kerroinSuurin: Math.max(...kertoimet),
    // vertailun vuoksi: kauppiaan virhe verotushetken hintatasoon verrattuna
    ilmanKorjaustaMediaaniVirhePros: prosentiksi(mediaani(vastatut.map((r) => Math.abs(r.eKverotushetki)))),
    ilmanKorjaustaHarhaPros: prosentiksi(mediaani(vastatut.map((r) => r.eKverotushetki))),
  };
  return {
    rivit,
    nykyhinta,
    vastattu: vastatut.length,
    ohitettu: rivit.filter((r) => r.vastaus && r.vastaus.ohitettu).length,
    yhteensa: tunnusluvut(rivit),
    luokittain,
    varmuuksittain,
    painotus: { kaikki: pKaikki, harvinaiset: pHarvinaiset },
    kalibrointi: {
      kauppias: raportti.testi && raportti.testi.kauppias,
      harha: Math.round(harha * 1000) / 1000,
      paino: riittava ? paino : null,
      riittava,
      perustelu: riittava
        ? `Harha ${prosentiksi(harha)} % (${vastatut.length} vastausta, kutistettu). Harvinaisissa autoissa paras painotus oli ` +
          `${Math.round((pHarvinaiset.w || 0) * 100)} % kauppiaan arviota (${nH} autoa); kohti oletusta 40 % kutistettuna ` +
          `${Math.round((f || 0) * 100)} %, mikä vastaa painoa ${paino}.`
        : "Liian vähän vastauksia luotettavaan kalibrointiin (tarvitaan vähintään 15, joista 8 harvinaisia).",
    },
  };
}

export const OHJE_TEKOALYLLE = `Tämä on autoveroarvio-laskurin arviointitestin raportti (https://jonimussalo-afk.github.io/autoveroarvio/).
Kauppias arvioi sokkona, näkemättä laskurin arviota tai toteutunutta veroa, Verohallinnon jo verottamien autojen
autoveron nykyhinnoin (auton ikä ja ajokilometrit kuten verotettaessa). Kentät: auto (auton tiedot), verotettu
(Verohallinnon päätöspäivä), veroprosentti, vastaus.vero (kauppiaan veroarvio euroina; null = ohitettu),
vastaus.varmuus (arvaus / melko / varma), laskuri.arvo (laskurin arvio verotusarvosta verotushetken hintatasolla,
laskettu ilman autoa itseään), toteutunut.arvo (Verohallinnon verotusarvo) ja nykyhinta.kerroin (hintatason muutos
verotuskuukaudesta uusimpaan kuukauteen laskurin hintaindeksin mukaan). Kauppiaan verotusarvo =
vastaus.vero / (veroprosentti / 100); sitä verrataan arvoon toteutunut.arvo × nykyhinta.kerroin, laskurin arviota
arvoon toteutunut.arvo.
Analysoi: (1) kauppiaan ja laskurin virheet log-asteikolla log(arvio / toteutunut): mediaani, keskiarvo ja
itseisarvon mediaani kaikista ja harvinaisuusluokittain (luokka) sekä varmuuden mukaan; (2) kauppiaan harha
(virheiden mediaani etumerkillä) ja onko se luokasta riippumaton; (3) paras painotus w luokittain yhdistelmälle
w·kauppias + (1 − w)·laskuri; (4) suurimmat poikkeamat ja huomiot, joista voi päätellä mitä laskurilta tai
kauppiaalta puuttuu; (5) kalibrointiehdotus tiedostoon data/kalibrointi.json muodossa
{"kauppiaat": {"<testi.kauppias>": {"harha": <log, kutistettuna n/(n+10)>, "paino": <0–5, 1 = oletus>}}}, jossa paino
valitaan niin, että paino / (paino + 1,5) vastaa harvinaisten autojen parasta painotusta kutistettuna kohti oletusta 0,4
(painona 20 autoa). Huomioi pieni otos
(30 autoa), älä ylitulkitse. Työkalu tyokalut/analysoi_testi.mjs laskee samat luvut.`;
