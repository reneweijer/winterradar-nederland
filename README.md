# ❄️ Winterradar Nederland

Interactief onderzoeksdashboard voor de kans op winterweer in **De Bilt en Maarssen**.

## Website
De publieke website is na de eerste geslaagde GitHub Pages-publicatie beschikbaar op:

https://reneweijer.github.io/winterradar-nederland/

> Is de site nog niet bereikbaar? Ga naar **Settings → Pages** en selecteer bij **Build and deployment → Source** de optie **GitHub Actions**. Voer daarna zo nodig in **Actions** de workflow *Winterradar — dagelijkse update en publicatie* handmatig uit via **Run workflow**.

## Automatische update

De GitHub Actions-workflow in `.github/workflows/daily.yml` doet drie dingen:

1. Haalt elke dag om **05:23 UTC** (06:23 CET / 07:23 CEST) een nieuwe 14-daagse weersverwachting voor De Bilt op.
2. Vraagt ensembleleden voor vorstkansen op, sneeuwdiepte uit weermodellen voor Warschau, Białystok, Minsk, Smolensk en Moskou, en de dagelijkse NAO/AO-indices van NOAA.
3. Publiceert `index.html` samen met de actuele snapshot in `data/latest.json` via GitHub Pages.

De pagina kan bij openen ook rechtstreeks Open-Meteo raadplegen en biedt een locatiekeuze tussen De Bilt en Maarssen. De achtergrond-snapshot is uitsluitend voor De Bilt; de voorspelling voor Maarssen wordt bij openen opgehaald.

De workflow heeft geen API-sleutels nodig. GitHub kan geplande workflows later uitvoeren dan het opgegeven tijdstip. De recentste uitvoering is zichtbaar onder **Actions**.

## Wetenschappelijke beperkingen

- De **winterpotentieelscore** is een transparante maar **niet-gevalideerde heuristiek**, geen kanspercentage voor een Elfstedentochtwinter.
- Ensemble-vorstkansen zijn percentages van beschikbare modelleden en niet automatisch statistisch gekalibreerde kansen.
- Sneeuwdiepte voor Oost-Europa is modelmatig geschat en is **geen** satellietmeting van het sneeuwoppervlak.
- De NAO/AO-data kunnen vertraagd zijn; verouderde indices worden niet als live weergegeven.
- De historische dataset uit het oorspronkelijke klimaatonderzoek is nog niet volledig onafhankelijk geverifieerd.
- De precieze positie van de straalstroom of de stratosferische poolwervel wordt niet rechtstreeks gemeten met dit dashboard.
- Lange-termijn winterverwachtingen blijven onzeker; de bruikbaarste informatie betreft de komende 7–14 dagen.

Bronnen: [Open-Meteo](https://open-meteo.com/), [NOAA CPC](https://www.cpc.ncep.noaa.gov/), [KNMI](https://www.knmi.nl/).

## Problemen oplossen
Controleer in **Actions** of de laatste uitvoering groen (geslaagd) is. Bij een fout kun je op de uitvoering klikken om de stap en logmelding te lezen. Bij een mislukte bronopvraag worden ontbrekende waarden niet als nul ingevuld.

## Eigen diagnose en WinterLab (november 2026)

- De pagina **Home** toont een zelfstandig berekende modeldiagnose: lokale vorst/ijsdagen, duur van oostelijke wind, Europese 850-hPa-koude en een beperkt drukverschilsignaal. Deze diagnose neemt **geen KNMI-tekst** over.
- De **KouRadar-hoofdwijzer** toont eerst dagen 0–7; dagen 8–14 blijven apart zichtbaar. De hoogste van beide scores wordt niet langer automatisch als hoofdresultaat gekozen.
- De GitHub-workflow haalt aanvullend een **afzonderlijke modelverwachting voor Maarssen**, een **GFS-vergelijking voor De Bilt** en **Open-Meteo historische heranalyse** op. Deze optionele extra bronnen zijn niet hetzelfde als KNMI-stationswaarnemingen.
- **WinterLab** archiveert modeluitgiftes per plaats en model, toont modelbijstellingen en berekent voorlopige gemiddelde absolute fouten ten opzichte van historische heranalyse. De steekproef groeit pas na succesvolle runs. De archiefcache is geen gegarandeerd permanent datawarehouse; voor langdurig onderzoek is persistente opslag nodig.
- De historische AUC-claim 0,87 is uit de zichtbare prestatiecijfers verwijderd omdat onafhankelijke reproduceerbaarheid nog niet is aangetoond.
- **Nog niet voltooid:** onafhankelijke KNMI-stationsvalidatie, satelliet-sneeuwbedekkingskaarten, objectieve 500-hPa-blokkadeherkenning, nauwkeurige straalstroomlokalisatie en wetenschappelijk gekalibreerde winterkansen. Het dashboard mag deze niet als vastgestelde feiten presenteren.
- Alle atmosferische indicaties blijven modelafhankelijk. Een drukverschil tussen enkele steden bewijst geen Scandinavische blokkade; sneeuwdiepte op vijf modelpunten is geen sneeuwbedekkingspercentage; een ruwe poolwervelsteekproef is geen officiële SSW-diagnose.
