// Laskurisivun ja koulutustilan yhteiset apufunktiot: lukujen muotoilu ja merkkien nimet.

export const euro = (x) => (x == null || !Number.isFinite(x) ? "–" : Math.round(x).toLocaleString("fi-FI") + " €");
export const pros = (x, d = 1) => (x == null || !Number.isFinite(x) ? "–"
  : x.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d }) + " %");
export const kk = (ms) => { const d = new Date(ms); return `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`; };
export const pvm = (ms) => { const d = new Date(ms); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`; };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const paatosta = (n) => `${n.toLocaleString("fi-FI")} ${n === 1 ? "päätös" : "päätöstä"}`;
/** Logaritminen ero prosentteina etumerkin kanssa, esim. +12 % tai −5 %. */
export const muutos = (x) => { const p = (Math.exp(x) - 1) * 100; return (p >= 0 ? "+" : "−") + Math.abs(Math.round(p)) + " %"; };

export const MERKKI_ALIAKSET = {
  MERCEDES: "MERCEDES-BENZ", "MERCEDES BENZ": "MERCEDES-BENZ", MB: "MERCEDES-BENZ", VW: "VOLKSWAGEN",
  "ROLLS ROYCE": "ROLLS-ROYCE", LANDROVER: "LAND ROVER", ALFA: "ALFA ROMEO", ASTON: "ASTON MARTIN",
};
export function yhtenaistaMerkki(s) {
  const t = String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
  return MERKKI_ALIAKSET[t] || t;
}

/** Luku tekstikentästä (hyväksyy välilyönnit ja pilkun). Palauttaa null, jos kenttä on tyhjä tai virheellinen. */
export function luku(teksti) {
  const t = String(teksti ?? "").replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
