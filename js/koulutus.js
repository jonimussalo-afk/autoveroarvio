// Koulutustila: kauppias syöttää auton, näkee laskurin arvion ja antaa oman arvionsa autoverosta.
import { arvioiKauppiaat, harvinaisuus, malliTasot, polttoaineryhma, pvmMerkkijonosta } from "./malli.js";
import { veroprosentti, wltpVastine } from "./verotaulukot.js";
import { euro, pros, pvm, esc, muutos, yhtenaistaMerkki, luku } from "./apu.js";
import {
  PALAUTE_VERSIO, arvoKauppiaalta, etsiToteutunut, kauppiasTunnus, luePalautteet, merkkiAineisto, pysyvaTallennus, samaAuto, tallennaPalautteet, tarkistaPalaute, tuoJson, uusiId, vientiJson, yhdistaPalautteet,
} from "./palaute.js";

const $ = (id) => document.getElementById(id);
const tanaan = () => new Date().toISOString().slice(0, 10);
const KENTAT = ["merkki", "malli", "kw", "kayttovoima", "ensirek", "km", "wltp", "nedc", "korimalli", "vetotapa", "vaihteisto",
  "cm3", "ovet", "omapros"];
const ESITAYTETTAVAT = ["kayttovoima", "korimalli", "vetotapa", "vaihteisto", "cm3", "ovet"];

let malli = null;
const merkkiTiedostot = new Map(); // merkki -> tiedostonimi
const jsonMuisti = new Map(); // merkki -> Promise<merkkitiedosto | null>
const aineistoMuisti = new Map(); // merkki -> aineisto (päätökset + tämän selaimen arviot)
const kosketut = new Set();
let nykyinen = null; // viimeisin laskettu arvio
let laskuKierros = 0;

// ---------- aineisto ----------

function merkinJson(merkki) {
  if (!jsonMuisti.has(merkki)) {
    const tiedosto = merkkiTiedostot.get(merkki);
    jsonMuisti.set(merkki, tiedosto
      ? fetch("data/merkit/" + tiedosto).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null));
  }
  return jsonMuisti.get(merkki);
}

async function merkinAineisto(merkki) {
  if (!aineistoMuisti.has(merkki)) aineistoMuisti.set(merkki, merkkiAineisto(await merkinJson(merkki), merkki, luePalautteet()));
  return aineistoMuisti.get(merkki);
}

async function lataa() {
  try {
    malli = await fetch("data/malli.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    for (const [nimi, , tiedosto] of malli.yhteenveto.merkit) merkkiTiedostot.set(nimi, tiedosto);
    alustaLomake();
    naytaTallennustila();
    naytaYhteinen();
    await piirraLista();
  } catch (e) {
    $("lomakeTila").innerHTML = `<div class="virhe">Aineistoa ei voitu ladata (${esc(e.message)}). Avaa sivu GitHub Pagesin kautta
      tai käynnistä paikallinen palvelin (ohje tiedostossa README.md).</div>`;
  }
}

// ---------- lomake ----------

const vaihtoehdot = (lista, tyhja) => (tyhja ? `<option value="">${tyhja}</option>` : "") +
  lista.filter(([v]) => v).map(([v]) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

function alustaLomake() {
  const Y = malli.yhteenveto;
  $("merkit").innerHTML = Y.merkit.map(([m, n]) => `<option value="${esc(m)}" label="${n} päätöstä">`).join("");
  $("kayttovoima").innerHTML = vaihtoehdot(Y.kayttovoima);
  $("kayttovoima").value = "Bensiini";
  $("korimalli").innerHTML = vaihtoehdot(Y.korimalli, "Ei tiedossa");
  $("vetotapa").innerHTML = vaihtoehdot(Y.vetotapa, "Ei tiedossa");

  let ajastin;
  const paivita = () => { clearTimeout(ajastin); ajastin = setTimeout(laske, 150); };
  for (const id of KENTAT) {
    $(id).addEventListener("input", () => { kosketut.add(id); $("tallennusTulos").innerHTML = ""; paivita(); });
    $(id).addEventListener("change", paivita);
  }
  const merkkiMuuttui = async () => { await paivitaMallit(); paivita(); };
  $("merkki").addEventListener("change", merkkiMuuttui);
  $("merkki").addEventListener("input", merkkiMuuttui);
  for (const id of ["malli", "kw"]) {
    $(id).addEventListener("change", () => paivitaTehot());
    $(id).addEventListener("input", () => paivitaTehot());
  }
  $("tallenna").addEventListener("click", tallenna);
  $("vie").addEventListener("click", () => vie(false));
  $("vieKaikki").addEventListener("click", () => vie(true));
  $("tuo").addEventListener("change", tuo);
  laske();
}

async function paivitaMallit() {
  const merkki = yhtenaistaMerkki($("merkki").value);
  if (!merkki) { $("mallit").innerHTML = ""; $("tehot").innerHTML = ""; return; }
  const a = await merkinAineisto(merkki);
  const mi = a.hakemisto.merkki.get(merkki);
  if (mi === undefined || !a.merkinMallit.has(mi)) { $("mallit").innerHTML = ""; $("tehot").innerHTML = ""; return; }
  $("mallit").innerHTML = [...a.merkinMallit.get(mi)].map((m) => [m, a.malliLkm.get(m) || 0]).sort((x, y) => y[1] - x[1]).slice(0, 400)
    .map(([m, n]) => `<option value="${esc(a.malliTiedot[m].nimi)}" label="${n} päätöstä">`).join("");
  await paivitaTehot();
}

/** Mallin versiot (teho ja käyttövoima) napeiksi ja saman version tiedoilla esitäyttö. */
async function paivitaTehot() {
  const merkki = yhtenaistaMerkki($("merkki").value), malliNimi = $("malli").value.trim();
  if (!merkki || !malliNimi) { $("tehot").innerHTML = ""; return; }
  const a = await merkinAineisto(merkki);
  const mi = a.hakemisto.merkki.get(merkki);
  if (mi === undefined) { $("tehot").innerHTML = ""; return; }
  const kartta = malliTasot(a, merkki, malliNimi);
  const { A, sanasto } = a;
  const kw = luku($("kw").value);
  const lkw = kw ? Math.log(kw) : null;
  const tehot = new Map();
  const arvot = Object.fromEntries(ESITAYTETTAVAT.map((k) => [k, new Map()]));
  const lisaa = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (let g = 0; g < 3; g++) {
    for (const r of a.merkkiRyhma.get(mi * 3 + g) || []) {
      if (A.lahde[r] || kartta.get(A.malli[r]) !== "malli") continue;
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
  const suurin = (m) => [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  for (const [kentta, m] of Object.entries(arvot)) {
    const vahintaan = ["korimalli", "vetotapa", "ovet"].includes(kentta) ? 2 : 1;
    if (m.size && !kosketut.has(kentta) && m.get(suurin(m)) >= vahintaan) $(kentta).value = suurin(m);
  }
  const lista = [...tehot.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  $("tehot").innerHTML = lista.length
    ? `<span class="pieni">Aineistossa:</span>` + lista.map(([k, n]) => {
      const [kwArvo, kv] = k.split("|");
      return `<button type="button" data-kw="${esc(kwArvo)}" data-kv="${esc(kv)}">${esc(kwArvo)} kW · ${esc(kv.toLowerCase())} (${n})</button>`;
    }).join("")
    : `<span class="pieni">Tällä nimellä ei ole päätöksiä – juuri tällaisissa autoissa arviosi on arvokkain.</span>`;
  $("tehot").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("kw").value = b.dataset.kw;
    $("kayttovoima").value = b.dataset.kv;
    kosketut.add("kayttovoima");
    for (const k of ["korimalli", "vetotapa", "vaihteisto", "cm3", "ovet"]) kosketut.delete(k);
    paivitaTehot();
    laske();
  }));
}

// ---------- laskurin arvio ----------

function autoLomakkeelta() {
  const vaihteisto = $("vaihteisto").value;
  return {
    merkki: yhtenaistaMerkki($("merkki").value), malli: $("malli").value.trim().toUpperCase(), kw: luku($("kw").value),
    kayttovoima: $("kayttovoima").value, korimalli: $("korimalli").value || null, vetotapa: $("vetotapa").value || null,
    vaihteisto: vaihteisto === "AUT" ? "AUT" : vaihteisto === "MAN" ? "" : null,
    cm3: luku($("cm3").value) || 0, ovet: luku($("ovet").value) || 0, ensirek: $("ensirek").value, km: luku($("km").value),
    wltp: luku($("wltp").value), nedc: luku($("nedc").value),
  };
}

async function laske() {
  if (!malli) return;
  const kierros = ++laskuKierros;
  const auto = autoLomakkeelta();
  const puuttuu = [];
  if (!auto.merkki) puuttuu.push("merkki");
  if (!auto.malli) puuttuu.push("malli");
  if (!auto.kw || auto.kw < 10) puuttuu.push("teho");
  if (!auto.ensirek) puuttuu.push("ensirekisteröintipäivä");
  if (auto.km === null) puuttuu.push("ajokilometrit");
  if (puuttuu.length) {
    $("lomakeTila").textContent = `Täytä vielä: ${puuttuu.join(", ")}.`;
    $("arvioKortti").hidden = true; $("omaKortti").hidden = true; nykyinen = null;
    return;
  }
  $("lomakeTila").textContent = "";
  const aineisto = await merkinAineisto(auto.merkki);
  if (kierros !== laskuKierros) return; // lomaketta muutettiin latauksen aikana
  const ryhma = polttoaineryhma(auto.kayttovoima);
  const verotus = tanaan();
  const kohde = {
    merkki: auto.merkki, malli: auto.malli, kw: auto.kw, ryhma, km: auto.km / 1000,
    ensirek: pvmMerkkijonosta(auto.ensirek), verotus: pvmMerkkijonosta(verotus),
    korimalli: auto.korimalli, vetotapa: auto.vetotapa, vaihteisto: auto.vaihteisto, cm3: auto.cm3, ovet: auto.ovet,
    paasto: ryhma === "EV" ? NaN : wltpVastine(auto.wltp, auto.nedc), kayttovoima: auto.kayttovoima,
  };
  if (kohde.verotus < kohde.ensirek) {
    $("lomakeTila").innerHTML = `<div class="virhe">Ensirekisteröintipäivä on tulevaisuudessa.</div>`;
    $("arvioKortti").hidden = true; $("omaKortti").hidden = true; nykyinen = null;
    return;
  }
  kohde.tasoKartta = malliTasot(aineisto, auto.merkki, auto.malli);
  const tulos = arvioiKauppiaat(aineisto, malli, kohde, { verrokkeja: 0 });
  if (tulos.virhe) {
    $("lomakeTila").innerHTML = `<div class="virhe">${esc(tulos.virhe)}</div>`;
    $("arvioKortti").hidden = true; $("omaKortti").hidden = true; nykyinen = null;
    return;
  }
  const hv = harvinaisuus(aineisto, kohde);
  const oma = luku($("omapros").value);
  const vp = veroprosentti({ ensirek: auto.ensirek, ryhma, wltp: auto.wltp, nedc: auto.nedc, mallipros: null,
    diesel: /diesel/i.test(auto.kayttovoima) });
  const prosentti = oma !== null ? oma : vp.prosentti;
  nykyinen = { auto, kohde, tulos, hv, prosentti, vp };
  piirraArvio();
}

const VAIKUTUS = {
  A: ["ei", "Ei muuta arvioita", "Laskurilla on tästä mallista runsaasti Verohallinnon päätöksiä, joten arviosi ei muuta sen arvioita. Se tallennetaan silti, ja sillä seurataan, kumpi osuu lähemmäs."],
  B: ["pieni", "Pieni", "Tästä mallista on muutama lähellä oleva päätös. Arviosi korjaa lähes samanlaisten autojen arvioita hieman."],
  C: ["kohtalainen", "Kohtalainen", "Tästä mallista on vähän päätöksiä. Arviosi korjaa lähes samanlaisten autojen arvioita selvästi."],
  D: ["suuri", "Suuri", "Tästä mallista ei juuri ole päätöksiä, joten arviosi on erityisen arvokas: se korjaa lähes samanlaisten autojen arvioita eniten."],
  E: ["suuri", "Suuri", "Merkistä ei juuri ole päätöksiä, joten arviosi on erityisen arvokas."],
};

function piirraArvio() {
  const { tulos, hv, prosentti, vp } = nykyinen;
  const vero = (x) => (prosentti == null ? null : (x * prosentti) / 100);
  const kal = omaKalibrointi();
  const [luokka, sana, selitys] = prosentti === 0
    ? ["ei", "Ei vaikutusta", "Auto on veroton, joten arvio autoverosta ei kerro sen arvosta."]
    : kal && kal.paino === 0
      ? ["ei", "Ei toistaiseksi", "Arviointitestin perusteella arviosi eivät tällä hetkellä muuta laskurin arvioita. Ne tallentuvat silti, ja niitä verrataan toteutuneisiin päätöksiin; painoa voidaan nostaa myöhemmin."]
      : VAIKUTUS[tulos.tuki] || VAIKUTUS.E;
  const lahella = Math.max(hv.malli, hv.sarja);
  const kp = tulos.kauppias;
  $("laskurinArvio").innerHTML = `
    <div class="iso">
      <div class="luku paa">
        <div class="otsake">Laskurin arvio autoverosta</div>
        <div class="arvo">${prosentti == null ? "–" : euro(vero(tulos.arvio))}</div>
        <div class="vali">${prosentti == null ? "Veroprosentti puuttuu" : `80 %:n väli: ${euro(vero(tulos.ala80))} – ${euro(vero(tulos.yla80))}`}</div>
      </div>
      <div class="luku">
        <div class="otsake">Verotusarvo</div>
        <div class="arvo">${euro(tulos.arvio)}</div>
        <div class="vali">Veroprosentti ${prosentti == null ? "–" : pros(prosentti)}${prosentti != null && $("omapros").value === "" ? ` (${esc(vp.peruste)})` : ""}</div>
      </div>
    </div>
    <p class="pieni">${esc(hv.selite)}: lähes samanlaisia Verohallinnon päätöksiä ${lahella}${hv.kauppias ? `, kauppiaiden arvioita ${hv.kauppias}` : ""}.
      ${kp && kp.korjaus ? `Kauppiaiden arviot ${kp.lkm} lähes samanlaisesta autosta ovat korjanneet laskurin omaa arviota ${muutos(kp.korjaus)}.` : ""}</p>
    <div class="merkki m-${luokka}"><strong>Arviosi vaikutus: ${sana}</strong><br>${selitys}</div>`;
  $("arvioKortti").hidden = false;

  // Oma arvio: tarvitaan veroprosentti, jotta vero voidaan muuttaa verotusarvoksi
  $("omaKortti").hidden = false;
  let este = "";
  if (prosentti === 0) {
    este = `Auto on veroton (täyssähkö- tai vetyauto, otettu käyttöön 1.10.2021 tai myöhemmin), joten veroarvio ei opeta laskuria.`;
  } else if (prosentti == null) {
    const v = tulos.verrokkienVeroprosentit;
    este = `Veroprosenttia ei voitu laskea (${esc(vp.peruste)}). Syötä CO2-päästö tai oma veroprosentti lisätiedoista.` +
      (v ? ` <button type="button" class="toissijainen" id="kaytaVerrokit" style="margin-top:6px">Käytä lähimpien verrokkien prosenttia ${pros(v.mediaani)}</button>` : "");
  }
  $("omaSisalto").querySelectorAll("input, button").forEach((e) => { e.disabled = Boolean(este); });
  $("omaEste")?.remove();
  if (este) {
    $("omaSisalto").insertAdjacentHTML("afterbegin", `<div class="huomio" id="omaEste" style="margin:0 0 6px">${este}</div>`);
    $("kaytaVerrokit")?.addEventListener("click", () => {
      $("omapros").value = String(tulos.verrokkienVeroprosentit.mediaani).replace(".", ",");
      kosketut.add("omapros");
      laske();
    });
    $("kaytaVerrokit") && ($("kaytaVerrokit").disabled = false);
  }
}

// ---------- tallennus ----------

async function tallenna() {
  const n = nykyinen;
  if (!n || !(n.prosentti > 0)) return;
  const vero = luku($("omaVero").value);
  const tulosEl = $("tallennusTulos");
  if (!(vero > 0)) { tulosEl.innerHTML = `<div class="virhe">Syötä arvioimasi autovero euroina.</div>`; return; }
  const laskurinVero = (n.tulos.laskurinOmaArvio * n.prosentti) / 100;
  const ero = Math.log(vero / laskurinVero);
  if (Math.abs(ero) > Math.log(1.5) &&
    !confirm(`Arviosi (${euro(vero)}) poikkeaa laskurin omasta arviosta (${euro(laskurinVero)}) ${muutos(ero)}. Tallennetaanko silti?`)) return;
  let lista = luePalautteet();
  const vanha = lista.find((p) => samaAuto(p, { auto: n.auto }));
  if (vanha && !confirm(`Olet jo arvioinut tämän auton (${euro(vanha.kauppiaanVero)}, ${pvm(Date.parse(vanha.annettu))}). Korvataanko aiempi arvio?`)) return;
  if (vanha) lista = lista.filter((p) => p.id !== vanha.id);
  const huomio = $("huomio").value.trim();
  const palaute = {
    id: uusiId(), versio: PALAUTE_VERSIO, kauppias: kauppiasTunnus(), annettu: tanaan(),
    auto: n.auto, veroprosentti: n.prosentti, kauppiaanVero: Math.round(vero),
    laskuri: { arvo: Math.round(n.tulos.laskurinOmaArvio), vero: Math.round(laskurinVero), tuki: n.tulos.tuki, luokka: n.hv.luokka, versio: malli.versio },
    ...(huomio ? { huomio } : {}), lahetetty: null,
  };
  const t = tarkistaPalaute(palaute);
  if (!t.ok) { tulosEl.innerHTML = `<div class="virhe">Arviota ei voitu tallentaa (${esc(t.virhe)}).</div>`; return; }
  lista.unshift(palaute);
  const pysyva = tallennaPalautteet(lista);
  aineistoMuisti.clear();
  const ennen = n.tulos.arvio;
  await laske();
  const nyt = nykyinen ? nykyinen.tulos.arvio : ennen;
  const muuttui = Math.abs(Math.log(nyt / ennen)) > 0.0005;
  tulosEl.innerHTML = `<div class="ok"><strong>Arvio tallennettu.</strong> ${muuttui
    ? `Laskurin arvio tälle autolle on nyt ${euro((nyt * n.prosentti) / 100)} (ennen ${euro((ennen * n.prosentti) / 100)}).
       Laskuri ottaa arviostasi huomioon osan, koska yksittäinen arvio voi osua ohi; useampi arvio samanlaisista autoista korjaa enemmän.`
    : omaKalibrointi() && omaKalibrointi().paino === 0
      ? "Laskurin arvio ei muuttunut, koska arviointitestin perusteella arviosi eivät toistaiseksi vaikuta laskuriin. Arvio verrataan myöhemmin toteutuneeseen päätökseen."
      : "Laskurin arvio tälle autolle ei muuttunut, koska mallista on runsaasti Verohallinnon päätöksiä."}
    ${pysyva ? "" : "<br>Huom. selaimen muisti ei ole käytössä: lataa arviot tiedostona ennen kuin suljet sivun."}</div>`;
  $("omaVero").value = "";
  $("huomio").value = "";
  await piirraLista();
}

// ---------- antamasi arviot ----------

async function piirraLista() {
  const lista = luePalautteet();
  if (!lista.length) {
    $("lista").innerHTML = `<p class="tyhja">Et ole vielä antanut arvioita.</p>`;
    $("yhteenveto").textContent = "";
    return;
  }
  // Toteutuneet päätökset: haetaan merkkien Verohallinnon päätökset (ilman kauppiaiden arvioita)
  const merkit = [...new Set(lista.map((p) => yhtenaistaMerkki(p.auto.merkki)))];
  const aineistot = new Map(await Promise.all(merkit.map(async (m) => [m, merkkiAineisto(await merkinJson(m), m, [])])));
  let verrattu = 0, sinaLahempana = 0;
  const virheK = [], virheL = [];
  const rivit = lista.map((p) => {
    const a = aineistot.get(yhtenaistaMerkki(p.auto.merkki));
    const r = a ? etsiToteutunut(a, p) : -1;
    const laskurinVero = p.laskuri && p.laskuri.vero ? p.laskuri.vero : null;
    const ero = laskurinVero ? Math.log(p.kauppiaanVero / laskurinVero) : null;
    let toteutunut = `<span class="pieni" title="Verohallinnon päätöstä samasta autosta ei vielä ole aineistossa">–</span>`;
    if (r >= 0) {
      const arvo = a.A.arvo[r], vero = (arvo * a.A.veropros[r]) / 100;
      const eK = Math.abs(Math.log(arvoKauppiaalta(p) / arvo));
      const eL = p.laskuri && p.laskuri.arvo ? Math.abs(Math.log(p.laskuri.arvo / arvo)) : null;
      verrattu++;
      virheK.push(eK);
      if (eL !== null) { virheL.push(eL); if (eK < eL) sinaLahempana++; }
      toteutunut = `${euro(vero)}<br><span class="pieni">${eL === null ? "" : eK < eL ? '<span class="sina">sinä osuit lähemmäs</span>' : "laskuri osui lähemmäs"}</span>`;
    }
    const a2 = p.auto;
    return `<tr>
      <td>${pvm(Date.parse(p.annettu))}<br><span class="pieni">${p.lahetetty ? "lähetetty" : "lähettämättä"}</span></td>
      <td>${esc(a2.merkki)} ${esc(a2.malli)}<br><span class="pieni">${a2.kw} kW · ${esc(a2.ensirek.slice(0, 4))} · ${Math.round(a2.km / 1000)} tkm${p.huomio ? " · " + esc(p.huomio) : ""}</span></td>
      <td class="oikea">${euro(laskurinVero)}</td>
      <td class="oikea sina">${euro(p.kauppiaanVero)}</td>
      <td class="oikea">${ero === null ? "–" : muutos(ero)}</td>
      <td class="oikea">${toteutunut}</td>
      <td class="oikea"><button type="button" class="poista" data-id="${p.id}" title="Poista arvio">Poista</button></td>
    </tr>`;
  }).join("");
  $("lista").innerHTML = `<div class="taulukko"><table>
    <thead><tr><th>Annettu</th><th>Auto</th><th class="oikea">Laskuri</th><th class="oikea">Sinä</th><th class="oikea">Ero</th>
    <th class="oikea">Toteutunut</th><th></th></tr></thead><tbody>${rivit}</tbody></table></div>`;
  $("lista").querySelectorAll(".poista").forEach((b) => b.addEventListener("click", async () => {
    const id = Number(b.dataset.id);
    if (!confirm("Poistetaanko arvio?")) return;
    tallennaPalautteet(luePalautteet().filter((p) => p.id !== id));
    aineistoMuisti.clear();
    await piirraLista();
    laske();
  }));
  const lahettamatta = lista.filter((p) => !p.lahetetty).length;
  const med = (v) => { const s = v.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const prosV = (x) => pros((Math.exp(x) - 1) * 100);
  $("yhteenveto").innerHTML = `${lista.length} ${lista.length === 1 ? "arvio" : "arviota"} · ${lahettamatta} lähettämättä` +
    (verrattu ? ` · toteutuneeseen päätökseen verrattu ${verrattu}: osuit lähemmäs ${sinaLahempana} kertaa` +
      (virheK.length >= 3 && virheL.length >= 3 ? ` (mediaanivirhe: sinä ${prosV(med(virheK))}, laskuri ${prosV(med(virheL))})` : "") : "") + ".";
}

// ---------- vienti ja tuonti ----------

function lataaTiedosto(nimi, teksti) {
  const url = URL.createObjectURL(new Blob([teksti], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = nimi;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function vie(kaikki) {
  const lista = luePalautteet();
  const vietavat = kaikki ? lista : lista.filter((p) => !p.lahetetty);
  if (!vietavat.length) { alert(kaikki ? "Sinulla ei ole vielä arvioita." : "Kaikki arviot on jo ladattu lähetettäviksi."); return; }
  lataaTiedosto(`kauppiaan-arviot-${tanaan()}${kaikki ? "-kaikki" : ""}.json`, vientiJson(vietavat));
  if (!kaikki) {
    const ladatut = new Set(vietavat.map((p) => p.id));
    tallennaPalautteet(lista.map((p) => (ladatut.has(p.id) ? { ...p, lahetetty: tanaan() } : p)));
    await piirraLista();
  }
}

async function tuo(e) {
  const tiedosto = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!tiedosto) return;
  try {
    const tuodut = tuoJson(await tiedosto.text());
    const vanhat = luePalautteet();
    const tunnetut = new Set(vanhat.map((p) => p.id));
    const uusia = tuodut.filter((p) => !tunnetut.has(p.id)).length;
    tallennaPalautteet(yhdistaPalautteet(vanhat, tuodut));
    aineistoMuisti.clear();
    alert(`Tiedostossa oli ${tuodut.length} kelvollista arviota, joista ${uusia} uutta.`);
    await piirraLista();
    laske();
  } catch (virhe) {
    alert(`Tiedostoa ei voitu lukea (${virhe.message}).`);
  }
}

// ---------- tilatiedot ----------

/** Tämän kauppiaan kalibrointi arviointitestin perusteella (data/kalibrointi.json kautta malli.json:ssa). */
function omaKalibrointi() {
  const k = malli && malli.kauppiaskalibrointi && malli.kauppiaskalibrointi.kauppiaat;
  return k ? k[kauppiasTunnus()] || null : null;
}

function naytaTallennustila() {
  $("tallennusTila").innerHTML = pysyvaTallennus()
    ? `Arviot tallentuvat tähän selaimeen. Kauppiastunnuksesi on ${esc(kauppiasTunnus())} (satunnainen, ei sisällä nimeäsi).` +
      (omaKalibrointi() ? ` Arvioidesi paino on säädetty arviointitestin perusteella${omaKalibrointi().paino === 0 ? ": ne eivät toistaiseksi muuta laskurin arvioita" : ` (paino ${String(omaKalibrointi().paino).replace(".", ",")})`}.` : "")
    : `Selaimen muisti ei ole käytössä (esimerkiksi yksityinen ikkuna), joten arviot katoavat, kun suljet sivun. Lataa ne tiedostona ennen sulkemista.`;
}

function naytaYhteinen() {
  const k = malli.koulutus;
  if (!k || !k.arvioita) { $("yhteinen").textContent = "Yhteiseen laskuriin ei ole vielä lisätty kauppiaiden arvioita."; return; }
  const t = k.tarkistettu || {};
  $("yhteinen").textContent = `Yhteisessä laskurissa on ${k.arvioita} kauppiaiden ${k.arvioita === 1 ? "arvio" : "arviota"} ` +
    `(${k.kauppiaita} ${k.kauppiaita === 1 ? "kauppias" : "kauppiasta"}).` +
    (t.n ? ` Toteutuneisiin päätöksiin on verrattu ${t.n}: kauppiaiden mediaanivirhe ${pros(t.kauppiaanMediaaniVirhePros)}, ` +
      `laskurin ${pros(t.laskurinMediaaniVirhePros)}.` : "");
}

lataa();
