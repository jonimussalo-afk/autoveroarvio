# Kauppiaiden arviot (koulutustila)

Tähän kansioon lisätään koulutustilasta ladatut arviotiedostot (`kauppiaan-arviot-*.json`).

1. Kauppias antaa arvioita sivulla `koulutus.html` ja lataa ne tiedostona (*Lataa lähettämättömät arviot*).
2. Kauppias lähettää tiedoston ylläpitäjälle.
3. Ylläpitäjä lisää tiedoston GitHubissa: avaa tämä kansio, valitse **Add file → Upload files**,
   raahaa tiedosto ja valitse **Commit changes**.

Päivitys käynnistyy itsestään. Se lukee kaikki tämän kansion arviot ja

- lisää ne laskuriin verrokeiksi (lähde: kauppiaan arvio), jolloin ne parantavat arvioita kaikille käyttäjille
- vertaa niitä Verohallinnon päätöksiin, kun samasta autosta on tehty päätös, ja mittaa näin kauppiaiden osuvuuden.

Sama arvio voi olla useassa tiedostossa: tunnisteen ansiosta se lasketaan vain kerran.
Tiedostot näkyvät julkisessa tietovarastossa. Ne sisältävät auton tiedot, laskurin arvion ja kauppiaan arvion
sekä satunnaisen kauppiastunnuksen, mutta eivät kauppiaan nimeä eivätkä koulutustilan huomioita.
