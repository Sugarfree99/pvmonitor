# Driftsättning på Beelink Mini S (Debian Stable)

Fullständig installation av PV Monitor som autonom kiosk.

## 1. BIOS – automatisk återstart efter strömavbrott

1. Starta Beelink, tryck **DEL** upprepade gånger för att gå in i BIOS.
2. Gå till **Advanced → ACPI Settings** (eller motsvarande spänningsmeny).
3. Sätt **Restore AC Power Loss** / **State After G3** till **Power On**.
4. Tryck **F4** för att spara. Datorn startar nu så fort strömmen kommer tillbaka.

## 2. Debian Stable

Installera Debian **amd64 netinst**. Vid *Software selection*: avmarkera alla
skrivbordsmiljöer, bocka endast i **standard system utilities** och **SSH server**.
Döp datorn till `pv-display`.

## 3. Grafiklager + mjukvara

```bash
sudo apt update && sudo apt install -y \
  xorg openbox firefox-esr lightdm unclutter git nodejs npm curl
```

## 4. Hämta och installera PV Monitor

```bash
sudo git clone https://github.com/Sugarfree99/pvmonitor.git /opt/pvmonitor
cd /opt/pvmonitor/deploy
sudo ./install.sh
```

Skriptet:

- skapar `kiosk`-användaren,
- installerar backend- och frontend-beroenden och bygger frontenden,
- installerar och startar systemd-tjänsterna `pv-backend` och `pv-frontend`,
- konfigurerar LightDM autologin, Openbox autostart och Firefox kiosk,
- aktiverar hårdvaru-watchdog och volatil journald-loggning.

## 5. Konfigurera omformarna

Redigera IP-adresser, port och unit-ID:

```bash
sudo nano /opt/pvmonitor/backend/config/inverters.json
sudo systemctl restart pv-backend
```

Se [`../docs/MODBUS.md`](../docs/MODBUS.md) för registerkartan.

Kontrollera att data läses in:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/data
```

## 6. Aktivera kiosk

```bash
sudo reboot
```

Efter omstart loggar `kiosk` in automatiskt, Openbox startar, väntar på API:et och
öppnar Firefox i fullskärm mot `http://localhost:5173`.

## Felsökning

| Symptom | Åtgärd |
| --- | --- |
| Svart skärm | `systemctl status pv-frontend` och `journalctl -u pv-frontend` |
| "Ansluter…" fastnar | Kontrollera `inverters.json` och nätverk till omformarna |
| Ingen data / offline-prickar | Verifiera Modbus-register i `docs/MODBUS.md` |
| Testa utan omformare | Sätt `MOCK=1` i `backend/.env` och `systemctl restart pv-backend` |

## Så syns fel på skärmen (för betraktaren)

Gränssnittet döljer aldrig ett fel – det visar det tydligt utan att störa helheten:

- **Röd/gul prick** på en omformare i SOS-/RSYD-vyn = den omformaren svarar inte.
  Kortet tonas också ned.
- **Gul banner högst upp:** ”*N av M omformare offline*” = backenden når inte
  Modbus på en eller flera omformare. Effekten visas som 0 kW men energisummorna
  (idag/år/totalt) behålls från senast kända värde.
- **Röd banner högst upp:** ”*Ingen kontakt med servern*” = skärmen når inte
  backenden alls (visar senast kända värden + tidsstämpel).
- **Sidfoten** visar alltid **”Uppdaterad HH:MM:SS”**. Står klockslaget stilla vet
  du direkt att datan är gammal.

## Läsa loggarna (för administratören)

All loggning går via **systemd/journald**. Vanliga kommandon:

```bash
# Live-logg för backenden (Modbus-pollern) – visar t.ex.
#   [poller] sos-1 kunde inte läsas: connect ECONNREFUSED <ip>:1502
sudo journalctl -u pv-backend -f

# Live-logg för frontenden (Vite preview-servern)
sudo journalctl -u pv-frontend -f

# Senaste 200 raderna, eller sedan ett visst klockslag
sudo journalctl -u pv-backend -n 200 --no-pager
sudo journalctl -u pv-backend --since "today"
sudo journalctl -u pv-backend --since "2026-08-21 08:00"

# Bara fel/varningar
sudo journalctl -u pv-backend -p warning

# Status (kör tjänsten? senaste rader? senaste omstart?)
systemctl status pv-backend pv-frontend
```

> Obs: journald är satt till `Storage=volatile` (skrivs i RAM för att skona disken),
> så loggarna **nollställs vid omstart**. Använd `-f` medan felet pågår.

Snabb hälsokoll direkt mot API:et (visar vad skärmen ser):

```bash
curl -s http://localhost:3000/api/health            # {"status":"ok",...}
curl -s http://localhost:3000/api/data | less        # invertersOnline / invertersTotal per omformare
```

Testa en enskild omformare på Modbus-nivå (se även `../docs/MODBUS.md`):

```bash
sudo apt install -y mbpoll
mbpoll -t 4:float -r 173 -a 71 -p 1502 <omformarens-ip>
```


## Uppdatera efter installation (deploy)

`/opt/pvmonitor` är en git-checkout, så uppdateringar hämtas med `git pull` och
tjänsterna startas om. Eftersom passwordless sudo är borttaget körs en
**engångsinstallation** som ger driftanvändaren (`smartsource`) rätt att köra
**enbart** deploy-skriptet utan lösenord.

**Engångsinstallation (kräver root-lösenordet en gång):**

```bash
su -c 'cd /opt/pvmonitor \
  && git config --global --add safe.directory /opt/pvmonitor \
  && git pull --ff-only \
  && bash deploy/setup-deploy-sudo.sh smartsource \
  && bash deploy/update.sh'
```

Detta hämtar senaste koden, installerar `/usr/local/sbin/pvmonitor-update`
(root-ägt) samt en `sudoers.d`-regel, och kör en första driftsättning.

**Därefter – varje uppdatering (inget lösenord):**

```bash
ssh smartsource@172.22.2.81 'sudo pvmonitor-update'
```

Skriptet gör `git pull`, `npm install`, bygger frontenden, återställer ägarskap
till `kiosk` och startar om `pv-backend` + `pv-frontend`. Runtime-filer
(`.env`, `config/auth.json`, `config/backup.json`, `data/`) rörs inte – de är
git-ignorerade.

> Ändras `deploy/update.sh` i repot, kör `setup-deploy-sudo.sh` igen för att
> uppdatera den root-ägda kopian i `/usr/local/sbin/pvmonitor-update`.

## Fjärrstyrning

Installera Tailscale för utgående VPN-tunnel så att du kan SSH:a hemifrån:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
