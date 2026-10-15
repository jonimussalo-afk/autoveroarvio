import {
  yhdistaAineisto, arvioiKauppiaat, harvinaisuus, malliTasot, polttoaineryhma,
  pvmMerkkijonosta, pvmLuvusta, uushintaKerroin, TASO_NIMET, TUKI_SELITE,
} from "./malli.js";
import { veroprosentti, wltpVastine } from "./verotaulukot.js";
import { euro, pros, kk, pvm, esc, paatosta, muutos, yhtenaistaMerkki } from "./apu.js";
import { merkkiAineisto, luePalautteet } from "./palaute.js";

const $ = (id) => document.getElementById(id);
let aineisto = null; // valitun merkin päätökset
let malli = null;
const merkkiTiedostot = new Map(); // merkki -> tiedostonimi
const merkkiValimuisti = new Map(); // merkki -> aineisto (Verohallinnon päätökset + kauppiaiden arviot)
let ladattuMerkki = null;
const kosketut = new Set();


// Ennakkoratkaisu (Verohallinnon hinnasto ja käsittelyajat, tarkistettu 10/2026)
const ENNAKKO = {
  rajaEuroa: 2000, // varoitus, kun autoveron 80 %:n väli on vähintään näin leveä
  maksu: 480,
  kasittely: "noin 8–11 viikkoa",
  linkki: "https://vero.fi/yritykset-ja-yhteisot/yhteistyo-ja-palvelut/ennakkoratkaisu-tai-poikkeuslupa/",
};

const TYHJA = yhdistaAineisto([]);

// ---------- lataus ----------
async function lataa() {
  try {
    malli = await fetch("data/malli.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    if (!malli.kertoimet || !malli.yhteenveto) throw new Error("malli.json on vanhaa muotoa");
    for (const [nimi, , tiedosto] of malli.yhteenveto.merkit) merkkiTiedostot.set(nimi, tiedosto);
    const viimeisin = pvm(pvmLuvusta(malli.aineisto.viimeisinPaatos));
    const paivitetty = malli.aineisto.paivitetty ? pvm(Date.parse(malli.aineisto.paivitetty)) : "–";
    $("tila").textContent = `Aineisto: ${malli.aineisto.rivit.toLocaleString("fi-FI")} päätöstä · viimeisin päätös ${viimeisin} · päivitetty ${paivitetty}`;
    aineisto = TYHJA;
    alustaValinnat();
    naytaTarkkuus();
    await taytaOsoitteesta();
    laske();
  } catch (e) {
    $("tila").textContent = "Aineiston lataus epäonnistui";
    $("tulokset").innerHTML = `<div class="virhe">Aineistoa ei voitu ladata (${esc(e.message)}). Jos avasit tiedoston suoraan
      koneeltasi, avaa sivu GitHub Pagesin kautta tai käynnistä paikallinen palvelin (ohje tiedostossa README.md).</div>`;
  }
}

async function lataaMerkki(merkki) {
  if (merkki === ladattuMerkki) return;
  ladattuMerkki = merkki;
  const omat = luePalautteet();
  const omiaMerkille = omat.some((p) => yhtenaistaMerkki(p.auto.merkki) === merkki);
  if (!merkkiTiedostot.has(merkki) && !omiaMerkille) { aineisto = TYHJA; return; }
  if (!merkkiValimuisti.has(merkki)) {
    const json = merkkiTiedostot.has(merkki)
      ? await fetch("data/merkit/" + merkkiTiedostot.get(merkki)).then((r) => r.json()) : null;
    // Mukaan tämän selaimen koulutustilassa annetut kauppiaan arviot
    merkkiValimuisti.set(merkki, merkkiAineisto(json, merkki, omat));
  }
  if (ladattuMerkki === merkki) aineisto = merkkiValimuisti.get(merkki);
}

function vaihtoehdot(lista, tyhja) {
  return (tyhja ? `<option value="">${tyhja}</option>` : "") +
    lista.filter(([v]) => v).map(([v]) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

function alustaValinnat() {
  const Y = malli.yhteenveto;
  $("merkit").innerHTML = Y.merkit.map(([m, n]) => `<option value="${esc(m)}" label="${n} päätöstä">`).join("");
  $("kayttovoima").innerHTML = vaihtoehdot(Y.kayttovoima);
  $("kayttovoima").value = "Bensiini";
  $("korimalli").innerHTML = vaihtoehdot(Y.korimalli, "Ei tiedossa");
  $("vetotapa").innerHTML = vaihtoehdot(Y.vetotapa, "Ei tiedossa");
  if (!$("verotus").value) $("verotus").value = new Date().toISOString().slice(0, 10);

  let ajastin;
  const paivita = () => { clearTimeout(ajastin); ajastin = setTimeout(laske, 120); };
  for (const id of KENTAT) {
    $(id).addEventListener("input", () => { kosketut.add(id); paivita(); });
    $(id).addEventListener("change", paivita);
  }
  const merkkiMuuttui = async () => { await lataaMerkki(yhtenaistaMerkki($("merkki").value)); paivitaMallit(); laske(); };
  $("merkki").addEventListener("change", merkkiMuuttui);
  $("merkki").addEventListener("input", merkkiMuuttui);
  $("malli").addEventListener("change", paivitaTehot);
  $("malli").addEventListener("input", paivitaTehot);
  $("kw").addEventListener("change", paivitaTehot);
}

function paivitaMallit() {
  const merkki = yhtenaistaMerkki($("merkki").value);
  const mi = aineisto.hakemisto.merkki.get(merkki);
  if (mi === undefined || !aineisto.merkinMallit.has(mi)) { $("mallit").innerHTML = ""; $("tehot").innerHTML = ""; return; }
  const laskuri = new Map();
  for (const m of aineisto.merkinMallit.get(mi)) laskuri.set(m, aineisto.malliLkm.get(m));
  $("mallit").innerHTML = [...laskuri.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400)
    .map(([m, n]) => `<option value="${esc(aineisto.malliTiedot[m].nimi)}" label="${n} päätöstä">`).join("");
  paivitaTehot();
}

function paivitaTehot() {
  const merkki = yhtenaistaMerkki($("merkki").value);
  const malliNimi = $("malli").value;
  const mi = aineisto.hakemisto.merkki.get(merkki);
  if (mi === undefined || !malliNimi.trim()) { $("tehot").innerHTML = ""; return; }
  const kartta = malliTasot(aineisto, merkki, malliNimi);
  const { A, sanasto } = aineisto;
  const tehot = new Map();
  const arvot = { kayttovoima: new Map(), korimalli: new Map(), vetotapa: new Map(), vaihteisto: new Map(), cm3: new Map(), ovet: new Map() };
  const lisaa = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  // Esitäyttö vain saman tehoisista päätöksistä (sama versio)
  const kw = lukuKentasta("kw");
  const lkw = kw ? Math.log(kw) : null;
  for (const g of [0, 1, 2]) {
    for (const r of aineisto.merkkiRyhma.get(mi * 3 + g) || []) {
      if (kartta.get(A.malli[r]) !== "malli") continue;
      lisaa(tehot, `${A.kw[r]}|${sanasto.kayttovoima[A.kayttovoima[r]]}`);
      if (lkw === null || Math.abs(A.lkw[r] - lkw) > 0.012) continue;
      lisaa(arvot.kayttovoima, sanasto.kayttovoima[A.kayttovoima[r]]);
      lisaa(arvot.korimalli, sanasto.korimalli[A.korimalli[r]]);
      lisaa(arvot.vetotapa, sanasto.vetotapa[A.vetotapa[r]]);
      lisaa(arvot.vaihteisto, sanasto.vaihteisto[A.vaihteisto[r]] === "AUT" ? "AUT" : "MAN");
      if (A.cm3[r] > 0) lisaa(arvot.cm3, String(A.cm3[r]));
      if (A.ovet[r] > 0) lisaa(arvot.ovet, String(A.ovet[r]));
    }
  }
  const suurin = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const [kentta, m] of Object.entries(arvot)) {
    // Korin tiedot vaihtelevat saman mallin sisällä (esim. coupe/avoauto), joten niitä ei täytetä yhden päätöksen perusteella
    const vahintaan = ["korimalli", "vetotapa", "ovet"].includes(kentta) ? 2 : 1;
    if (m.size && !kosketut.has(kentta) && m.get(suurin(m)) >= vahintaan) $(kentta).value = suurin(m);
  }
  const lista = [...tehot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $("tehot").innerHTML = lista.length
    ? `<span class="pieni">Aineistossa:</span>` + lista.map(([k, n]) => {
      const [kwArvo, kv] = k.split("|");
      return `<button type="button" data-kw="${esc(kwArvo)}" data-kv="${esc(kv)}">${esc(kwArvo)} kW · ${esc(kv.toLowerCase())} (${n})</button>`;
    }).join("")
    : `<span class="pieni">Tällä nimellä ei ole päätöksiä. Laskuri käyttää mallisarjan ja merkin muita autoja.</span>`;
  $("tehot").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("kw").value = b.dataset.kw;
    $("kayttovoima").value = b.dataset.kv;
    kosketut.add("kayttovoima");
    for (const k of ["korimalli", "vetotapa", "vaihteisto", "cm3", "ovet"]) kosketut.delete(k);
    paivitaTehot();
    laske();
  }));
}

// ---------- jaettava osoite: lomakkeen tiedot osoitteen perään ----------
const KENTAT = ["merkki", "malli", "kw", "kayttovoima", "korimalli", "vetotapa", "vaihteisto", "cm3", "ovet", "ensirek", "km",
  "wltp", "nedc", "mallipros", "omapros", "verotus", "uushinta"];

async function taytaOsoitteesta() {
  const p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const lahde = window.__esitaytto || Object.fromEntries(p.entries());
  let jotain = false;
  for (const k of KENTAT) {
    if (lahde[k] != null && lahde[k] !== "") { $(k).value = lahde[k]; kosketut.add(k); jotain = true; }
  }
  if (jotain) { await lataaMerkki(yhtenaistaMerkki($("merkki").value)); paivitaMallit(); }
}

function paivitaOsoite() {
  const p = new URLSearchParams();
  for (const k of KENTAT) if ($(k).value) p.set(k, $(k).value);
  try { history.replaceState(null, "", "#" + p.toString()); } catch { /* esim. paikallinen tiedosto */ }
}

// ---------- laskenta ----------
function lukuKentasta(id) {
  const v = $(id).value.trim().replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function laske() {
  if (!malli || !aineisto) return;
  paivitaOsoite();
  const merkki = yhtenaistaMerkki($("merkki").value);
  if (merkki !== ladattuMerkki) return; // merkin tiedot latautuvat vielä
  const malliNimi = $("malli").value.trim();
  const kw = lukuKentasta("kw");
  const km = lukuKentasta("km");
  const ensirekStr = $("ensirek").value;
  const puuttuu = [];
  if (!merkki) puuttuu.push("merkki");
  if (!malliNimi) puuttuu.push("malli");
  if (!kw || kw < 10) puuttuu.push("teho");
  if (!ensirekStr) puuttuu.push("ensirekisteröintipäivä");
  if (km === null) puuttuu.push("ajokilometrit");
  if (puuttuu.length) {
    $("tulokset").innerHTML = `<div class="kortti tyhja">Täytä vielä: ${puuttuu.join(", ")}.</div>`;
    return;
  }
  const kayttovoima = $("kayttovoima").value;
  const ryhma = polttoaineryhma(kayttovoima);
  $("malliprosRivi").hidden = !(ensirekStr && ensirekStr < "2008-01-01");
  const verotusStr = $("verotus").value || new Date().toISOString().slice(0, 10);
  const vaihteisto = $("vaihteisto").value;
  const kohde = {
    merkki, malli: malliNimi, kw, ryhma, km: km / 1000,
    ensirek: pvmMerkkijonosta(ensirekStr), verotus: pvmMerkkijonosta(verotusStr),
    korimalli: $("korimalli").value || null, vetotapa: $("vetotapa").value || null,
    vaihteisto: vaihteisto === "AUT" ? "AUT" : vaihteisto === "MAN" ? "" : null,
    cm3: lukuKentasta("cm3") || 0, ovet: lukuKentasta("ovet") || 0,
    paasto: ryhma === "EV" ? NaN : wltpVastine(lukuKentasta("wltp"), lukuKentasta("nedc")),
  };
  if (kohde.verotus < kohde.ensirek) {
    $("tulokset").innerHTML = `<div class="virhe">Verotuspäivä on ennen ensirekisteröintiä.</div>`;
    return;
  }
  kohde.tasoKartta = malliTasot(aineisto, merkki, malliNimi);
  const tulos = arvioiKauppiaat(aineisto, malli, kohde, { verrokkeja: 15 });
  if (tulos.virhe) { $("tulokset").innerHTML = `<div class="virhe">${esc(tulos.virhe)}</div>`; return; }
  const hv = harvinaisuus(aineisto, kohde);

  // Veroprosentti
  const oma = lukuKentasta("omapros");
  const vp = veroprosentti({ ensirek: ensirekStr, ryhma, wltp: lukuKentasta("wltp"), nedc: lukuKentasta("nedc"),
    mallipros: lukuKentasta("mallipros"), diesel: /diesel/i.test(kayttovoima) });
  let prosentti = vp.prosentti, prosPeruste = vp.peruste, alustava = false;
  if (oma !== null) { prosentti = oma; prosPeruste = "Itse syötetty veroprosentti"; }
  else if (prosentti === null && tulos.verrokkienVeroprosentit) {
    prosentti = tulos.verrokkienVeroprosentit.mediaani;
    alustava = true;
  }
  piirra({ kohde, tulos, hv, prosentti, prosPeruste, alustava, vp, oma });
}

// ---------- tulosten piirto ----------
function piirra({ kohde, tulos, hv, prosentti, prosPeruste, alustava, vp, oma }) {
  const kal = malli.kalibrointi?.tuki?.[tulos.tuki];
  const vero = (x) => (prosentti == null ? null : (x * prosentti) / 100);

  const lahella = Math.max(hv.malli, hv.sarja);
  const hvTeksti = {
    yleinen: `Aineistossa on ${paatosta(lahella)} samasta mallista tai mallisarjasta lähes samalla teholla. Arvio on tarkka,
      mutta yleisille yli 2 vuotta vanhoille autoille myös Verohallinnon oma hintatietopalvelu antaa hyvän arvion.`,
    harvinainen: `Samasta mallista tai mallisarjasta on lähes samalla teholla ${paatosta(lahella)}. Arvio yhdistää ne
      merkin muiden autojen tietoihin sen mukaan, kuinka lähellä ne ovat.`,
    erittain: (lahella === 0 ? "Aineistossa ei ole päätöksiä samasta mallista lähes samalla teholla. "
      : `Lähes samanlaisia päätöksiä on vain ${lahella}. `) +
      `Tällaisissa autoissa laskurista on eniten hyötyä, mutta epävarmuus on suurempi: katso vaihteluväli ja verrokit tarkasti.`,
  }[hv.luokka] + (hv.kauppias ? ` Lisäksi kauppiailta on ${hv.kauppias} ${hv.kauppias === 1 ? "arvio" : "arviota"} lähes samanlaisista autoista.` : "");

  const osuusJarjestys = ["malli", "sarja", "merkki", "kaikki"];
  const varit = { malli: "var(--malli)", sarja: "var(--sarja)", merkki: "var(--merkki)", kaikki: "var(--kaikki)" };
  const palkki = osuusJarjestys.map((t) => `<div style="width:${(tulos.osuudet[t] || 0) * 100}%;background:${varit[t]}"
      title="${TASO_NIMET[t]} ${Math.round((tulos.osuudet[t] || 0) * 100)} %"></div>`).join("");
  const selitteet = osuusJarjestys.map((t) => {
    const lkm = t === "kaikki" ? "" : ` (${paatosta(tulos.tasot[t]?.lkm ?? 0)})`;
    return `<span style="--v:${varit[t]}">${TASO_NIMET[t]} ${Math.round((tulos.osuudet[t] || 0) * 100)} %${lkm}</span>`;
  }).join("");

  const tarkkuusTeksti = kal && kal.n >= 20
    ? `Kun laskuri ennusti aiempia päätöksiä, joissa tukea oli yhtä paljon, mediaanivirhe oli ${pros(kal.mediaaniVirhePros)}
       ja 80 % päätöksistä osui välille ${muutos(kal.kvantiilit.p10)} … ${muutos(kal.kvantiilit.p90)}. Vaihteluväli perustuu tähän.`
    : "Tälle tukitasolle ei ole vielä riittävästi testituloksia, joten vaihteluväli on arvioitu.";

  let prosHuomio = "";
  if (alustava) {
    const v = tulos.verrokkienVeroprosentit;
    prosHuomio = `<div class="huomio">Veroprosenttia ei voitu laskea (${esc(vp.peruste)}). Vero on laskettu alustavasti
      lähimpien verrokkien veroprosentin mediaanilla ${pros(v.mediaani)} (vaihtelu ${pros(v.min)}–${pros(v.max)}).
      <a href="${vp.linkki}" target="_blank" rel="noopener">Tarkista oikea prosentti</a> ja syötä se kenttään.</div>`;
  } else if (prosentti == null) {
    prosHuomio = `<div class="huomio">${esc(vp.peruste)}. <a href="${vp.linkki}" target="_blank" rel="noopener">Veroprosentit vero.fi:ssä</a></div>`;
  } else if (vp.huomio && oma === null) {
    prosHuomio = `<div class="huomio">${esc(vp.huomio)}</div>`;
  }
  const v = tulos.verrokkienVeroprosentit;
  const vpVertailu = v && !alustava
    ? `<div class="pieni" style="margin-top:6px">${v.n === 1 || v.min === v.max
      ? `Lähimpien verrokkien veroprosentti päätöksissä: ${pros(v.mediaani)}.`
      : `Lähimpien verrokkien veroprosentit päätöksissä: ${pros(v.min)}–${pros(v.max)} (mediaani ${pros(v.mediaani)}).`}
       Suuri ero laskettuun prosenttiin voi kertoa erilaisesta moottorista tai rekisteröintiajankohdasta.</div>` : "";

  // Kohta 5: suuri epävarmuus -> ehdotetaan sitovaa ennakkoratkaisua
  const veroArvio = vero(tulos.arvio), veroAla = vero(tulos.ala80), veroYla = vero(tulos.yla80);
  const veroLeveys = veroArvio == null ? null : veroYla - veroAla;
  const syyt = [];
  if (tulos.tehoUlkona && tulos.tehoAlue) {
    syyt.push(`Teho ${Math.round(kohde.kw)} kW on ${tulos.tehoUlkona > 0 ? "suurempi" : "pienempi"} kuin yhdessäkään aineiston
      saman mallin päätöksessä (${tulos.tehoAlue[0]}–${tulos.tehoAlue[1]} kW). Kyse voi olla erikoisversiosta, jonka hintaa
      teho ei yksin selitä.`);
  }
  if (hv.luokka === "erittain") syyt.push("Lähes samanlaisia päätöksiä on aineistossa vain vähän tai ei lainkaan.");
  if (tulos.tuki === "D" || tulos.tuki === "E") syyt.push("Saman mallin tai mallisarjan päätöksiä ei juuri ole, joten arvio nojaa merkin muihin malleihin.");
  let ennakkoOsio = "";
  // Yleisille malleille ehdotus jätetään pois: niille Verohallinnon hintatietopalvelu on helpompi tarkistus.
  const harvinainenTaiErikois = hv.luokka !== "yleinen" || tulos.tehoUlkona !== 0;
  if (veroLeveys != null && veroLeveys >= ENNAKKO.rajaEuroa && harvinainenTaiErikois) {
    ennakkoOsio = `<div class="ennakko">
      <strong>Epävarma arvio: harkitse ennakkoratkaisua</strong>
      <p>Autoveron 80 %:n väli on ${euro(veroLeveys)} leveä. Välin yläreunassa vero olisi ${euro(veroYla - veroArvio)} arviota suurempi.</p>
      ${syyt.length ? `<ul>${syyt.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}
      <p>Jos kaupan kannattavuus riippuu veron määrästä, Verohallinnolta voi hakea autoverosta sitovan ennakkoratkaisun ennen
      ostoa. Maksu on ${euro(ENNAKKO.maksu)} ajoneuvolta ja käsittely kestää ${ENNAKKO.kasittely} (tilanne 10/2026).
      <a href="${ENNAKKO.linkki}" target="_blank" rel="noopener">Näin haet ennakkoratkaisua (vero.fi)</a></p>
    </div>`;
  }
  // Tehoalue ja sukupolvet perusteluihin
  const lisaPerustelut = [];
  if (tulos.tehoUlkona && tulos.tehoAlue) {
    lisaPerustelut.push(`Teho on saman mallin aiempien päätösten tehoalueen (${tulos.tehoAlue[0]}–${tulos.tehoAlue[1]} kW)
      ${tulos.tehoUlkona > 0 ? "yläpuolella" : "alapuolella"}. Arviossa on korjattu tällaisten autojen aiempi keskimääräinen
      virhe, ja vaihteluväli on tavallista leveämpi.`);
  }
  if (tulos.sukupolviRajat && tulos.sukupolviRajat.length) {
    const r = tulos.sukupolviRajat.map(kk);
    const rajat = r.length > 1 ? `${r.slice(0, -1).join(", ")} ja ${r[r.length - 1]}` : r[0];
    lisaPerustelut.push(r.length > 1
      ? `Mallin hintatasossa on portaita ensirekisteröinnin mukaan (noin ${rajat}), esimerkiksi sukupolven tai
        mallipäivityksen vaihdoksia. Verrokit, jotka on rekisteröity eri puolella porrasta kuin tämä auto, painavat vähemmän.`
      : `Mallin hintatasossa on porras ensirekisteröinnin mukaan (noin ${rajat}), esimerkiksi sukupolven tai
        mallipäivityksen vaihdos. Verrokit, jotka on rekisteröity eri puolella porrasta kuin tämä auto, painavat vähemmän.`);
  }
  const kp = tulos.kauppias;
  if (kp && kp.lkm > 0) {
    lisaPerustelut.push(kp.korjaus
      ? `Kauppiaiden arviot ${kp.lkm} lähes samanlaisesta autosta (koulutustila) korjasivat laskurin omaa arviota
        ${muutos(kp.korjaus)}; laskurin oma arvio oli ${euro(tulos.laskurinOmaArvio)}. Korjaus on varovainen, koska yksittäinen
        arvio voi osua ohi.`
      : `Lähes samanlaisista autoista on ${kp.lkm} kauppiaan arviota, mutta tästä mallista on runsaasti Verohallinnon
        päätöksiä, joten ne eivät muuta arviota.`);
  }
  const lisaPerusteluHtml = lisaPerustelut.map((t) => `<p class="pieni" style="margin:6px 0 0">${t}</p>`).join("");

  // Uushintamenetelmä
  const uushinta = lukuKentasta("uushinta");
  let uusiOsio = "";
  if (uushinta) {
    const kerroin = uushintaKerroin(kohde.ensirek, kohde.verotus);
    const arvo = uushinta * kerroin;
    const ero = Math.log(arvo / tulos.arvio);
    uusiOsio = `<div class="kortti"><h2>Laskennallinen arvo uuden auton hinnasta</h2>
      <p style="margin:0">${euro(uushinta)} × ${kerroin.toLocaleString("fi-FI", { maximumFractionDigits: 3 })} = <strong>${euro(arvo)}</strong>
      (autovero ${euro(vero(arvo))}). Ero päätöksiin perustuvaan arvioon: ${muutos(ero)}.</p>
      <p class="pieni">Arvoa alennetaan 3 % käyttöönottokuukaudelta, 2 % kahdelta seuraavalta täydeltä kuukaudelta ja sen jälkeen
      1 % kuukaudessa. Verohallinto käyttää tätä varatapaa, kun markkinahintoja ei ole riittävästi. Aineistossa erityisesti
      vanhojen harvinaisten autojen arvot noudattavat usein sitä. Jos saman mallin päätöksiä on, ne kertovat yleensä paremmin,
      kumpaa tapaa Verohallinto on käyttänyt.</p></div>`;
  }

  const rivit = tulos.verrokit.map((v) => {
    const maxPaino = tulos.verrokit[0]?.paino || 1;
    return `<tr>
      <td>${v.lahde === 1
        ? `<span class="merkki-taso t-kauppias" title="Kauppiaan arvio autoverosta muutettuna verotusarvoksi (${esc(TASO_NIMET[v.taso]).toLowerCase()})">Kauppiaan arvio</span>`
        : `<span class="merkki-taso t-${v.taso}">${TASO_NIMET[v.taso]}</span>`}</td>
      <td>${esc(v.merkki)} ${esc(v.malli)}${v.eriSukupolvi ? `<span class="sp-merkki" title="Rekisteröity mallin hintatason portaan toisella puolella">eri sukupolvi</span>` : ""}</td>
      <td class="oikea">${Math.round(v.kw)}</td>
      <td>${esc(v.kayttovoima)}</td>
      <td class="oikea">${kk(v.ensirek)}</td>
      <td class="oikea">${pvm(v.paatos)}</td>
      <td class="oikea">${Math.round(v.km).toLocaleString("fi-FI")} tkm</td>
      <td class="oikea">${euro(v.arvo)}</td>
      <td class="oikea">${Number.isFinite(v.veropros) ? pros(v.veropros) : "–"}</td>
      <td class="oikea"><strong>${euro(v.siirretty)}</strong></td>
      <td style="width:70px"><div class="painopalkki" style="width:${Math.max(3, (v.paino / maxPaino) * 60)}px"></div></td>
    </tr>`;
  }).join("");

  $("tulokset").innerHTML = `
    <div class="harvinaisuus h-${hv.luokka}">
      <strong>${hv.selite}</strong>
      <p>${hvTeksti}</p>
    </div>
    <div class="luvut">
      <div class="luku paa">
        <div class="otsake">Arvioitu autovero${alustava ? " (alustava)" : ""}</div>
        <div class="arvo">${euro(vero(tulos.arvio))}</div>
        <div class="vali">80 %:n väli: ${euro(vero(tulos.ala80))} – ${euro(vero(tulos.yla80))}</div>
      </div>
      <div class="luku">
        <div class="otsake">Arvioitu verotusarvo</div>
        <div class="arvo">${euro(tulos.arvio)}</div>
        <div class="vali">80 %:n väli: ${euro(tulos.ala80)} – ${euro(tulos.yla80)}</div>
      </div>
      <div class="luku">
        <div class="otsake">Veroprosentti</div>
        <div class="arvo">${prosentti == null ? "–" : pros(prosentti)}</div>
        <div class="vali pieni">${esc(alustava ? "Verrokkien mediaani" : prosPeruste)}</div>
      </div>
    </div>
    ${prosHuomio ? `<div style="margin:-6px 0 16px">${prosHuomio}</div>` : ""}
    ${ennakkoOsio}
    <div class="kortti">
      <h2>Mihin arvio perustuu</h2>
      <div class="palkki">${palkki}</div>
      <div class="selitteet">${selitteet}</div>
      <p class="pieni" style="margin-bottom:0"><strong>${TUKI_SELITE[tulos.tuki]}.</strong> ${tarkkuusTeksti}
      Auton ikä verotushetkellä ${tulos.ika.toLocaleString("fi-FI", { maximumFractionDigits: 1 })} vuotta.
      50 %:n väli verotusarvolle: ${euro(tulos.ala50)} – ${euro(tulos.yla50)}.</p>
      ${lisaPerusteluHtml}
      ${vpVertailu}
    </div>
    ${uusiOsio}
    <div class="kortti">
      <h2>Lähimmät verrokit (${tulos.verrokkeja} käytetty, ${tulos.verrokit.length} painavinta)</h2>
      ${tulos.verrokit.length ? `<div class="taulukko"><table>
        <thead><tr><th>Taso</th><th>Merkki ja malli</th><th class="oikea">kW</th><th>Käyttövoima</th><th class="oikea">Ensirek.</th>
        <th class="oikea">Päätös</th><th class="oikea">Ajettu</th><th class="oikea">Verotusarvo</th><th class="oikea">Vero-%</th>
        <th class="oikea">Siirrettynä tähän autoon</th><th>Paino</th></tr></thead>
        <tbody>${rivit}</tbody></table></div>
        <p class="pieni">"Siirrettynä tähän autoon" tarkoittaa verrokin verotusarvoa, joka on korjattu kohdeauton ikään,
        ajokilometreihin, tehoon ja verotushetkeen. Arvio ei huomioi varusteita eikä kuntoa, koska niitä ei ole aineistossa.</p>`
        : `<p class="pieni">Merkiltä ei löytynyt verrokkeja. Arvio perustuu kaikkien merkkien yleiseen hintamalliin, joten se on hyvin karkea.
           Syötä vastaavan uuden auton hinta lisätietoihin.</p>`}
    </div>
    ${kp && kp.verrokit && kp.verrokit.length ? `<div class="kortti">
      <h2>Kauppiaiden arviot lähes samanlaisista autoista</h2>
      <div class="taulukko"><table>
        <thead><tr><th>Merkki ja malli</th><th class="oikea">kW</th><th class="oikea">Ensirek.</th><th class="oikea">Ajettu</th>
        <th class="oikea">Annettu</th><th class="oikea">Laskurin arvio</th><th class="oikea">Kauppiaan arvio</th><th class="oikea">Ero</th></tr></thead>
        <tbody>${kp.verrokit.map((v) => `<tr><td>${esc(v.merkki)} ${esc(v.malli)}</td><td class="oikea">${Math.round(v.kw)}</td>
          <td class="oikea">${kk(v.ensirek)}</td><td class="oikea">${Math.round(v.km).toLocaleString("fi-FI")} tkm</td>
          <td class="oikea">${pvm(v.annettu)}</td><td class="oikea">${euro((v.laskurinArvo * v.veropros) / 100)}</td>
          <td class="oikea">${euro((v.kauppiaanArvo * v.veropros) / 100)}</td><td class="oikea">${muutos(v.ero)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="pieni">Autoverot laskettu kunkin arvion veroprosentilla. Laskuri korjaa arviotaan näiden erojen painotetulla keskiarvolla
        sitä voimakkaammin, mitä vähemmän mallista on Verohallinnon päätöksiä. <a href="koulutus.html">Koulutustila</a></p>
    </div>` : ""}`;
}

function naytaTarkkuus() {
  const k = malli.kalibrointi;
  if (!k) { $("tarkkuus").innerHTML = "<p>Tarkkuustestiä ei ole ajettu.</p>"; return; }
  const luokat = { yleinen: "Yleiset mallit (30+ lähes samanlaista)", harvinainen: "Harvinaiset (5–29)", erittain: "Erittäin harvinaiset (alle 5)" };
  const rivi = (nimi, l) => (l ? `<tr><td>${nimi}</td><td class="oikea">${l.n}</td><td class="oikea">${pros(l.mediaaniVirhePros)}</td>
      <td class="oikea">${pros(l.alle10Pros)}</td><td class="oikea">${pros(l.valinOsuma)}</td></tr>` : "");
  const otsikko = `<thead><tr><th>Ryhmä</th><th class="oikea">Testattu</th><th class="oikea">Mediaanivirhe</th><th class="oikea">Alle 10 % virhe</th><th class="oikea">80 %:n välin osuma</th></tr></thead>`;
  const rivit1 = Object.entries(luokat).map(([a, nimi]) => rivi(nimi, k.luokat[a])).join("");
  const aj = malli.ajallinen;
  const rivit3 = aj ? Object.entries(luokat).map(([a, nimi]) => rivi(nimi, aj.luokat[a])).join("") : "";
  const rivit2 = Object.entries(k.tuki).map(([t, v]) => `<tr><td>${t}: ${TUKI_SELITE[t]}</td><td class="oikea">${v.n}</td>
      <td class="oikea">${pros(v.mediaaniVirhePros)}</td><td class="oikea">${muutos(v.kvantiilit.p10)} … ${muutos(v.kvantiilit.p90)}</td></tr>`).join("");
  const indeksi = Object.entries(malli.kertoimet).map(([r, K]) => {
    const a = K.indeksi.arvot;
    const nimi = { EV: "Sähköautot", HYB: "Hybridit", ICE: "Polttomoottoriautot" }[r];
    const vuosi = Math.max(0, a.length - 13);
    return `${nimi} ${muutos(a[a.length - 1] - a[vuosi])}`;
  }).join(", ");
  let sukupolviLkm = 0;
  for (const T of Object.values(malli.sukupolvet || {})) sukupolviLkm += Object.keys(T).length;
  $("tarkkuus").innerHTML = `
    <p>Laskuri siirtää jokaisen aiemman verotuspäätöksen kohdeauton ikään, ajokilometreihin, tehoon ja verotushetken
    hintatasoon. Siirtokertoimet ja kuukausittainen hintaindeksi opitaan koko aineistosta vertaamalla saman mallin autoja
    keskenään. Verrokit painotetaan sen mukaan, kuinka lähellä ne ovat: malli, teho, ikä, iskutilavuus, päästöt
    (päätelty päätöksen veroprosentista), korimalli, vetotapa, vaihteisto ja päätöksen tuoreus.
    Vanhemmat päätökset painavat vain, jos saman mallin tuoreita päätöksiä ei ole.</p>
    <p>Saman mallin verrokeista lasketaan lisäksi mallikohtainen ikä-, kilometri-, teho- ja hintakehitys, kuten
    Verohallinnon oma merkki- ja mallikohtainen malli tekee. Lähes samanlaiset autot (sama teho, lähes sama ikä ja
    kilometrit) painavat eniten, koska Verohallinto arvottaa ne lähes samoin: niiden verotusarvot poikkeavat toisistaan
    tyypillisesti alle 2 %.</p>
    <p>Jos saman mallin päätöksiä on vähän, arvio nojaa porrastetusti mallisarjan, merkin ja lopulta kaikkien merkkien tietoihin.
    Tämä on harvinaisten autojen arvioinnin ydin: yksittäinen päätös ei ratkaise yksin, mutta sitä ei myöskään hukuteta.</p>
    <p>Laskuri etsii jokaisen yleisen mallin hintatasosta portaita ensirekisteröinnin mukaan (ikä, kilometrit ja teho
    huomioiden). Porras kertoo yleensä sukupolven tai mallipäivityksen vaihdoksesta, ja portaan toisella puolella
    rekisteröidyt verrokit painavat vähemmän${sukupolviLkm ? ` (tunnistettu ${sukupolviLkm} mallissa)` : ""}. Jos auton teho on
    saman mallin aiempien päätösten tehoalueen ulkopuolella (esimerkiksi erikoisversio), arviossa korjataan tällaisten
    autojen aiempi keskimääräinen virhe ja vaihteluväli on leveämpi. Kun harvinaisen auton tai erikoisversion
    autoveron 80 %:n väli on vähintään ${euro(ENNAKKO.rajaEuroa)} leveä, laskuri ehdottaa Verohallinnon sitovaa
    ennakkoratkaisua.</p>
    <p>Verotusarvojen hintataso viimeisen vuoden aikana: ${indeksi}.</p>
    ${aj ? `<p><strong>Ennuste tulevista päätöksistä.</strong> Malli opetettiin ennen ${pvm(Date.parse(aj.raja))} tehdyillä päätöksillä,
    ja sillä ennustettiin sen jälkeen tehdyt päätökset. Tämä vastaa laskurin todellista käyttöä.</p>
    <div class="taulukko"><table class="tarkkuus">${otsikko}<tbody>${rivit3}</tbody></table></div>` : ""}
    <p><strong>Poisjättötesti.</strong> ${k.testattu.toLocaleString("fi-FI")} päätöstä koko aineistosta ennustettiin ilman
    päätöstä itseään. Vaihteluvälit perustuvat tähän testiin. Luvut ovat ennustetta heikompia, koska testi kattaa myös
    vanhoja päätöksiä, joiden markkinatilanne poikkesi nykyisestä.</p>
    <div class="taulukko"><table class="tarkkuus">${otsikko}<tbody>${rivit1}</tbody></table></div>
    <div class="taulukko" style="margin-top:12px"><table class="tarkkuus">
      <thead><tr><th>Tukitaso</th><th class="oikea">Testattu</th><th class="oikea">Mediaanivirhe</th><th class="oikea">80 %:n väli</th></tr></thead>
      <tbody>${rivit2}</tbody></table></div>
    <p class="pieni">Testit ajetaan uudelleen joka kuukausi aineiston päivityksen yhteydessä.</p>`;
}

lataa();
