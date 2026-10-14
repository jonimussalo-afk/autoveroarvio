#!/usr/bin/env python3
"""
Hakee Verohallinnon "Taulukoita ajoneuvojen sovelletuista verotusarvoista" -sivulta
henkilöautojen Excel-tiedostot ja muuntaa ne tiiviiksi JSON-tiedostoiksi data/-kansioon.

Käyttö:
    python tyokalut/hae_aineisto.py                 # hakee verkosta (oletus 3 viimeisintä vuotta)
    python tyokalut/hae_aineisto.py --vuosia 4      # hakee 4 viimeisintä vuotta
    python tyokalut/hae_aineisto.py --vain-paikalliset   # käsittelee vain data/raaka/-kansion tiedostot

Jos verkkohaku epäonnistuu, voit ladata Excelit käsin vero.fi:stä ja tallentaa ne
kansioon data/raaka/. Skripti käsittelee ne automaattisesti.
"""

import argparse
import datetime as dt
import html
import json
import pathlib
import re
import sys
import tempfile
import urllib.parse
import urllib.request

SIVU = ("https://vero.fi/henkiloasiakkaat/omaisuus/autovero/autoveron-maara/"
        "ajoneuvojen-sovellettuja-verotusarvoja/")
JUURI = pathlib.Path(__file__).resolve().parent.parent
DATA = JUURI / "data"
RAAKA = DATA / "raaka"
SELAIN = "Mozilla/5.0 (autoveroarvio; kuukausittainen aineistohaku)"

# Merkkien kirjoitusasujen yhtenäistäminen. Avain: pelkät kirjaimet ja numerot isoilla.
MERKKI_ALIAKSET = {
    "MERCEDESBENZ": "MERCEDES-BENZ", "MERCEDES": "MERCEDES-BENZ", "MERCEDEZBENZ": "MERCEDES-BENZ",
    "MERCEDESBENTZ": "MERCEDES-BENZ", "MB": "MERCEDES-BENZ",
    "VW": "VOLKSWAGEN", "VOLKSWAGENVW": "VOLKSWAGEN",
    "ROLLSROYCE": "ROLLS-ROYCE", "ALFAROME0": "ALFA ROMEO", "ALFAROMEO": "ALFA ROMEO",
    "LANDROVER": "LAND ROVER", "ASTONMARTIN": "ASTON MARTIN", "CITROËN": "CITROEN",
    "SKODA": "SKODA", "ŠKODA": "SKODA", "DSAUTOMOBILES": "DS",
}

# Sarakeotsikoiden tunnistus (otsikko pieniksi kirjaimiksi ilman välilyöntejä).
SARAKKEET = {
    "merkki": ["merkki"],
    "malli": ["malli"],
    "cm3": ["cm3", "iskutilavuus"],
    "kayttovoima": ["käyttövoima", "kayttovoima"],
    "korimalli": ["korimalli"],
    "vetotapa": ["vetotapa"],
    "vaihteisto": ["vaihteisto"],
    "kw": ["kw", "teho"],
    "ovet": ["ovienlkm", "ovet", "ovienlukumäärä"],
    "massa": ["kokonaismassa"],  # vain pakettiautotaulukoissa; käytetään tunnistamiseen
    "paatos": ["päätöspäivä", "paatospaiva"],
    "ensirek": ["ensirekisteröintipäivä", "ensirekisterointipaiva", "käyttöönottopäivä"],
    "km": ["ajokm/1000", "ajokm", "ajokilometrit"],
    "arvo": ["verotusarvo"],
    "veropros": ["veroprosentti"],
}


def avain(teksti):
    return re.sub(r"[^0-9A-ZÅÄÖÉËŠ]", "", str(teksti).upper())


def yhtenaista_merkki(raaka, tunnetut):
    teksti = re.sub(r"\s+", " ", str(raaka).strip().upper()).replace("_", "-")
    k = avain(teksti)
    if k in MERKKI_ALIAKSET:
        return MERKKI_ALIAKSET[k]
    if k in tunnetut:
        return tunnetut[k]
    # "MERCEDES-BENZ E300TD" -> MERCEDES-BENZ: pisin tunnettu merkki, jolla teksti alkaa
    for tk in sorted(tunnetut, key=len, reverse=True):
        if len(tk) >= 3 and k.startswith(tk):
            return tunnetut[tk]
    for ak, arvo in MERKKI_ALIAKSET.items():
        if len(ak) >= 5 and k.startswith(ak):
            return arvo
    return teksti


def yhtenaista_malli(raaka):
    teksti = re.sub(r"\s+", " ", str(raaka).strip().upper())
    return teksti.strip(" .,-/")


def lue_paivamaara(arvo, datemode=0):
    """Palauttaa kokonaisluvun muodossa VVVVKKPP tai None."""
    if arvo is None or arvo == "":
        return None
    if isinstance(arvo, (dt.date, dt.datetime)):
        return arvo.year * 10000 + arvo.month * 100 + arvo.day
    if isinstance(arvo, float) or isinstance(arvo, int):
        luku = int(arvo)
        if 19000101 <= luku <= 21001231:
            return luku
        if 1 <= luku < 80000:  # Excelin päivänumero
            pvm = dt.date(1899, 12, 30) + dt.timedelta(days=luku)
            return pvm.year * 10000 + pvm.month * 100 + pvm.day
        return None
    s = str(arvo).strip()
    if re.fullmatch(r"\d{8}", s):
        return int(s)
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s)
    if m:
        return int(m.group(3)) * 10000 + int(m.group(2)) * 100 + int(m.group(1))
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2}).*", s)
    if m:
        return int(m.group(1)) * 10000 + int(m.group(2)) * 100 + int(m.group(3))
    return None


def lue_luku(arvo):
    if arvo is None or arvo == "":
        return None
    if isinstance(arvo, (int, float)):
        return float(arvo)
    s = str(arvo).replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def lue_tyokirja(polku):
    """Palauttaa listan välilehtiä: [(nimi, [[solut], ...]), ...]."""
    polku = pathlib.Path(polku)
    if polku.suffix.lower() == ".xlsx":
        import openpyxl
        wb = openpyxl.load_workbook(polku, read_only=True, data_only=True)
        return [(ws.title, [list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets]
    import xlrd
    wb = xlrd.open_workbook(str(polku))
    tulos = []
    for sh in wb.sheets():
        rivit = []
        for r in range(sh.nrows):
            rivi = []
            for c in range(sh.ncols):
                solu = sh.cell(r, c)
                if solu.ctype == xlrd.XL_CELL_DATE:
                    rivi.append(xlrd.xldate_as_datetime(solu.value, wb.datemode))
                else:
                    rivi.append(solu.value)
            rivit.append(rivi)
        tulos.append((sh.name, rivit))
    return tulos


def etsi_sarakkeet(otsikko):
    norm = [re.sub(r"\s+", "", str(o).strip().lower()) for o in otsikko]
    kartta = {}
    for nimi, vaihtoehdot in SARAKKEET.items():
        for i, o in enumerate(norm):
            if o in vaihtoehdot:
                kartta[nimi] = i
                break
    return kartta


def muunna_tiedosto(polku):
    """Lukee yhden Verohallinnon Excelin ja palauttaa (rivit, tilasto)."""
    rivit, ohitetut, valilehdet = [], 0, 0
    luokka = "henkilo"
    for nimi, solut in lue_tyokirja(polku):
        otsikkorivi = None
        for i, rivi in enumerate(solut[:20]):
            norm = {re.sub(r"\s+", "", str(x).strip().lower()) for x in rivi}
            if "merkki" in norm and "verotusarvo" in norm:
                otsikkorivi = i
                break
        if otsikkorivi is None:
            continue
        kartta = etsi_sarakkeet(solut[otsikkorivi])
        if "massa" in kartta:
            luokka = "paketti"  # pakettiautotaulukoissa on kokonaismassa, henkilöautotaulukoissa ei
        pakolliset = {"merkki", "malli", "kw", "paatos", "ensirek", "km", "arvo"}
        if not pakolliset.issubset(kartta):
            puuttuu = pakolliset - set(kartta)
            print(f"  VAROITUS: välilehdeltä '{nimi}' puuttuu sarakkeita: {puuttuu}", file=sys.stderr)
            continue
        valilehdet += 1
        for rivi in solut[otsikkorivi + 1:]:
            def s(k):
                i = kartta.get(k)
                return rivi[i] if i is not None and i < len(rivi) else None
            merkki, malli = s("merkki"), s("malli")
            arvo, kw, km = lue_luku(s("arvo")), lue_luku(s("kw")), lue_luku(s("km"))
            paatos, ensirek = lue_paivamaara(s("paatos")), lue_paivamaara(s("ensirek"))
            if not merkki or not malli or arvo is None or arvo <= 1 or not paatos or not ensirek \
                    or kw is None or kw <= 0 or ensirek > paatos:
                ohitetut += 1
                continue
            rivit.append({
                "merkki": str(merkki), "malli": yhtenaista_malli(malli),
                "kayttovoima": str(s("kayttovoima") or "").strip(),
                "korimalli": str(s("korimalli") or "").strip(),
                "vetotapa": str(s("vetotapa") or "").strip(),
                "vaihteisto": str(s("vaihteisto") or "").strip(),
                "kw": int(round(kw)), "cm3": int(round(lue_luku(s("cm3")) or 0)),
                "ovet": int(round(lue_luku(s("ovet")) or 0)),
                "ensirek": ensirek, "paatos": paatos,
                "km": int(round(km)) if km is not None else None,
                "arvo": round(arvo), "veropros": lue_luku(s("veropros")),
            })
    return rivit, {"valilehtia": valilehdet, "ohitettu": ohitetut, "luokka": luokka}


def tallenna_vuosi(vuosi, rivit, lahde, kansio):
    # Merkkien yhtenäistäminen: yleisimmät kirjoitusasut ovat "tunnettuja"
    laskuri = {}
    for r in rivit:
        k = avain(r["merkki"])
        laskuri.setdefault(k, {}).setdefault(r["merkki"].strip().upper(), 0)
        laskuri[k][r["merkki"].strip().upper()] += 1
    tunnetut = {k: max(v, key=v.get) for k, v in laskuri.items() if sum(v.values()) >= 20}
    for r in rivit:
        r["merkki"] = yhtenaista_merkki(r["merkki"], tunnetut)

    rivit.sort(key=lambda r: (r["merkki"], r["malli"], r["paatos"]))
    sanastot = {k: [] for k in ["merkki", "malli", "kayttovoima", "korimalli", "vetotapa", "vaihteisto"]}
    indeksit = {k: {} for k in sanastot}

    def koodaa(k, v):
        if v not in indeksit[k]:
            indeksit[k][v] = len(sanastot[k])
            sanastot[k].append(v)
        return indeksit[k][v]

    lukusarakkeet = ["kw", "cm3", "ovet", "ensirek", "paatos", "km", "arvo", "veropros"]
    sarakkeet = {k: [] for k in list(sanastot) + lukusarakkeet}
    for r in rivit:
        for k in sanastot:
            sarakkeet[k].append(koodaa(k, r[k]))
        for k in lukusarakkeet:
            sarakkeet[k].append(r[k])

    tulos = {
        "vuosi": vuosi,
        "lahde": lahde,
        "muunnettu": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "rivit": len(rivit),
        "viimeisin_paatos": max(r["paatos"] for r in rivit),
        "sanastot": sanastot,
        "sarakkeet": sarakkeet,
    }
    kansio.mkdir(parents=True, exist_ok=True)
    polku = kansio / f"paatokset-{vuosi}.json"
    polku.write_text(json.dumps(tulos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return polku


def hae_linkit(sanat):
    pyynto = urllib.request.Request(SIVU, headers={"User-Agent": SELAIN})
    with urllib.request.urlopen(pyynto, timeout=60) as vastaus:
        sivu = vastaus.read().decode("utf-8", errors="replace")
    linkit = {}
    for href, teksti in re.findall(r'<a[^>]+href="([^"]+?\.xlsx?)"[^>]*>(.*?)</a>', sivu, flags=re.S | re.I):
        teksti = html.unescape(re.sub(r"<[^>]+>", " ", teksti)).lower()
        if not any(sana in teksti for sana in sanat):
            continue
        m = re.search(r"(20\d{2})", teksti) or re.search(r"(20\d{2})", href)
        if m:
            linkit[int(m.group(1))] = urllib.parse.urljoin(SIVU, html.unescape(href))
    return linkit


def lataa(url, kohde):
    pyynto = urllib.request.Request(url, headers={"User-Agent": SELAIN})
    with urllib.request.urlopen(pyynto, timeout=120) as vastaus, open(kohde, "wb") as f:
        f.write(vastaus.read())


LUOKAT = {
    "henkilo": {"kansio": DATA, "sanat": ("henkilöauto", "henkiloauto"), "nimi": "henkilöautot"},
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--vuosia", type=int, default=4, help="kuinka monen viimeisimmän vuoden päätökset haetaan")
    p.add_argument("--luokat", default="henkilo", help="haettavat ajoneuvoluokat pilkulla eroteltuna")
    p.add_argument("--vain-paikalliset", action="store_true", help="älä hae verkosta, käsittele vain data/raaka/")
    a = p.parse_args()
    luokat = [l for l in a.luokat.split(",") if l in LUOKAT]

    DATA.mkdir(exist_ok=True)
    RAAKA.mkdir(exist_ok=True)
    tama_vuosi = dt.date.today().year
    lahteet = []  # (polku, lähde-url)

    if not a.vain_paikalliset:
        tmp = pathlib.Path(tempfile.mkdtemp())
        for luokka in luokat:
            L = LUOKAT[luokka]
            try:
                linkit = hae_linkit(L["sanat"])
                print(f"Löytyi {len(linkit)} taulukkoa ({L['nimi']}): {sorted(linkit)}")
            except Exception as e:  # verkkovirhe
                print(f"VIRHE: vero.fi-sivun haku epäonnistui: {e}", file=sys.stderr)
                linkit = {}
            for vuosi in sorted([v for v in linkit if v > tama_vuosi - a.vuosia], reverse=True):
                # Kuluva ja edellinen vuosi haetaan aina (niitä täydennetään), vanhemmat vain jos puuttuvat.
                if (L["kansio"] / f"paatokset-{vuosi}.json").exists() and vuosi < tama_vuosi - 1:
                    print(f"  {vuosi}: on jo, ohitetaan")
                    continue
                kohde = tmp / pathlib.Path(urllib.parse.urlparse(linkit[vuosi]).path).name
                try:
                    lataa(linkit[vuosi], kohde)
                    lahteet.append((kohde, linkit[vuosi]))
                    print(f"  {vuosi}: ladattu {kohde.stat().st_size // 1024} kt")
                except Exception as e:
                    print(f"VIRHE: {vuosi} lataus epäonnistui: {e}", file=sys.stderr)

    for polku in sorted(RAAKA.glob("*.xls*")):
        lahteet.append((polku, f"käsin ladattu: {polku.name}"))

    paras = {}  # (luokka, vuosi) -> (rivit, lähde)
    for polku, lahde in lahteet:
        rivit, tilasto = muunna_tiedosto(polku)
        if tilasto["luokka"] not in LUOKAT:
            print(f"VAROITUS: {polku.name} on pakettiautotaulukko, ohitetaan (laskuri käsittelee vain henkilöautoja)", file=sys.stderr)
            continue
        if not rivit:
            print(f"VAROITUS: {polku.name}: ei luettavia rivejä", file=sys.stderr)
            continue
        vuosi = max(r["paatos"] for r in rivit) // 10000
        avain = (tilasto["luokka"], vuosi)
        print(f"  {polku.name}: {LUOKAT[tilasto['luokka']]['nimi']}, {len(rivit)} riviä, {tilasto['valilehtia']} välilehteä, "
              f"ohitettu {tilasto['ohitettu']}, päätösvuosi {vuosi}")
        if avain not in paras or len(rivit) > len(paras[avain][0]):
            paras[avain] = (rivit, lahde)

    for (luokka, vuosi), (rivit, lahde) in sorted(paras.items()):
        polku = tallenna_vuosi(vuosi, rivit, lahde, LUOKAT[luokka]["kansio"])
        print(f"Tallennettu {polku.relative_to(JUURI)} ({len(rivit)} päätöstä)")

    virheita = 0
    for luokka in LUOKAT:
        kansio = LUOKAT[luokka]["kansio"]
        vuodet = sorted(int(re.search(r"(\d{4})", q.name).group(1)) for q in kansio.glob("paatokset-*.json"))
        if not vuodet:
            if luokka in luokat:
                print(f"VAROITUS: {LUOKAT[luokka]['nimi']}: ei aineistoa", file=sys.stderr)
                virheita += luokka == "henkilo"
            continue
        # Poistetaan liian vanhat vuodet ja kirjoitetaan hakemisto
        pidettavat = [v for v in vuodet if v > max(vuodet) - a.vuosia]
        for v in vuodet:
            if v not in pidettavat:
                (kansio / f"paatokset-{v}.json").unlink()
                print(f"Poistettu vanha vuosi {v} ({LUOKAT[luokka]['nimi']})")
        hakemisto = {
            "paivitetty": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "tiedostot": [f"paatokset-{v}.json" for v in sorted(pidettavat, reverse=True)],
        }
        (kansio / "hakemisto.json").write_text(json.dumps(hakemisto, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Hakemisto päivitetty ({LUOKAT[luokka]['nimi']}).")
    return 1 if virheita else 0


if __name__ == "__main__":
    sys.exit(main())
