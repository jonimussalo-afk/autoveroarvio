// Mittaa, kuinka pitkä päätöshistoria antaa parhaan tarkkuuden.
// Malli opetetaan eri pituisilla historioilla ja sillä ennustetaan samat viimeisten kolmen kuukauden päätökset.
// Harvinaisuusluokka lasketaan kaikille samalla tavalla (viimeisten 24 kuukauden päätöksistä), jotta tulokset ovat vertailukelpoisia.
// Käyttö: node tyokalut/vertaa_historiaa.mjs [vuodet, esim. 2,4,6,8,10]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { yhdistaAineisto, osajoukko, ajallinenTesti, ASETUKSET } from "../js/malli.js";

const juuri = join(dirname(fileURLToPath(import.meta.url)), "..");
const hakemisto = JSON.parse(readFileSync(join(juuri, "data", "hakemisto.json"), "utf8"));
const aineisto = yhdistaAineisto(hakemisto.tiedostot.map((t) => JSON.parse(readFileSync(join(juuri, "data", t), "utf8"))));
const v = Math.floor(aineisto.viimeisinPaatos / 10000), k = Math.floor(aineisto.viimeisinPaatos / 100) % 100;
const raja = Date.UTC(v, k - 3, 1);
const luokittelu = osajoukko(aineisto, (r) => aineisto.A.paatos[r] < raja && aineisto.A.paatos[r] >= Date.UTC(v, k - 27, 1));
const vuodet = (process.argv[2] || "2,4,6,8,10").split(",").map(Number);
const puoliintumiset = (process.argv[3] || String(ASETUKSET.puoliintumisKk)).split(",").map(Number);
console.log(`Aineisto ${aineisto.n} päätöstä, testataan ${new Date(raja).toISOString().slice(0, 10)} alkaen tehdyt päätökset`);
for (const pk of puoliintumiset) {
  ASETUKSET.puoliintumisKk = pk;
  for (const vv of vuodet) {
    const alku = Date.UTC(v, k - 3 - 12 * vv, 1);
    const t0 = Date.now();
    const t = ajallinenTesti(aineisto, raja, { historiaAlku: alku, luokittelu });
    const f = (l) => `${l.mediaaniVirhePros} % / ${l.alle10Pros} % / ${l.valinOsuma} %`;
    console.log(`${vv} v (alk. ${new Date(alku).toISOString().slice(0, 7)}), puoliintuminen ${pk} kk: ` +
      `yleinen ${f(t.yleinen)} | harvinainen ${f(t.harvinainen)} | erittäin ${f(t.erittain)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
console.log("Sarakkeet: mediaanivirhe / alle 10 % virhe / 80 %:n välin osuma");
