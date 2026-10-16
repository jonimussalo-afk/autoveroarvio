// Arviointitesti: kauppias arvioi sokkona 30 Verohallinnon jo verottaman auton autoveron.
import { euro, pros, kk, esc, luku } from "./apu.js";
import { kauppiasTunnus } from "./palaute.js";
import { analysoiTesti, LUOKKA_NIMET, VARMUUS_NIMET, OHJE_TEKOALYLLE } from "./testianalyysi.js";

const $ = (id) => document.getElementById(id);
const TESTI_AVAIN = "autoveroarvio.testi.v1";
const AUTOJA = 30;
const PER_LUOKKA = 10;

let pooli = null;
let tila = null;
const valitut = new Set();
let varmuus = null;
let aikaAlku = 0;
let testiMuisti = null; // varalla, jos selaimen testiMuisti ei ole käytössä

// ---------- tallennus ----------

function lueTila() {
  try { const t = localStorage.getItem(TESTI_AVAIN); return t ? JSON.parse(t) : null; } catch { return testiMuisti; }
}
function tallennaTila() {
  testiMuisti = tila;
  try { if (tila) localStorage.setItem(TESTI_AVAIN, JSON.stringify(tila)); else localStorage.removeItem(TESTI_AVAIN); } catch { /* muistissa */ }
}

function nayta(osio) {
  for (const id of ["alku", "kysymys", "tulos", "virhe"]) $(id).hidden = id !== osio;
  window.scrollTo(0, 0);
}

// ---------- lataus ja aloitus ----------

async function lataa() {
  try {
    pooli = await fetch("data/testi.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  } catch (e) {
    $("virhe").innerHTML = `<div class="virhe">Testin autoja ei voitu ladata (${esc(e.message)}). Testi otetaan käyttöön
      seuraavassa aineiston päivityksessä.</div>`;
    nayta("virhe");
    return;
  }
  tila = lueTila();
  if (tila && tila.valmis) naytaTulos();
  else naytaAlku();
}

function naytaAlku() {
  nayta("alku");
  const kesken = tila && !tila.valmis && tila.autot;
  if (kesken) {
    const vastattu = tila.vastaukset.filter(Boolean).length;
    $("kesken").innerHTML = `<div class="huomio">Sinulla on kesken jäänyt testi (${vastattu}/${tila.autot.length} autoa).
      <div class="napisto" style="margin-top:8px"><button type="button" class="ensisijainen" id="jatka">Jatka testiä</button></div></div>`;
    $("jatka").addEventListener("click", () => naytaKysymys());
  } else {
    $("kesken").innerHTML = "";
  }
  const lkm = new Map();
  for (const a of pooli.autot) {
    const m = a.auto.merkki;
    if (!lkm.has(m)) lkm.set(m, { yleinen: 0, harvinainen: 0, erittain: 0, yht: 0 });
    const o = lkm.get(m);
    o[a.luokka]++; o.yht++;
  }
  const merkit = [...lkm.entries()].sort((x, y) => y[1].yht - x[1].yht || (x[0] < y[0] ? -1 : 1));
  $("merkit").innerHTML = merkit.map(([m, o]) =>
    `<button type="button" data-m="${esc(m)}" class="${valitut.has(m) ? "valittu" : ""}" title="${o.yleinen} yleistä, ${o.harvinainen} harvinaista, ${o.erittain} erittäin harvinaista">${esc(m)} (${o.yht})</button>`).join("");
  $("merkit").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.m;
    if (valitut.has(m)) valitut.delete(m); else valitut.add(m);
    b.classList.toggle("valittu", valitut.has(m));
    paivitaValinta();
  }));
  paivitaValinta();
  $("aloita").onclick = () => {
    if (kesken && !confirm("Aloitetaanko uusi testi? Kesken jäänyt testi poistetaan.")) return;
    aloita();
  };
}

function paivitaValinta() {
  const lk = { yleinen: 0, harvinainen: 0, erittain: 0 };
  for (const a of pooli.autot) if (valitut.has(a.auto.merkki)) lk[a.luokka]++;
  const yht = lk.yleinen + lk.harvinainen + lk.erittain;
  let teksti = "Valitse yksi tai useampi merkki.";
  if (valitut.size) {
    teksti = `Valituista merkeistä on tarjolla ${lk.yleinen} yleistä, ${lk.harvinainen} harvinaista ja ${lk.erittain} erittäin harvinaista autoa.`;
    if (yht < AUTOJA) teksti += ` Valitse lisää merkkejä: testiin tarvitaan ${AUTOJA} autoa.`;
    else if (Math.min(lk.yleinen, lk.harvinainen, lk.erittain) < PER_LUOKKA) teksti += " Vajaa luokka täydennetään muilla saman merkin autoilla.";
  }
  $("valintaTila").textContent = teksti;
  $("aloita").disabled = yht < AUTOJA;
}

/** 10 autoa kustakin harvinaisuusluokasta, merkit vuorotellen; vajaa luokka täydennetään muista. */
function valitseAutot(merkit) {
  let s = (Date.now() % 2147483646) + 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const sekoita = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  const poimi = (lista, n) => {
    const perMerkki = new Map();
    for (const a of sekoita(lista.slice())) {
      if (!perMerkki.has(a.auto.merkki)) perMerkki.set(a.auto.merkki, []);
      perMerkki.get(a.auto.merkki).push(a);
    }
    const jono = sekoita([...perMerkki.keys()]);
    const tulos = [];
    while (tulos.length < n && jono.some((m) => perMerkki.get(m).length)) {
      for (const m of jono) {
        const l = perMerkki.get(m);
        if (l.length) tulos.push(l.shift());
        if (tulos.length >= n) break;
      }
    }
    return tulos;
  };
  const ehdokkaat = pooli.autot.filter((a) => merkit.has(a.auto.merkki));
  const valitut = [];
  for (const luokka of Object.keys(LUOKKA_NIMET)) valitut.push(...poimi(ehdokkaat.filter((a) => a.luokka === luokka), PER_LUOKKA));
  if (valitut.length < AUTOJA) {
    const kaytetyt = new Set(valitut.map((a) => a.id));
    valitut.push(...poimi(ehdokkaat.filter((a) => !kaytetyt.has(a.id)), AUTOJA - valitut.length));
  }
  return sekoita(valitut).slice(0, AUTOJA);
}

function aloita() {
  const autot = valitseAutot(valitut);
  tila = {
    tyyppi: "autoveroarvio-arviointitesti", versio: 1,
    id: Math.floor(Math.random() * 0xffffffff).toString(36), aloitettu: new Date().toISOString(), valmis: null,
    kauppias: kauppiasTunnus(), merkit: [...valitut].sort(),
    pooli: { luotu: pooli.luotu, jakso: pooli.jakso, laskurinVersio: pooli.laskurinVersio, hintatasoKuukausi: pooli.hintatasoKuukausi || null },
    autot, vastaukset: autot.map(() => null), kohta: 0,
  };
  tallennaTila();
  naytaKysymys();
}

// ---------- kysymykset ----------

function ikaTeksti(ensirek, verotettu) {
  const e = new Date(ensirek), v = new Date(verotettu);
  let kuukausia = (v.getUTCFullYear() - e.getUTCFullYear()) * 12 + (v.getUTCMonth() - e.getUTCMonth());
  if (v.getUTCDate() < e.getUTCDate()) kuukausia--;
  kuukausia = Math.max(0, kuukausia);
  const vuodet = Math.floor(kuukausia / 12), kk2 = kuukausia % 12;
  return `${vuodet} v${kk2 ? ` ${kk2} kk` : ""}`;
}

function autonTiedot(a) {
  const t = a.auto;
  const rivit = [
    ["Teho", `${Math.round(t.kw)} kW`],
    ["Käyttövoima", t.kayttovoima],
    t.vaihteisto === "AUT" ? ["Vaihteisto", "Automaatti"] : t.vaihteisto === "" ? ["Vaihteisto", "Käsivalinta"] : null,
    t.korimalli ? ["Korimalli", t.korimalli] : null,
    t.vetotapa ? ["Vetotapa", t.vetotapa] : null,
    t.cm3 > 0 ? ["Iskutilavuus", `${Math.round(t.cm3).toLocaleString("fi-FI")} cm³`] : null,
    t.ovet > 0 ? ["Ovet", String(t.ovet)] : null,
    ["Ensirekisteröinti", kk(Date.parse(t.ensirek))],
    ["Ajokilometrit", `${Math.round(t.km).toLocaleString("fi-FI")} km`],
    ["Verotettu", kk(Date.parse(a.verotettu))],
    ["Ikä verotettaessa", ikaTeksti(t.ensirek, a.verotettu)],
    ["Veroprosentti", pros(a.veroprosentti)],
  ].filter(Boolean);
  return `<h3>${esc(t.merkki)} ${esc(t.malli)}</h3>
    <div class="tiedot">${rivit.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("")}</div>
    <p class="pieni">Arvioi nykyhinnoin, paljonko autoveroa tällaisesta autosta määrättäisiin, kun ikä ja ajokilometrit ovat
      kuten verotettaessa. Laskurin arvion ja toteutuneen veron näet testin lopussa.</p>`;
}

function naytaKysymys() {
  nayta("kysymys");
  const i = tila.kohta, n = tila.autot.length, a = tila.autot[i], v = tila.vastaukset[i] || {};
  $("edistysTeksti").textContent = `Auto ${i + 1} / ${n}`;
  $("edistysPalkki").style.width = `${(tila.vastaukset.filter(Boolean).length / n) * 100}%`;
  $("auto").innerHTML = autonTiedot(a);
  $("vero").value = v.vero ? String(v.vero) : "";
  $("huomio").value = v.huomio || "";
  varmuus = v.varmuus || null;
  $("varmuus").querySelectorAll("button").forEach((b) => b.classList.toggle("valittu", b.dataset.v === varmuus));
  $("kysymysVirhe").innerHTML = "";
  $("edellinen").disabled = i === 0;
  $("seuraava").textContent = i === n - 1 ? "Valmis →" : "Seuraava →";
  paivitaVastaa();
  aikaAlku = Date.now();
  try { $("vero").focus(); } catch { /* ei kohdistusta */ }
}

function paivitaVastaa() {
  const a = tila.autot[tila.kohta];
  const vero = luku($("vero").value);
  if (!(vero > 0)) { $("vastaa").innerHTML = "&nbsp;"; return; }
  const arvo = vero / (a.veroprosentti / 100);
  const outo = arvo < 1000 || arvo > 500000;
  $("vastaa").innerHTML = `Vastaa verotusarvoa ${euro(arvo)}.` + (outo ? ` <strong>Tarkista luku.</strong>` : "");
}

function tallennaVastaus(ohita) {
  const i = tila.kohta;
  const vero = luku($("vero").value);
  if (!ohita && !(vero > 0)) {
    $("kysymysVirhe").innerHTML = `<div class="virhe">Syötä arvioimasi autovero euroina tai valitse "En osaa arvioida".</div>`;
    return false;
  }
  const vanha = tila.vastaukset[i] || {};
  tila.vastaukset[i] = {
    vero: ohita ? null : Math.round(vero), ohitettu: Boolean(ohita), varmuus: ohita ? null : varmuus,
    huomio: $("huomio").value.trim() || null,
    aikaSekuntia: Math.round((vanha.aikaSekuntia || 0) + (Date.now() - aikaAlku) / 1000),
  };
  tallennaTila();
  return true;
}

function eteenpain(ohita) {
  if (!tallennaVastaus(ohita)) return;
  if (tila.kohta < tila.autot.length - 1) { tila.kohta++; tallennaTila(); naytaKysymys(); return; }
  const puuttuu = tila.vastaukset.findIndex((v) => !v);
  if (puuttuu >= 0) { tila.kohta = puuttuu; tallennaTila(); naytaKysymys(); return; }
  tila.valmis = new Date().toISOString();
  tallennaTila();
  naytaTulos();
}

// ---------- tulokset ja raportti ----------

function teeRaportti() {
  return {
    tyyppi: "autoveroarvio-arviointitesti", versio: 1,
    testi: { id: tila.id, aloitettu: tila.aloitettu, valmis: tila.valmis, kauppias: tila.kauppias, merkit: tila.merkit, pooli: tila.pooli },
    autot: tila.autot.map((a, i) => ({
      nro: i + 1, id: a.id, luokka: a.luokka, tuki: a.tuki, auto: a.auto, verotettu: a.verotettu, veroprosentti: a.veroprosentti,
      vastaus: tila.vastaukset[i], laskuri: a.laskuri, toteutunut: a.toteutunut, nykyhinta: a.nykyhinta || { kerroin: 1 },
    })),
  };
}

function lataaTiedosto(nimi, teksti, tyyppi) {
  const url = URL.createObjectURL(new Blob([teksti], { type: tyyppi }));
  const l = document.createElement("a");
  l.href = url; l.download = nimi;
  document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const virhe = (x) => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round((Math.exp(x) - 1) * 100))} %`);

function naytaTulos() {
  nayta("tulos");
  const raportti = teeRaportti();
  const an = analysoiTesti(raportti);
  const Y = an.yhteensa;
  const harha = Y.kauppiaanHarhaPros;
  const hk = tila.pooli && tila.pooli.hintatasoKuukausi;
  const hintatasoKk = hk ? `${Number(hk.slice(5, 7))}/${hk.slice(0, 4)}` : null;
  const prosMuutos = (k) => `${k >= 1 ? "+" : "−"}${Math.abs((k - 1) * 100).toFixed(1).replace(".", ",")} %`;
  const muutosVali = an.nykyhinta.kerroinPienin === an.nykyhinta.kerroinSuurin
    ? prosMuutos(an.nykyhinta.kerroinPienin) : `${prosMuutos(an.nykyhinta.kerroinPienin)} … ${prosMuutos(an.nykyhinta.kerroinSuurin)}`;
  const luokkaRivit = Object.entries(LUOKKA_NIMET).map(([l, nimi]) => {
    const o = an.luokittain[l];
    return o.n ? `<tr><td>${nimi}</td><td class="oikea">${o.n}</td><td class="oikea">${pros(o.kauppiaanMediaaniVirhePros)}</td>
      <td class="oikea">${pros(o.laskurinMediaaniVirhePros)}</td><td class="oikea">${o.kauppiasLahempana} / ${o.n}</td></tr>` : "";
  }).join("");
  const varmuusRivit = Object.entries(VARMUUS_NIMET).map(([v, nimi]) => {
    const o = an.varmuuksittain[v];
    return o.n ? `<tr><td>${nimi}</td><td class="oikea">${o.n}</td><td class="oikea">${pros(o.kauppiaanMediaaniVirhePros)}</td></tr>` : "";
  }).join("");
  const autoRivit = an.rivit.map((r) => {
    const v = r.vastaus || {};
    const lahempana = r.eK !== null && Math.abs(r.eK) < Math.abs(r.eL);
    const vero = (arvo) => (arvo * r.veroprosentti) / 100;
    return `<tr>
      <td>${r.nro}</td>
      <td>${esc(r.auto.merkki)} ${esc(r.auto.malli)}<br><span class="pieni">${Math.round(r.auto.kw)} kW · ${esc(r.auto.ensirek.slice(0, 4))} ·
        ${Math.round(r.auto.km / 1000)} tkm · ${esc(LUOKKA_NIMET[r.luokka].toLowerCase())}</span></td>
      <td class="oikea ${lahempana ? "voitto" : ""}">${v.vero ? euro(v.vero) : "ohitettu"}</td>
      <td class="oikea">${euro(vero(r.laskuri.arvo * r.kerroin))}</td>
      <td class="oikea"><strong>${euro(vero(r.toteutunutNyt))}</strong></td>
      <td class="oikea ${lahempana ? "voitto" : ""}">${virhe(r.eK)}</td>
      <td class="oikea">${virhe(r.eL)}</td>
    </tr>`;
  }).join("");
  $("tulos").innerHTML = `
    <div class="kortti">
      <h2>Tulokset</h2>
      <div class="isot">
        <div class="luku kauppias"><div class="otsake">Osuit laskuria lähemmäs</div><div class="arvo">${Y.kauppiasLahempana} / ${Y.n}</div>
          <div class="alla">${an.ohitettu ? `${an.ohitettu} autoa ohitettu` : "kaikki autot arvioitu"}</div></div>
        <div class="luku"><div class="otsake">Sinun mediaanivirheesi</div><div class="arvo">${pros(Y.kauppiaanMediaaniVirhePros)}</div>
          <div class="alla">verotusarvosta</div></div>
        <div class="luku"><div class="otsake">Laskurin mediaanivirhe</div><div class="arvo">${pros(Y.laskurinMediaaniVirhePros)}</div>
          <div class="alla">samoissa autoissa</div></div>
      </div>
      <p>${harha == null ? "" : Math.abs(harha) < 2 ? "Arviosi eivät olleet järjestelmällisesti liian korkeita tai matalia." :
        `Arviosi olivat tyypillisesti ${Math.abs(harha).toLocaleString("fi-FI")} % toteutunutta ${harha < 0 ? "matalampia" : "korkeampia"}.`}
        Virhe on laskettu verotusarvosta, joten veroprosentti ei vaikuta siihen, ja toteutunut vero on muutettu
        nykyhintoihin, koska arvioit nykyhinnoin.</p>
      <div class="taulukko"><table>
        <thead><tr><th>Luokka</th><th class="oikea">Arvioitu</th><th class="oikea">Sinä</th><th class="oikea">Laskuri</th><th class="oikea">Osuit lähemmäs</th></tr></thead>
        <tbody>${luokkaRivit}</tbody></table></div>
      ${varmuusRivit ? `<div class="taulukko" style="margin-top:12px"><table>
        <thead><tr><th>Varmuus</th><th class="oikea">Arvioitu</th><th class="oikea">Mediaanivirheesi</th></tr></thead>
        <tbody>${varmuusRivit}</tbody></table></div>` : ""}
      <p class="pieni" style="margin-top:12px">Lähetä raportti laskurin ylläpitäjälle. Raportti analysoidaan, ja sen perusteella
        laskuri säätää, kuinka paljon arvioitasi painotetaan koulutustilassa ja korjataanko niistä järjestelmällinen ero.</p>
      <div class="napisto">
        <button type="button" class="ensisijainen" id="lataaJson">Lataa raportti</button>
        <button type="button" class="toissijainen" id="lataaCsv">Lataa taulukkona (CSV)</button>
        <span class="vali"></span>
        <button type="button" class="toissijainen" id="uusi">Aloita uusi testi</button>
      </div>
    </div>
    <div class="kortti">
      <h2>Autot</h2>
      <div class="taulukko"><table>
        <thead><tr><th>#</th><th>Auto</th><th class="oikea">Sinä</th><th class="oikea">Laskuri</th><th class="oikea">Toteutunut nykyhinnoin</th>
        <th class="oikea">Sinun virhe</th><th class="oikea">Laskurin virhe</th></tr></thead>
        <tbody>${autoRivit}</tbody></table></div>
      <p class="pieni">Autoverot laskettu kunkin auton veroprosentilla. Laskurin arvio ja toteutunut vero on muutettu
        nykyiseen hintatasoon${hintatasoKk ? ` (${hintatasoKk})` : ""} Verohallinnon päätösten hintaindeksillä; muutos oli
        ${muutosVali}. Korostettu: osuit laskuria lähemmäs.</p>
    </div>`;
  const nimi = `arviointitesti-${tila.kauppias}-${tila.valmis.slice(0, 10)}`;
  $("lataaJson").addEventListener("click", () => {
    const { rivit, ...yhteenveto } = an;
    lataaTiedosto(`${nimi}.json`, JSON.stringify({ ...raportti, yhteenveto, ohjeTekoalylle: OHJE_TEKOALYLLE }, null, 1), "application/json");
  });
  $("lataaCsv").addEventListener("click", () => lataaTiedosto(`${nimi}.csv`, csv(an.rivit), "text/csv"));
  $("uusi").addEventListener("click", () => {
    if (!confirm("Aloitetaanko uusi testi? Tämän testin tulokset poistetaan tästä selaimesta (lataa raportti ensin).")) return;
    tila = null;
    tallennaTila();
    naytaAlku();
  });
}

function csv(rivit) {
  const d = (x, desim = 0) => (x == null || !Number.isFinite(x) ? "" : x.toFixed(desim).replace(".", ","));
  const p = (x) => (x == null ? "" : d((Math.exp(x) - 1) * 100, 1));
  const otsikot = ["nro", "luokka", "merkki", "malli", "kw", "kayttovoima", "ensirek", "km", "verotettu", "veroprosentti",
    "kauppiaan_vero", "varmuus", "laskurin_vero", "toteutunut_vero", "nykyhintakerroin", "toteutunut_vero_nykyhinnoin",
    "kauppiaan_virhe_pros", "kauppiaan_virhe_verotushetken_hinnoin_pros", "laskurin_virhe_pros", "huomio"];
  const rivi = (r) => {
    const v = r.vastaus || {};
    const vero = (arvo) => (arvo * r.veroprosentti) / 100;
    return [r.nro, r.luokka, r.auto.merkki, r.auto.malli, d(r.auto.kw), r.auto.kayttovoima, r.auto.ensirek, d(r.auto.km),
      r.verotettu, d(r.veroprosentti, 1), v.vero ?? "", v.varmuus ?? "", d(vero(r.laskuri.arvo)), d(vero(r.toteutunut.arvo)),
      d(r.kerroin, 4), d(vero(r.toteutunutNyt)), p(r.eK), p(r.eKverotushetki), p(r.eL), (v.huomio || "").replace(/[;\n\r]/g, " ")].join(";");
  };
  return "﻿" + [otsikot.join(";"), ...rivit.map(rivi)].join("\r\n");
}

// ---------- tapahtumat ----------

$("vero").addEventListener("input", paivitaVastaa);
$("vero").addEventListener("keydown", (e) => { if (e.key === "Enter") eteenpain(false); });
$("seuraava").addEventListener("click", () => eteenpain(false));
$("ohita").addEventListener("click", () => eteenpain(true));
$("edellinen").addEventListener("click", () => {
  if (luku($("vero").value) > 0) tallennaVastaus(false);
  if (tila.kohta > 0) { tila.kohta--; tallennaTila(); naytaKysymys(); }
});
$("varmuus").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  varmuus = varmuus === b.dataset.v ? null : b.dataset.v;
  $("varmuus").querySelectorAll("button").forEach((x) => x.classList.toggle("valittu", x.dataset.v === varmuus));
}));

lataa();
