# PV Monitor – System- och driftmanual

Informationsskärm som visar realtidsstatistik från KOSTAL-solcellsomformare för
Räddningstjänsten Syd (RSYD). Denna manual beskriver hur systemet fungerar, vad
som visas var, hur lagring/backup sköts, samt inloggning och administration.

> Kortversion: skärmen läser omformarna via Modbus, sparar värden i en databas i
> RAM, visar dem i en roterande vy, och backar upp databasen både lokalt och till
> en extern server. Allt konfigureras via ett webbaserat admin­gränssnitt.

---

## 1. Systemöversikt

| Skikt | Teknik | Uppgift |
| --- | --- | --- |
| Hårdvara | Beelink Mini S, Debian 13 | Kör allt lokalt, startar autonomt efter strömavbrott |
| Backend | Node.js/Express + Modbus TCP | Pollar omformarna var 10:e sekund, exponerar JSON-API |
| Lagring | SQLite på RAM-disk | Snabb, skonar SSD; backas till disk + extern server |
| Frontend | React (Vite) | Roterande kioskvy i Firefox, fullskärm |
| Kiosk | Firefox ESR + Openbox + LightDM | Autologin, fullskärm, döljer allt utom gränssnittet |

**Dataflöde:** KOSTAL-omformare → (Modbus TCP) → backend → SQLite → JSON-API →
frontend (skärm). Omformarna är sanningskälla för energitotaler.

---

## 2. Vad visas på skärmen

Skärmen roterar automatiskt mellan vyerna (~15 sekunder per vy):

### Vy 1 – Översikt (hela fastigheten)
- **Effekt just nu** (kW) – summerad aktuell effekt.
- **Andel av maxeffekt just nu** – stapel som visar aktuell effekt mot total
  installerad kapacitet (0 → max).
- **Energi idag** (kWh), **Energi i år** (MWh), **Totalt producerat** (MWh).
- **Minskad CO₂** – beräknas på energitotal × CO₂-faktor (standard 0,4 kg/kWh).

### Vy 2 – Produktion idag
- Stapeldiagram över **producerad energi per timme** senaste dygnet.
- Nuvarande timme markeras grön → man ser hur produktionen ändras över dagen.

### Vy 3+ – Per anläggning (t.ex. SOS, RSYD)
En vy per anläggning med korten för varje omformare (en anläggning vars samtliga
omformare är avaktiverade visas inte):
- **Aktuell effekt** (kW) och kapacitetsstapel (andel av omformarens maxeffekt).
- **Idag / I år / Totalt** samt omformarens minskade CO₂.
- **Statuslysdiod:** grön = online, röd = offline/ingen aktuell data.

### Statusindikatorer (gäller alla vyer)
- **Sidfot:** "Uppdaterad HH:MM:SS" + datum/klocka (står klockslaget stilla är
  datan gammal). Sidfoten visar också Räddningstjänsten Syds sköld och
  leverantörens logotyp (Bredbandskompetens).
- **Gul banner:** "X av Y omformare offline" – backend når inte en eller flera
  omformare (den omformarens lysdiod blir röd, effekt visas som 0).
- **Röd banner:** "Ingen kontakt med servern" – skärmen når inte backenden alls;
  visar senast kända värden och **alla** lysdioder blir röda.

---

## 3. Datainsamling (Modbus)

- Backenden ansluter till varje omformare via **Modbus TCP** (standardport 1502).
- **Unit-ID** (standard 71): Modbus enhets-adress. På Modbus TCP identifieras varje
  omformare av sin **egen IP-adress**, så alla kan ha samma unit-ID. Unit-ID
  behöver bara vara unikt om flera omformare sitter bakom en gemensam
  Modbus-gateway på samma IP.
- Pollningsintervall: 10 sekunder.
- Registerkarta: se [MODBUS.md](MODBUS.md). Verifiera adresserna mot KOSTAL:s
  Modbus-dokument för CI-serien vid skarp driftsättning.

---

## 4. Lagring – var sparas informationen?

Tre lager:

1. **I omformarna (sanningskällan):** varje KOSTAL-omformare lagrar själv sina
   räkneverk (total/år/månad/dag) i icke-flyktigt minne. Dessa läses via Modbus.
2. **I systemets databas (Beelinken):** SQLite på RAM-disk (`/dev/shm`).
   - `latest` – senaste värdet per omformare (cache).
   - `hourly` – systemets egen uträknade timproduktion (för stapeldiagrammet),
     gallras automatiskt till ~3 dygn.
3. **Backup:** se avsnitt 5.

**Självläkning:** om databasen kraschar och startar tom läses de aktuella
totalerna in igen från omformarna → inget tapp av total/år/dag-värden. Endast
timdiagrammets historik är unik för systemet (skyddas av backup).

Databasen är liten (~tiotals KB) och växer inte okontrollerat. Skrivningar sker i
RAM för att skona SSD:n; journald är satt till volatil (RAM, max 30 MB).

---

## 5. Backup

### Lokal backup (automatisk)
RAM-databasen kopieras till beständig disk var **15:e sekund**
(`/opt/pvmonitor/backend/data/pvmonitor.sqlite`). Vid uppstart återläses den, så
historiken överlever omstart/strömavbrott (max ~15 s kan förloras).

### Extern backup (till egen server)
Schemalagd, komprimerad kopia till en målplats – konfigureras i admin
(superadmin). Sätts upp via SSH-nyckel (inget lösenord lagras i appen).

- **Målplats:** mapp (lokal/monterad) eller `user@server:/sökväg` (scp).
- **Schema:** dagligen vid vald tid, eller var N:e timme.
- **Komprimering:** Gzip (`.gz`, standard) eller Brotli (`.br`, bäst) eller ingen.
- **Gallring:** behåll N kopior (äldre raderas automatiskt, lokalt och på fjärr).
- Filnamn: `pvmonitor-ÅÅÅÅMMDD-TTMMSS.sqlite[.gz|.br]`.

Nuvarande uppsättning: daglig kopia kl 03:00 till
`pvmonitor-rsyd@213.115.181.168:pvmonitor-backup`, gzip, behåller 14 kopior.

### Återställning
1. Hämta önskad backupfil.
2. Packa upp: `gunzip fil.sqlite.gz` (eller `brotli -d fil.sqlite.br`).
3. Lägg `.sqlite`-filen i `/opt/pvmonitor/backend/data/pvmonitor.sqlite`.
4. Starta om backenden: `systemctl restart pv-backend`.

---

## 6. Admin­gränssnitt

Webbaserat, nås från valfri dator på nätverket.

- **URL:** `http://<serverns-ip>:3000/admin`
- **Roller:**
  - **admin** – redigera omformare: namn, modell, IP, port, unit-ID, kapacitet,
    slå i/ur drift, lägga till/ta bort omformare.
  - **superadmin** – allt admin kan **+** CO₂-faktor, lägga till/ta bort/döpa om
    hela anläggningar, databasbackup-inställningar samt sidfotens logotyper
    (välja, ladda upp, sortera ordning och storlek).
- **Ändringar tillämpas live** inom några sekunder (ingen omstart krävs).
- Att lägga till en anläggning skapar automatiskt en ny roterande vy på skärmen.
- **Lösenord** byts direkt i admin (superadmin → *Konton & lösenord*) och lagras
  **hashat** (inte i klartext). De initiala lösenorden sätts i `backend/.env`
  (`ADMIN_PASSWORD`, `SUPERADMIN_PASSWORD`) och används tills de bytts i admin.
  Åtkomst sker över LAN via inloggningsruta med session-cookie.

---

## 7. Drift och autonomi

- **Tjänster (systemd):** `pv-backend`, `pv-frontend`, `pv-simulator` (endast före
  driftsättning), `lightdm`. Alla `enabled` → startar vid boot, `Restart=always`.
- **Kiosk:** LightDM autologin → Openbox → Firefox ESR i fullskärm mot
  `http://localhost:5173`. Skärmsläckare/energisparläge och muspekare är avstängda;
  inga popups eller felrutor visas.
- **Efter strömavbrott:** BIOS (Restore AC Power Loss = Power On) startar datorn,
  systemd startar tjänsterna, och en hårdvaru-watchdog startar om vid frysning.
- **Webbläsarval:** Firefox ESR

---

## 8. Felsökning och loggar (administratör)

Allt loggas via systemd/journald:

```bash
journalctl -u pv-backend -f        # live backend/Modbus-poller
journalctl -u pv-frontend -f       # live frontend
systemctl status pv-backend pv-frontend pv-simulator lightdm
```

Snabb hälsokoll mot API:t:
```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/data      # online-status + värden per omformare
```

Läsa databasen:
```bash
sqlite3 -header -column /dev/shm/pvmonitor/pvmonitor.sqlite 'SELECT * FROM latest;'
```

Obs: journald är volatil (RAM) → loggar nollställs vid omstart; använd `-f` medan
felet pågår.

---

## 9. Fjärradministration & säkerhet

- **SSH:** inloggning som `smartsource` med SSH-nyckel (root-inloggning avstängd).
- **Uppdatera systemet (ny kod):**
  `ssh smartsource@<ip> "sudo bash /opt/pvmonitor/deploy/update.sh"` – hämtar
  senaste koden, bygger om frontenden och startar om tjänsterna. För att skärmen
  ska visa nya bygget direkt: `ssh smartsource@<ip> "sudo pkill -f firefox"`
  (kiosken öppnar webbläsaren igen automatiskt). Dagliga uppgifter (omformare,
  backup, lösenord) sköts i admin­gränssnittet och kräver ingen SSH.
- **Hemligheter:** inga lösenord lagras i klartext i appens config. Admin-lösenord
  ligger i `backend/.env` (gitignorerad); backup-serverns autentisering sker via
  SSH-nyckel.
- **Att göra vid driftsättning:** byt admin-lösenorden, fyll i riktiga IP-adresser
  för omformarna, verifiera Modbus-registren, stäng av simulatorn.

---

## 10. Driftsättnings-checklista (skarp drift)

När de riktiga omformarna kopplas in – gå från test till skarp drift:

1. **Omformar-IP:er:** logga in i admin (superadmin) och fyll i varje omformares
   riktiga IP-adress, port (1502) och unit-ID (71). Kontrollera modell/kapacitet.
2. **Verifiera Modbus-registren** mot KOSTAL:s dokument för CI-serien (se
   [MODBUS.md](MODBUS.md)).
3. **Stäng av simulatorn:** `sudo systemctl disable --now pv-simulator`.
4. **Peka mot riktig config:** ta bort raden `INVERTERS_CONFIG=...sim.json` ur
   `backend/.env` (så att `config/inverters.json` används) och
   `sudo systemctl restart pv-backend`.
5. **Byt admin-lösenord** (admin → Konton & lösenord, eller i `.env`).
6. **Kontrollera backup:** att extern backup är aktiverad och att "Kör backup nu"
   lyckas.
7. **Verifiera skärmen:** alla omformare online (gröna prickar), inga banners.
8. **BIOS:** bekräfta Restore AC Power Loss = Power On.

> Simulatorn är enbart ett teststeg innan riktiga omformare finns – den ska inte
> vara igång i skarp drift.

## 11. Adresser och portar (sammanfattning)

| Funktion | Adress |
| --- | --- |
| Skärmvy (frontend) | `http://localhost:5173` |
| Backend-API | `http://<ip>:3000/api/...` |
| Admin­gränssnitt | `http://<ip>:3000/admin` |
| Simulator-kontroll (testläge) | `http://localhost:4000` |
| Modbus mot omformare | `<omformar-ip>:1502`, unit-ID 71 |

---

## 12. Exportera till PDF

Denna manual underhålls som Markdown i repot. Vid behov av en PDF:
- Öppna filen i VS Code och använd en Markdown-till-PDF-funktion, eller
- `pandoc docs/MANUAL.md -o MANUAL.pdf` (kräver pandoc).

Så hålls källan versionshanterad och PDF:en genereras vid behov.
