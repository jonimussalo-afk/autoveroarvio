// Arviointitestin raporttien analyysi ja kalibrointiehdotus.
//
// Käyttö:
//   node tyokalut/analysoi_testi.mjs raportti1.json [raportti2.json ...]              tulostaa analyysin
//   node tyokalut/analysoi_testi.mjs raportti.json --kirjoita                           päivittää data/kalibrointi.json
//
// Saman kauppiaan (sama kauppiastunnus) raportit yhdistetään. Kalibrointi kirjoitetaan vain, jos vastauksia on
// riittävästi (vähintään 15, joista 8 harvinaisia). Kun tiedosto data/kalibrointi.json muuttuu GitHubissa,
// päivitys käynnistyy ja laskuri alkaa käyttää uutta harhaa ja painoa koulutustilan arvioissa.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analysoiTesti, LUOKKA_NIMET, VARMUUS_NIMET } from "../js/testianalyysi.js";

const juuri = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const kirjoita = args.includes("--kirjoita");
const tiedostot = args.filter((a) => !a.startsWith("--"));
if (!tiedostot.length) {
  console.log("Käyttö: node tyokalut/analysoi_testi.mjs raportti.json [...] [--kirjoita]");
  process.exit(1);
}

// Raportit kauppiaittain
const kauppiaittain = new Map();
for (const f of tiedostot) {
  const r = JSON.parse(readFileSync(f, "utf8"));
  if (r.tyyppi !== "autoveroarvio-arviointitesti") { console.warn(`Ohitetaan ${f}: ei arviointitestin raportti`); continue; }
  const k = r.testi.kauppias || "?";
  if (!kauppiaittain.has(k)) kauppiaittain.set(k, { testi: { ...r.testi, kauppias: k }, autot: [], tiedostot: [] });
  const o = kauppiaittain.get(k);
  o.autot.push(...r.autot);
  o.tiedostot.push(f);
}

const p = (x) => (x == null ? "–" : `${x.toLocaleString("fi-FI")} %`);
const kalPolku = join(juuri, "data", "kalibrointi.json");
const kalibrointi = existsSync(kalPolku) ? JSON.parse(readFileSync(kalPolku, "utf8")) : { kauppiaat: {} };
kalibrointi.kauppiaat ||= {};

for (const [kauppias, raportti] of kauppiaittain) {
  const an = analysoiTesti(raportti);
  const Y = an.yhteensa;
  console.log(`\n## Kauppias ${kauppias}\n`);
  console.log(`Raportit: ${raportti.tiedostot.join(", ")}. Merkit: ${(raportti.testi.merkit || []).join(", ")}.`);
  console.log(`Vastattu ${an.vastattu}, ohitettu ${an.ohitettu}. Kauppias osui laskuria lähemmäs ${Y.kauppiasLahempana} / ${Y.n} ` +
    `(merkkitesti p = ${Y.merkkitesti}).`);
  const nh = an.nykyhinta;
  console.log(`Kauppiaan arviota verrataan nykyhintaiseen toteutuneeseen (kerroin ${nh.kerroinPienin}–${nh.kerroinSuurin}). ` +
    `Ilman korjausta kauppiaan mediaanivirhe olisi ${p(nh.ilmanKorjaustaMediaaniVirhePros)} ja harha ${p(nh.ilmanKorjaustaHarhaPros)}.\n`);
  console.log("| Ryhmä | n | Kauppiaan mediaanivirhe | Laskurin mediaanivirhe | Kauppiaan harha | Kauppias lähempänä |");
  console.log("|---|---:|---:|---:|---:|---:|");
  const rivi = (nimi, o) => console.log(`| ${nimi} | ${o.n} | ${p(o.kauppiaanMediaaniVirhePros)} | ${p(o.laskurinMediaaniVirhePros)} | ` +
    `${p(o.kauppiaanHarhaPros)} | ${o.kauppiasLahempana} |`);
  rivi("Kaikki", Y);
  for (const [l, nimi] of Object.entries(LUOKKA_NIMET)) if (an.luokittain[l].n) rivi(nimi, an.luokittain[l]);
  for (const [v, nimi] of Object.entries(VARMUUS_NIMET)) if (an.varmuuksittain[v].n) rivi(`Varmuus: ${nimi}`, an.varmuuksittain[v]);
  const pk = an.painotus.kaikki, ph = an.painotus.harvinaiset;
  console.log(`\nParas painotus (harha korjattuna): kaikki ${Math.round((pk.w ?? 0) * 100)} % kauppiasta (mediaanivirhe ${p(pk.mediaaniVirhePros)}), ` +
    `harvinaiset ${Math.round((ph.w ?? 0) * 100)} % (mediaanivirhe ${p(ph.mediaaniVirhePros)}).`);
  // Suurimmat poikkeamat
  const suurimmat = an.rivit.filter((r) => r.eK !== null).sort((a, b) => Math.abs(b.eK) - Math.abs(a.eK)).slice(0, 5);
  console.log("\nSuurimmat kauppiaan poikkeamat:");
  for (const r of suurimmat) {
    console.log(`- ${r.auto.merkki} ${r.auto.malli} ${r.auto.kw} kW ${r.auto.ensirek.slice(0, 4)}: kauppias ${Math.round((Math.exp(r.eK) - 1) * 100)} %, ` +
      `laskuri ${Math.round((Math.exp(r.eL) - 1) * 100)} %${r.vastaus && r.vastaus.huomio ? ` – huomio: ${r.vastaus.huomio}` : ""}`);
  }
  console.log(`\nKalibrointiehdotus: ${an.kalibrointi.perustelu}`);
  console.log(JSON.stringify({ [kauppias]: { harha: an.kalibrointi.harha, paino: an.kalibrointi.paino } }));
  if (kirjoita && an.kalibrointi.riittava) {
    kalibrointi.kauppiaat[kauppias] = {
      harha: an.kalibrointi.harha, paino: an.kalibrointi.paino,
      testi: { pvm: (raportti.testi.valmis || "").slice(0, 10), vastattu: an.vastattu,
        kauppiaanMediaaniVirhePros: Y.kauppiaanMediaaniVirhePros, laskurinMediaaniVirhePros: Y.laskurinMediaaniVirhePros },
    };
  }
}

if (kirjoita) {
  kalibrointi.paivitetty = new Date().toISOString().slice(0, 10);
  writeFileSync(kalPolku, JSON.stringify(kalibrointi, null, 1) + "\n");
  console.log(`\nKirjoitettu ${kalPolku}`);
}
