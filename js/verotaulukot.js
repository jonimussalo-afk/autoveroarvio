// Autoveroprosentit henkilöautoille (EU/EY-tyyppihyväksytyt) ensirekisteröintipäivän mukaan.
// Lähteet (vero.fi, "Autoveroprosentit ajoneuvoille"):
//   - Taulukko 1A (1365/2018), sarake "1.1.2019 ja sen jälkeen" = taulukko 1A (777/2020) = taulukko 1A (1172/2021)
//     (ainoa ero: 0 g/km -> 0 % taulukossa 1172/2021, mikä koskee vain täyssähkö- ja vetyautoja).
//   - Taulukko 1A (1365/2018), sarake "3.–31.12.2018".
//   - Taulukko 1 (1481/2015), NEDC-arvot, sarakkeet 2016, 2017, 2018 ja "1.1.2019 ja sen jälkeen".
// Taulukoiden arvot on tarkistettu Verohallinnon julkaisemista pdf-tiedostoista.

function puraLista(teksti) {
  // Muoto: "arvo*toistot,arvo,..." -> taulukko indekseille 0..360
  const tulos = [];
  for (const osa of teksti.split(",")) {
    const [arvo, kerrat] = osa.split("*");
    for (let i = 0; i < (kerrat ? Number(kerrat) : 1); i++) tulos.push(Number(arvo));
  }
  return tulos;
}

// WLTP, ensirekisteröinti 1.1.2019 tai myöhemmin (g/km 0..360)
const WLTP_2019 = puraLista(
  "2.7*5,2.8*6,2.9*6,3.0*5,3.1*4,3.2*5,3.3*3,3.4*4,3.5*3,3.6*4,3.7*3,3.8*2,3.9*3,4.0*3,4.1*2,4.2*2,4.3*3," +
  "4.4*2,4.5*2,4.6*2,4.7*2,4.8*2,4.9,5.0*2,5.1*2,5.2*2,5.3,5.4*2,5.5,5.6*2,5.7,5.8,5.9*2,6.0,6.1,6.2*2,6.3," +
  "6.4,6.5,6.6*2,6.7,6.8,6.9,7.0,7.1,7.2,7.3,7.4,7.5,7.6,7.7,7.8,8.0,8.1,8.3,8.4,8.6,8.8,8.9,9.1,9.3,9.5,9.7," +
  "9.9,10.0,10.2,10.4,10.6,10.9,11.1,11.3,11.5,11.7,12.0,12.2,12.4,12.7,12.9,13.2,13.4,13.7,13.9,14.2,14.5," +
  "14.8,15.0,15.3,15.6,15.9,16.2,16.5,16.8,17.1,17.4,17.7,18.0,18.3,18.6,19.0,19.3,19.6,20.0,20.3,20.6,21.0," +
  "21.3,21.7,22.0,22.4,22.7,23.1,23.4,24.0,24.2,24.4,24.6,24.8,25.0,25.2,25.4,25.6,25.8,26.0,26.2,26.4,26.6," +
  "26.8,27.0,27.2,27.4,27.6,27.8,28.0,28.2,28.4,28.6,28.8,29.0,29.1,29.3,29.5,29.7,29.9,30.1,30.3,30.5,30.7," +
  "30.9,31.1,31.3,31.5,31.7,31.8,32.0,32.2,32.4,32.6,32.8,33.0,33.1,33.3,33.5,33.7,33.9,34.1,34.2,34.4,34.6," +
  "34.8,34.9,35.1,35.3,35.5,35.6,35.8,36.0,36.2,36.3,36.5,36.7,36.8,37.0,37.1,37.3,37.5,37.6,37.8,37.9,38.1," +
  "38.3,38.4,38.6,38.7,38.9,39.0,39.2,39.3,39.5,39.6,39.8,39.9,40.0,40.2,40.3,40.5,40.6,40.7,40.9,41.0,41.1," +
  "41.3,41.4,41.5,41.7,41.8,41.9,42.0,42.2,42.3,42.4,42.5,42.6,42.8,42.9,43.0,43.1,43.2,43.3,43.4,43.6,43.7," +
  "43.8,43.9,44.0,44.1,44.2,44.3,44.4,44.5,44.6,44.7,44.8,44.9,45.0,45.1,45.2,45.3,45.4*2,45.5,45.6,45.7,45.8," +
  "45.9,46.0*2,46.1,46.2,46.3,46.4*2,46.5,46.6,46.7*2,46.8,46.9,47.0*2,47.1,47.2*2,47.3,47.4*2,47.5,47.6*2," +
  "47.7,47.8*2,47.9*2,48.0,48.1*2,48.2*2,48.3*2,48.4*2,48.5*2,48.6*2,48.7*2,48.8*2,48.9*2"
);

// WLTP, ensirekisteröinti 3.–31.12.2018: poikkeaa yllä olevasta vain välillä 0–170 g/km
const WLTP_2018_JOULU = puraLista(
  "3.3*4,3.4*4,3.5*4,3.6*4,3.7*3,3.8*4,3.9*3,4.0*3,4.1*4,4.2*2,4.3*2,4.4*4,4.5*2,4.6*2,4.7*3,4.8*2,4.9*2," +
  "5.0*2,5.1*2,5.2*2,5.3*2,5.4*2,5.5*2,5.6*2,5.7*2,5.8,5.9*2,6.0*2,6.1,6.2*2,6.3*2,6.4,6.5,6.6*2,6.7,6.8*2," +
  "6.9,7.0,7.1*2,7.2,7.3,7.4,7.5*2,7.6,7.7,7.8,7.9,8.0*2,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.2,9.3,9.5," +
  "9.6,9.8,9.9,10.1,10.3,10.4,10.6,10.8,11.0,11.2,11.3,11.5,11.7,11.9,12.1,12.3,12.5,12.7,13.0,13.1,13.4,13.6," +
  "13.8,14.0,14.3,14.5,14.8,15.0,15.2,15.5,15.7,16.0,16.2,16.5,16.8,17.0,17.3,17.6,17.9,18.1,18.4,18.7,19.0," +
  "19.3,19.6,19.8,20.1,20.4,20.7,21.0,21.3,21.6,21.9,22.3,22.6,22.9,23.2,23.5"
).concat(WLTP_2019.slice(171));

// NEDC, taulukko 1 (1481/2015): rivit 0..140 sarakkeittain [2016, 2017, 2018, 2019->]; 141.. kaikille sama
const NEDC_ALKU = (
  "4.4 3.8 3.3 2.7|4.5 3.9 3.3 2.7|4.6 4.0 3.3 2.7|4.6 4.0 3.4 2.7|4.7 4.0 3.4 2.8|4.7 4.1 3.4 2.8|" +
  "4.8 4.1 3.5 2.8|4.8 4.2 3.5 2.8|4.9 4.2 3.5 2.9|4.9 4.2 3.6 2.9|5.0 4.3 3.6 2.9|5.1 4.4 3.7 2.9|" +
  "5.2 4.4 3.7 3.0|5.2 4.4 3.7 3.0|5.3 4.5 3.8 3.0|5.3 4.6 3.8 3.0|5.4 4.6 3.9 3.1|5.5 4.7 3.9 3.1|" +
  "5.5 4.7 3.9 3.1|5.6 4.8 4.0 3.2|5.7 4.9 4.0 3.2|5.8 4.9 4.1 3.2|5.8 5.0 4.1 3.3|5.9 5.1 4.2 3.3|" +
  "5.9 5.1 4.2 3.3|6.0 5.1 4.3 3.4|6.1 5.2 4.3 3.4|6.2 5.3 4.4 3.5|6.3 5.3 4.4 3.5|6.4 5.4 4.5 3.5|" +
  "6.4 5.5 4.5 3.6|6.5 5.6 4.6 3.6|6.6 5.6 4.7 3.7|6.7 5.7 4.7 3.7|6.8 5.8 4.8 3.8|6.9 5.9 4.8 3.8|" +
  "7.0 5.9 4.9 3.9|7.1 6.0 5.0 3.9|7.1 6.1 5.0 4.0|7.2 6.2 5.1 4.0|7.3 6.2 5.2 4.1|7.4 6.3 5.2 4.1|" +
  "7.5 6.4 5.3 4.2|7.6 6.5 5.4 4.3|7.7 6.6 5.4 4.3|7.8 6.6 5.5 4.4|7.9 6.7 5.6 4.5|8.0 6.8 5.7 4.5|" +
  "8.0 6.9 5.7 4.6|8.1 7.0 5.8 4.7|8.2 7.1 5.9 4.7|8.4 7.2 6.0 4.8|8.5 7.3 6.1 4.9|8.6 7.4 6.2 5.0|" +
  "8.7 7.5 6.3 5.0|8.8 7.6 6.3 5.1|9.0 7.7 6.5 5.2|9.0 7.8 6.5 5.3|9.1 7.9 6.6 5.4|9.2 8.0 6.7 5.5|" +
  "9.3 8.1 6.8 5.6|9.5 8.2 7.0 5.7|9.6 8.3 7.0 5.8|9.7 8.4 7.1 5.9|9.9 8.6 7.3 6.0|10.0 8.7 7.4 6.1|" +
  "10.1 8.8 7.5 6.2|10.2 8.9 7.6 6.3|10.4 9.1 7.7 6.4|10.5 9.2 7.8 6.5|10.7 9.3 8.0 6.6|10.8 9.4 8.1 6.8|" +
  "10.9 9.5 8.2 6.9|11.1 9.7 8.4 7.0|11.2 9.8 8.5 7.1|11.3 9.9 8.6 7.3|11.5 10.1 8.8 7.4|11.6 10.2 8.9 7.6|" +
  "11.7 10.4 9.0 7.7|11.9 10.5 9.2 7.8|12.0 10.7 9.3 8.0|12.2 10.8 9.5 8.1|12.3 11.0 9.6 8.3|12.5 11.1 9.8 8.5|" +
  "12.7 11.3 10.0 8.6|12.8 11.4 10.1 8.8|13.0 11.6 10.3 8.9|13.1 11.8 10.4 9.1|13.3 11.9 10.6 9.3|" +
  "13.4 12.1 10.8 9.5|13.6 12.3 11.0 9.7|13.8 12.5 11.2 9.8|13.9 12.6 11.3 10.0|14.1 12.8 11.5 10.2|" +
  "14.2 13.0 11.7 10.4|14.4 13.2 11.9 10.6|14.6 13.4 12.1 10.8|14.8 13.5 12.3 11.0|15.0 13.7 12.5 11.3|" +
  "15.2 13.9 12.7 11.5|15.3 14.1 12.9 11.7|15.5 14.3 13.1 11.9|15.7 14.5 13.3 12.1|15.8 14.7 13.5 12.4|" +
  "16.1 14.9 13.8 12.6|16.3 15.1 14.0 12.9|16.5 15.4 14.2 13.1|16.6 15.5 14.4 13.3|16.8 15.8 14.7 13.6|" +
  "17.0 16.0 14.9 13.9|17.3 16.2 15.2 14.1|17.4 16.4 15.4 14.4|17.6 16.6 15.6 14.6|17.8 16.9 15.9 14.9|" +
  "18.0 17.1 16.1 15.2|18.2 17.3 16.4 15.5|18.4 17.5 16.6 15.8|18.6 17.8 16.9 16.0|18.9 18.0 17.2 16.3|" +
  "19.1 18.3 17.4 16.6|19.3 18.5 17.7 16.9|19.5 18.7 18.0 17.2|19.7 19.0 18.2 17.5|19.9 19.2 18.5 17.8|" +
  "20.1 19.5 18.8 18.1|20.4 19.7 19.1 18.5|20.6 20.0 19.4 18.8|20.8 20.2 19.7 19.1|21.0 20.5 19.9 19.4|" +
  "21.2 20.7 20.2 19.7|21.4 21.0 20.5 20.1|21.7 21.2 20.8 20.4|21.9 21.5 21.1 20.7|22.1 21.8 21.4 21.1|" +
  "22.4 22.0 21.7 21.4|22.6 22.3 22.0 21.7|22.8 22.6 22.3 22.1|23.1 22.9 22.6 22.4|23.3 23.1 22.9 22.8|" +
  "23.6 23.4 23.3 23.1|23.7 23.6 23.5 23.5"
).split("|").map((r) => r.split(" ").map(Number));
const NEDC_LOPPU = puraLista(
  "24.0,24.2,24.4,24.6,24.8,25.0,25.2,25.4,25.6,25.8,26.0,26.2,26.4,26.6,26.8,27.0,27.1,27.3,27.5,27.7,27.9," +
  "28.1,28.3,28.5,28.7,28.9,29.1,29.3,29.5,29.7,29.9,30.0,30.2,30.4,30.6,30.8,31.0,31.2,31.4,31.6,31.7,31.9," +
  "32.1,32.3,32.5,32.7,32.8,33.0,33.2,33.4,33.6,33.7,33.9,34.1,34.3,34.4,34.6,34.8,35.0,35.1,35.3,35.5,35.7," +
  "35.8,36.0,36.2,36.3,36.5,36.6,36.8,37.0,37.1,37.3,37.5,37.6,37.8,37.9,38.1,38.2,38.4,38.5,38.7,38.8,39.0," +
  "39.1,39.3,39.4,39.6,39.7,39.8,40.0,40.1,40.3,40.4,40.5,40.7,40.8,40.9,41.1,41.2,41.3,41.5,41.6,41.7,41.8," +
  "42.0,42.1,42.2,42.3,42.4,42.6,42.7,42.8,42.9,43.0,43.1,43.2,43.4,43.5,43.6,43.7,43.8,43.9,44.0,44.1,44.2," +
  "44.3,44.4,44.5,44.6,44.7,44.8,44.9,45.0,45.1,45.2*2,45.3,45.4,45.5,45.6,45.7,45.8*2,45.9,46.0,46.1,46.2," +
  "46.3*2,46.4,46.5,46.6*2,46.7,46.8,46.9*2,47.0,47.1*2,47.2,47.3*2,47.4,47.5*2,47.6*2,47.7,47.8*2,47.9*2," +
  "48.0,48.1*2,48.2*2,48.3*2,48.4*2,48.5*2,48.6*2,48.7*2,48.8*2,48.9*2,49.0*2,49.1*3,49.2*2,49.3*3,49.4*2," +
  "49.5*3,49.6*2,49.7*3,49.8*3,49.9*3,50.0"
);
function nedc(g, sarake) {
  return g <= 140 ? NEDC_ALKU[g][sarake] : NEDC_LOPPU[g - 141];
}

// Taulukko 1 (1316/2011), ensirekisteröinti 1.4.2012–31.12.2015 (ja vertailuun 2003–3/2012). Arvot 0–140 g/km
// lain esityksestä (HE 57/2011); 141 g/km alkaen arvot ovat samat kuin taulukossa 1481/2015.
const T2011_ALKU = puraLista(
  "5.0,5.1,5.2*2,5.3,5.4*2,5.5,5.6*2,5.7,5.8,5.9*2,6.0,6.1,6.2,6.3*2,6.4,6.5,6.6,6.7,6.8*2,6.9,7.0,7.1,7.2,7.3," +
  "7.4,7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.6,9.7,9.8,9.9,10.0,10.2," +
  "10.3,10.4,10.5,10.6,10.8,10.9,11.0,11.2,11.3,11.4,11.5,11.7,11.8,12.0,12.1,12.2,12.4,12.5,12.6,12.8,12.9,13.1," +
  "13.2,13.4,13.5,13.7,13.8,14.0,14.1,14.3,14.4,14.6,14.7,14.9,15.1,15.2,15.4,15.5,15.7,15.9,16.0,16.2,16.4,16.5," +
  "16.7,16.9,17.0,17.2,17.4,17.6,17.7,17.9,18.1,18.3,18.4,18.6,18.8,19.0,19.1,19.3,19.5,19.7,19.9,20.1,20.2,20.4," +
  "20.6,20.8,21.0,21.2,21.4,21.5,21.7,21.9,22.1,22.3,22.5,22.7,22.9,23.1,23.3,23.5,23.7,23.8"
);
function t2011(g) { return g <= 140 ? T2011_ALKU[g] : NEDC_LOPPU[g - 141]; }
// Taulukko 1 (5/2009): 12,2 % kun enintään 60 g/km, 48,8 % kun vähintään 360 g/km, väliltä 0,122 %-yks./g (pyöristys 0,1)
function t2009(g) { const k = Math.max(60, Math.min(360, g)) - 60; return Math.floor((12200 + 122 * k + 50) / 100) / 10; }
// Taulukko 1 (1292/2007): 10,0 % kun enintään 60 g/km, 40,0 % kun vähintään 360 g/km, väliltä 0,1 %-yks./g
function t2007(g) { const k = Math.max(60, Math.min(360, g)) - 60; return (100 + k) / 10; }

export const TAULUKOT = { WLTP_2019, WLTP_2018_JOULU, NEDC_ALKU, NEDC_LOPPU, T2011_ALKU, t2011, t2009, t2007 };

// ---------- käänteinen haku: veroprosentista päästöihin ----------

const NEDC_SARAKKEET = [0, 1, 2, 3].map((s) => Array.from({ length: 361 }, (_, g) => nedc(g, s)));

function kaanteinen(taulukko, prosentti) {
  // Päästöväli, jolla taulukko antaa tämän prosentin; palauttaa välin keskikohdan tai NaN
  let a = -1, b = -1;
  for (let g = 0; g <= 360; g++) {
    if (Math.abs(taulukko[g] - prosentti) < 0.051) { if (a < 0) a = g; b = g; }
  }
  if (a < 0) return NaN;
  return b === 360 ? a : (a + b) / 2;
}

/**
 * Arvioi päätöksen päästöt (WLTP-arvoa vastaavina grammoina) veroprosentista ja ensirekisteröintipäivästä.
 * NEDC-aikakauden autoille muunnos tehdään taulukoiden kautta: sama prosentti "1.1.2019 ja sen jälkeen"
 * -sarakkeissa vastaa suunnilleen samaa autoa. Palauttaa NaN, jos päättely ei onnistu.
 */
export function paastoVeroprosentista(prosentti, ensirek) {
  if (!Number.isFinite(prosentti) || prosentti <= 0) return NaN;
  if (ensirek >= 20181203) return kaanteinen(ensirek < 20190101 ? WLTP_2018_JOULU : WLTP_2019, prosentti);
  if (ensirek >= 20160101) {
    const sarake = ensirek < 20170101 ? 0 : ensirek < 20180101 ? 1 : 2;
    const gNedc = kaanteinen(NEDC_SARAKKEET[sarake], prosentti);
    if (Number.isNaN(gNedc)) return NaN;
    return kaanteinen(WLTP_2019, nedc(Math.round(gNedc), 3));
  }
  return NaN;
}

/** Käyttäjän antamista päästöistä WLTP-arvoa vastaava luku (WLTP sellaisenaan, NEDC muunnettuna). */
export function wltpVastine(wltp, nedcArvo) {
  if (wltp != null && wltp !== "" && Number(wltp) > 0) return Number(wltp);
  if (nedcArvo != null && nedcArvo !== "" && Number(nedcArvo) > 0) {
    return kaanteinen(WLTP_2019, nedc(rajaa(Number(nedcArvo)), 3));
  }
  return NaN;
}

const LINKKI = "https://vero.fi/henkiloasiakkaat/omaisuus/autovero/autoveron-maara/autoveroprosentit-ajoneuvoille/";

function rajaa(g) {
  return Math.max(0, Math.min(360, Math.round(g)));
}

/**
 * Laskee autoveroprosentin.
 * @param {object} p
 *   ensirek: "VVVV-KK-PP" (ensimmäinen rekisteröinti Suomessa tai ulkomailla)
 *   ryhma: "EV" (täyssähkö tai vety), "HYB" tai "ICE"
 *   wltp, nedc: CO2-päästöt g/km (jompikumpi tai molemmat, tyhjä = null)
 * @returns {{prosentti:number|null, peruste:string, varma:boolean, huomio?:string, linkki:string}}
 */
export function veroprosentti({ ensirek, ryhma, wltp = null, nedc: nedcArvo = null, mallipros = null, diesel = false }) {
  const tulos = (prosentti, peruste, varma = true, huomio) => ({ prosentti, peruste, varma, huomio, linkki: LINKKI });
  if (!ensirek) return tulos(null, "Ensirekisteröintipäivä puuttuu", false);
  const d = ensirek; // vertailu merkkijonoina toimii muodossa VVVV-KK-PP
  const onW = wltp !== null && wltp !== "" && !Number.isNaN(Number(wltp));
  const onN = nedcArvo !== null && nedcArvo !== "" && !Number.isNaN(Number(nedcArvo));
  const w = onW ? rajaa(Number(wltp)) : null;
  const n = onN ? rajaa(Number(nedcArvo)) : null;

  if (ryhma === "EV") {
    if (d >= "2021-10-01") return tulos(0, "Täyssähkö- tai vetyauto, käyttöön otettu 1.10.2021 tai myöhemmin");
    if (d >= "2019-01-01") return tulos(2.7, "Täyssähköauto, ensirekisteröinti 1.1.2019–30.9.2021");
    if (d >= "2018-09-01") return tulos(3.3, "Täyssähköauto, ensirekisteröinti 1.9.–31.12.2018");
    if (d >= "2018-01-01") return tulos(3.3, "Täyssähköauto, ensirekisteröinti 2018");
    if (d >= "2017-01-01") return tulos(3.8, "Täyssähköauto, ensirekisteröinti 2017");
    if (d >= "2016-01-01") return tulos(4.4, "Täyssähköauto, ensirekisteröinti 2016");
    if (d >= "2012-04-01") return tulos(5.0, "Täyssähköauto, ensirekisteröinti 1.4.2012–31.12.2015");
    return tulos(5.0, "Täyssähköauto, käyttöönotto ennen 1.4.2012: taulukoiden pienin veron osuus");
  }

  if (d >= "2021-01-01") {
    if (onW) return tulos(WLTP_2019[w], `WLTP ${w} g/km, taulukko 1A (ensirekisteröinti 2021 tai myöhemmin)`);
    if (onN) return tulos(null, "Vuonna 2021 tai myöhemmin rekisteröidyn auton vero lasketaan WLTP-arvosta. Syötä WLTP-arvo.", false);
    return tulos(null, "Syötä CO2-päästö (WLTP)", false);
  }
  if (d >= "2018-12-03") {
    const ehdokkaat = [];
    if (onW) ehdokkaat.push([d < "2019-01-01" ? WLTP_2018_JOULU[w] : WLTP_2019[w], `WLTP ${w} g/km, taulukko 1A (1365/2018)`]);
    if (onN) ehdokkaat.push([nedc(n, d < "2019-01-01" ? 2 : 3), `NEDC ${n} g/km, taulukko 1 (1481/2015)`]);
    if (!ehdokkaat.length) return tulos(null, "Syötä CO2-päästö (WLTP ja/tai NEDC)", false);
    ehdokkaat.sort((a, b) => a[0] - b[0]);
    const huomio = ehdokkaat.length === 1 && onW
      ? "Jos autolla on myös NEDC-arvo, syötä se: veroprosentti määräytyy pienemmän mukaan." : undefined;
    return tulos(ehdokkaat[0][0], ehdokkaat[0][1] + (ehdokkaat.length > 1 ? " (pienempi kahdesta)" : ""), true, huomio);
  }
  if (d >= "2018-09-01") {
    if (onN) return tulos(nedc(n, 2), `NEDC ${n} g/km, taulukko 1 (1481/2015), sarake 2018`, true,
      onW ? "WLTP-arvon taulukkoa 1A (570/2018) ei ole laskurissa. Tarkista, antaako se pienemmän prosentin." : undefined);
    return tulos(null, "Ensirekisteröinti 1.9.–2.12.2018: syötä NEDC-arvo tai tarkista prosentti taulukosta 1A (570/2018)", false);
  }
  if (d >= "2016-01-01") {
    const sarake = d < "2017-01-01" ? 0 : d < "2018-01-01" ? 1 : 2;
    const vuosi = 2016 + sarake;
    const ehdokkaat = [];
    if (onN) ehdokkaat.push([nedc(n, sarake), `NEDC ${n} g/km`]);
    if (onW) ehdokkaat.push([nedc(w, sarake), `WLTP ${w} g/km`]);
    if (!ehdokkaat.length) return tulos(null, "Syötä CO2-päästö (NEDC)", false);
    ehdokkaat.sort((a, b) => a[0] - b[0]);
    return tulos(ehdokkaat[0][0], `${ehdokkaat[0][1]}, taulukko 1 (1481/2015), sarake ${vuosi}`);
  }
  // Ennen 2016: NEDC-arvo (jos vain WLTP-arvo on annettu, käytetään sitä)
  const g = onN ? n : onW ? w : null;
  const lahde = onN ? `NEDC ${n} g/km` : `CO2 ${w} g/km`;
  if (d >= "2012-04-01") {
    if (g === null) return tulos(null, "Syötä CO2-päästö (NEDC)", false);
    return tulos(t2011(g), `${lahde}, taulukko 1 (1316/2011)`);
  }
  const vaihtoehdot = (lista) => {
    lista.sort((a, b) => a[0] - b[0]);
    return lista[0];
  };
  if (d >= "2008-01-01") {
    if (g === null) return tulos(null, "Syötä CO2-päästö (NEDC)", false);
    const lista = [[t2011(g), "1316/2011"], [t2009(g), "5/2009"]];
    if (d < "2009-04-01") lista.push([t2007(g), "1292/2007"]);
    const [p, t] = vaihtoehdot(lista);
    return tulos(p, `${lahde}, pienin taulukoista (${lista.map((x) => x[1]).join(", ")}): taulukko 1 (${t})`);
  }
  if (d < "1958-01-01") return tulos(0, "Ennen vuotta 1958 käyttöön otettu auto: autoveroa ei peritä");
  // 2003–2007 ja ennen 2003: pienin mallikohtaisesta vertailuprosentista ja päästöperusteisista taulukoista
  const lista = [];
  if (g !== null) lista.push([Math.min(t2007(g), t2009(g), t2011(g)), `${lahde}, pienin taulukoista 1292/2007, 5/2009 ja 1316/2011`]);
  const onMalli = mallipros !== null && mallipros !== "" && !Number.isNaN(Number(mallipros));
  if (onMalli) lista.push([Number(mallipros), "mallikohtainen vertailuprosentti"]);
  else if (d < "2003-01-01") lista.push([diesel ? 30 : 29, `vertailuprosentti ${diesel ? 30 : 29} %, kun mallikohtaista ei ole`]);
  if (!lista.length) return tulos(null, "Syötä CO2-päästö tai mallikohtainen vertailuprosentti", false);
  const [p, t] = vaihtoehdot(lista);
  const huomio = onMalli ? undefined
    : "Vero.fi:n luettelossa voi olla tälle mallille mallikohtainen vertailuprosentti. Jos se on pienempi, se ratkaisee: syötä se kenttään.";
  return tulos(p, t + (onMalli ? " (pienin)" : ""), onMalli, huomio);
}
