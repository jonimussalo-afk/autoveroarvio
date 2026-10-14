# Tuontiauton autoveroarvio

Selaimessa toimiva laskuri, joka arvioi ulkomailta tuotavan auton **verotusarvon** ja **autoveron**
Verohallinnon aiempien verotuspäätösten perusteella. Laskuri on rakennettu erityisesti
**harvinaisille autoille**, joista päätöksiä on vähän tai ei lainkaan.

**Sivu:** https://jonimussalo-afk.github.io/autoveroarvio/

Aineisto päivittyy itsestään kerran kuussa: GitHub hakee Verohallinnon sivulta tuoreet
Excel-taulukot, muuntaa ne, opettaa mallin uudelleen ja mittaa sen tarkkuuden.

## Mitä laskuri tekee

1. **Siirtää jokaisen aiemman päätöksen kohdeautoon.** Verrokin verotusarvo korjataan kohdeauton
   ikään, ajokilometreihin, tehoon ja verotushetken hintatasoon. Korjauskertoimet opitaan koko
   aineistosta vertaamalla saman mallin autoja keskenään, joten mallien hintaerot eivät sotke niitä.
   Hintataso seurataan kuukausittaisella indeksillä erikseen sähkö-, hybridi- ja polttomoottoriautoille.
2. **Painottaa lähimpiä verrokkeja.** Paino riippuu mallista, tehosta (kW), iästä, iskutilavuudesta,
   päästöistä, korimallista, vetotavasta, vaihteistosta, ovien määrästä ja päätöksen tuoreudesta.
   Teho on tärkein tieto, koska Verohallinnon taulukoissa esimerkiksi kaikki Porsche 911 -versiot
   ovat samalla nimellä. Päätösten päästöt päätellään niiden veroprosentista ja ensirekisteröintipäivästä.
3. **Jäljittelee Verohallinnon mallikohtaista laskentaa.** Saman mallin verrokeista lasketaan oma
   ikä-, kilometri-, teho- ja hintakehitys, ja lähes samanlaiset autot (sama teho, lähes sama ikä ja
   kilometrit) painavat eniten. Verohallinto arvottaa tällaiset autot lähes samoin: niiden verotusarvot
   poikkeavat toisistaan tyypillisesti alle 2 %.
4. **Porrastaa arvion harvinaisille autoille.** Jos saman mallin päätöksiä on vähän, arvio nojaa
   portaittain mallisarjan, merkin muiden mallien ja lopulta kaikkien merkkien tietoihin. Yksittäinen
   päätös ei ratkaise yksin, mutta sitä ei myöskään hukuteta.
5. **Tunnistaa mallisukupolvet.** Laskuri etsii jokaisen yleisen mallin (vähintään 40 päätöstä)
   hintatasosta portaita ensirekisteröinnin mukaan, kun ikä, kilometrit ja teho on huomioitu.
   Porras kertoo yleensä sukupolven tai mallipäivityksen vaihdoksesta (esim. Volvo XC90 2014–2015,
   BMW 530 2016–2017). Portaita löytyi 173 mallista. Verrokit, jotka on rekisteröity eri puolella
   porrasta kuin kohdeauto, painavat 30 % tavallisesta, ja sivu merkitsee ne verrokkitaulukkoon.
6. **Huomioi erikoisversiot.** Jos auton teho on saman mallin aiempien päätösten tehoalueen
   ulkopuolella, sivu kertoo sen. Tehoalueen alapuolella arviota korjataan aiempien tällaisten
   autojen keskimääräisen virheen verran (laskuri arvioi ne liian alas). Molemmissa suunnissa
   vaihteluväli lasketaan näiden autojen omista virheistä, joten se on leveämpi.
7. **Kertoo rehellisesti epävarmuuden.** Jokainen aineiston päätös on ennustettu ilman sitä itseään.
   Vaihteluväli perustuu näiden virheiden jakaumaan sen mukaan, kuinka paljon tukea arviolla on.
   Kun harvinaisen auton tai erikoisversion autoveron 80 %:n väli on vähintään 2 000 € leveä, sivu
   ehdottaa Verohallinnon sitovaa ennakkoratkaisua ja kertoo syyn (esim. teho tehoalueen ulkopuolella
   tai vähän verrokkeja). Yleisille malleille ehdotusta ei näytetä, koska niille Verohallinnon
   hintatietopalvelu on helpompi tarkistus.
   Ennakkoratkaisun maksu on 480 € ajoneuvolta ja käsittely kestää noin 8–11 viikkoa (tilanne 10/2026).
   Raja on muutettavissa tiedostossa `js/sovellus.js` (`ENNAKKO.rajaEuroa`).
8. **Laskee veroprosentin virallisista taulukoista** ensirekisteröintipäivän mukaan:
   - 2016 ja myöhemmin: taulukot 1A (WLTP) ja 1 (NEDC, 1481/2015)
   - 4/2012–2015: taulukko 1 (1316/2011)
   - 2008–3/2012: pienin taulukoista 1292/2007, 5/2009 ja 1316/2011
   - ennen 2008: pienin päästöperusteisista taulukoista ja mallikohtaisesta vertailuprosentista
     (syötetään vero.fi:n luettelosta; ennen 2003 ilman luettelon prosenttia 29 % tai dieselille 30 %)

   Vuosien 2008–2015 laskenta on tarkistettu aineistoa vasten: 2023–2026 tehtyjen päätösten
   veroprosenteista 11 096 / 11 097 on taulukoiden mahdollisia arvoja. Täyssähkö- ja
   vetyautot, jotka on otettu käyttöön 1.10.2021 tai myöhemmin, ovat verottomia.
9. **Näyttää varatavan:** jos syötät vastaavan uuden auton hinnan Suomessa, laskuri näyttää myös
   arvon, jonka Verohallinto voi johtaa uuden auton hinnasta (−3 %, −2 %, −2 % ja sen jälkeen −1 %
   kuukaudessa).

## Tarkkuus (aineisto 1/2023–9/2026, 163 130 päätöstä)

**Ennuste tulevista päätöksistä:** malli opetettiin ennen 1.7.2026 tehdyillä päätöksillä, ja sillä
ennustettiin heinä–syyskuun 2026 päätökset. Tämä vastaa laskurin todellista käyttöä.

| Ryhmä | Testattu | Mediaanivirhe | Alle 10 % virhe | 80 %:n välin osuma |
|---|---:|---:|---:|---:|
| Yleiset mallit (30+ lähes samanlaista) | 8 635 | 2,7 % | 90 % | 79 % |
| Harvinaiset (5–29) | 931 | 5,7 % | 64 % | 81 % |
| Erittäin harvinaiset (alle 5) | 586 | 13,6 % | 44 % | 77 % |

### Sukupolvet ja erikoisversiot

Muutokset testattiin kahdella jaksolla (huhti–kesäkuu ja heinä–syyskuu 2026), ja ne otettiin
käyttöön vain, jos ne eivät heikentäneet kumpaakaan:

| Ryhmä (heinä–syyskuu 2026) | Testattu | Mediaanivirhe ennen → nyt | 80 %:n välin osuma ennen → nyt |
|---|---:|---:|---:|
| Teho mallin tehoalueen yläpuolella | 84 | 24,3 % → 24,3 % | 58 % → 77 % |
| Teho mallin tehoalueen alapuolella | 75 | 19,4 % → 16,3 % | 68 % → 84 % |

Huhti–kesäkuussa vastaavat luvut olivat 14,7 % → 14,7 % ja 64 % → 86 % (yläpuoli) sekä
18,6 % → 18,3 % ja 68 % → 78 % (alapuoli). Tehoalueen yläpuolella harha vaihteli jaksosta toiseen
(−12 % ja −2 %), joten siellä arviota ei korjata, vaan ainoastaan väliä levennetään.

Sukupolvien tunnistuksen vaikutus oli pieni: yleisten mallien mediaanivirhe pieneni heinä–syyskuussa
2,77 % → 2,73 % ja erittäin harvinaisten huhti–kesäkuussa 15,7 % → 15,5 %. Harvinaisissa muutos oli
satunnaisvaihtelun rajoissa.
Tehon vaikutuksen vaimentaminen tehoalueen ulkopuolella, saman version lisäpaino ja
ensirekisteröinnin läheisyys verrokin painona kokeiltiin myös, mutta ne eivät parantaneet tarkkuutta.

Vaihteluvälit perustuvat poisjättötestiin: 15 000 päätöstä koko aineistosta ennustettiin ilman päätöstä
itseään. Luvut päivittyvät joka kuukausi, ja sivun alaosassa näkyy aina uusimman testin tulos.

### Kuinka pitkä historia?

Historian pituutta verrattiin samoilla heinä–syyskuun 2026 päätöksillä (mediaanivirhe):

| Historia | Yleiset | Harvinaiset | Erittäin harvinaiset |
|---|---:|---:|---:|
| 1 vuosi | 3,2 % | 6,0 % | 15,1 % |
| 2 vuotta | 3,3 % | 5,7 % | 14,1 % |
| 3 vuotta | 3,4 % | 5,8 % | 13,0 % |
| 4 vuotta | 3,3 % | 5,9 % | 12,9 % |

Pidempi historia auttaa erittäin harvinaisia autoja, eikä se heikennä yleisiä, koska laskuri käyttää
vanhoja päätöksiä vain silloin, kun tuoreita ei ole: jos saman mallin tuoreita päätöksiä on vähintään
kaksi, päätöksen paino puolittuu 4 kuukauden välein, muuten 18 kuukauden välein. Hyöty tasaantuu
kolmen vuoden jälkeen, joten työnkulku pitää neljä viimeisintä vuotta (`--vuosia 4`).
Vertailun voi toistaa komennolla `node tyokalut/vertaa_historiaa.mjs 1,2,3,4`.

## Käyttöönotto GitHubissa

1. **Luo tietovarasto.** Kirjaudu GitHubiin ja valitse **New repository**. Anna nimi
   (esim. `autoveroarvio`) ja valitse **Public**. GitHub Pages on ilmainen julkisille
   tietovarastoille. Yksityiseen tarvitaan maksullinen tili tai organisaation lisenssi.
2. **Lataa tiedostot.** Pura zip-paketti. Valitse tietovarastossa **Add file → Upload files** ja
   raahaa sinne kaikki kansion tiedostot ja kansiot.
   - Macin Finder piilottaa `.github`-kansion. Paina Finderissa **Cmd + Shift + .** (piste), niin
     piilotetut kohteet tulevat näkyviin, ja raahaa myös `.github`.
   - Varmista latauksen jälkeen, että tietovarastossa on tiedosto
     `.github/workflows/paivita-aineisto.yml`. Jos ei ole, luo se: **Add file → Create new file**,
     kirjoita nimeksi `.github/workflows/paivita-aineisto.yml` ja liitä sisältö zip-paketin
     samannimisestä tiedostosta.
3. **Salli kirjoitus päivitykselle.** **Settings → Actions → General → Workflow permissions** →
   valitse **Read and write permissions** → **Save**.
4. **Julkaise sivu.** **Settings → Pages** → kohdassa *Build and deployment* valitse
   **Deploy from a branch**, haara **main** ja kansio **/ (root)** → **Save**.
   Muutaman minuutin päästä laskuri on osoitteessa `https://<käyttäjänimi>.github.io/<tietovaraston-nimi>/`.
5. **Aja ensimmäinen päivitys.** **Actions → Päivitä verotuspäätökset → Run workflow**.
   Ajo hakee taulukot vero.fi:stä, opettaa mallin ja luo kansion `data/merkit/`, jota sivu tarvitsee.
   Sivu toimii vasta tämän ajon jälkeen. Ajo kestää muutaman minuutin. Jos haku vero.fi:stä
   epäonnistuu, ajo käyttää mukana tulevaa aineistoa (2023–2026). Tämän jälkeen päivitys toimii
   itsestään joka kuun 12. päivä.

## Jos jokin ei toimi

- **Haku vero.fi:stä epäonnistuu** (näkyy Actions-välilehdellä punaisena): lataa Excel käsin
  vero.fi:stä ja lisää se kansioon `data/raaka/`. Päivitys käynnistyy itsestään.
  Ks. `data/raaka/LUEMINUT.md`.
- **Ajastettu päivitys on pysähtynyt:** GitHub keskeyttää ajastetut ajot julkisissa tietovarastoissa,
  jos niihin ei ole tullut muutoksia 60 päivään. Ota ajo uudelleen käyttöön Actions-välilehdeltä.
- **Sivu näyttää vanhaa aineistoa:** GitHub Pages päivittyy muutaman minuutin viiveellä. Lataa sivu
  uudelleen.
- **Haluatko eri pituisen historian?** Muuta työnkulkutiedostossa `--vuosia 4` haluamaksesi.

## Käyttö omalla koneella

Sivu lataa aineiston erillisistä tiedostoista, joten se ei toimi suoraan tiedostona avattuna.
Käynnistä kansiossa pieni palvelin ja avaa `http://localhost:8000`:

```
python3 -m http.server 8000
```

Aineiston voi päivittää käsin:

```
pip install xlrd openpyxl
python3 tyokalut/hae_aineisto.py
node tyokalut/rakenna_malli.mjs
```

## Tiedostot

| Tiedosto | Tehtävä |
|---|---|
| `index.html` | Laskurin sivu |
| `js/sovellus.js` | Lomake ja tulosten näyttäminen |
| `js/malli.js` | Arviomalli, verrokkien painotus ja tarkkuustesti |
| `js/verotaulukot.js` | Viralliset autoveroprosenttitaulukot |
| `tyokalut/hae_aineisto.py` | Hakee ja muuntaa Verohallinnon Excelit |
| `tyokalut/rakenna_malli.mjs` | Opettaa mallin, mittaa tarkkuuden ja jakaa aineiston merkeittäin |
| `tyokalut/vertaa_historiaa.mjs` | Vertaa eri pituisia päätöshistorioita |
| `.github/workflows/paivita-aineisto.yml` | Kuukausittainen automaattinen päivitys |
| `data/paatokset-VVVV.json` | Muunnetut vuositaulukot (opetusta varten) |
| `data/malli.json` | Opetettu malli, hintaindeksi, tarkkuus ja valintalistat |
| `data/merkit/` | Päätökset merkeittäin; selain lataa vain valitun merkin |

## Rajoitukset

- Verohallinnon taulukoissa ei ole varusteita eikä kuntoa, joten ne eivät näy arviossa.
  Hyvin varusteltu auto voi saada korkeamman verotusarvon.
- Veroprosentti lasketaan CO2-päästöstä. Jos päästötietoa ei ole (esim. osa USA-tuonneista ja
  hyvin vanhat autot), Verohallinto käyttää kokonaismassaa: syötä silloin prosentti käsin.
  Laskuri näyttää apuna verrokkien prosentit.
- Ennen vuotta 2008 käyttöön otetuille autoille laskuri ei tunne mallikohtaisia vertailuprosentteja,
  vaan ne syötetään vero.fi:n luettelosta. Ilman sitä tulos on päästöperusteinen yläraja.
- Taulukon 1316/2011 arvot 0–140 g/km on otettu lain esityksestä (HE 57/2011); ne vastaavat
  Verohallinnon esimerkkejä ja aineiston päätöksiä.
- 1.9.–2.12.2018 rekisteröidyille WLTP-autoille laskuri käyttää NEDC-taulukkoa. Tarkista
  WLTP-prosentti taulukosta 1A (570/2018).
- Sukupolven porras tunnistetaan vain malleista, joista on vähintään 40 päätöstä. Harvinaisten mallien
  sukupolvia laskuri ei tunne, joten tarkista verrokkien ensirekisteröinnit itse.
- Arvio on suuntaa antava. Sitovan tiedon saa Verohallinnon maksullisella
  [ennakkoratkaisulla](https://vero.fi/yritykset-ja-yhteisot/yhteistyo-ja-palvelut/ennakkoratkaisu-tai-poikkeuslupa/).

Lähde: Verohallinto, [Taulukoita ajoneuvojen sovelletuista verotusarvoista](https://vero.fi/henkiloasiakkaat/omaisuus/autovero/autoveron-maara/ajoneuvojen-sovellettuja-verotusarvoja/)
ja [Autoveroprosentit ajoneuvoille](https://vero.fi/henkiloasiakkaat/omaisuus/autovero/autoveron-maara/autoveroprosentit-ajoneuvoille/).
