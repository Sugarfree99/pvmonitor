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
  xorg openbox chromium lightdm unclutter git nodejs npm curl
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
- konfigurerar LightDM autologin, Openbox autostart och Chromium kiosk,
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
öppnar Chromium i fullskärm mot `http://localhost:5173`.

## Felsökning

| Symptom | Åtgärd |
| --- | --- |
| Svart skärm | `systemctl status pv-frontend` och `journalctl -u pv-frontend` |
| "Ansluter…" fastnar | Kontrollera `inverters.json` och nätverk till omformarna |
| Ingen data / offline-prickar | Verifiera Modbus-register i `docs/MODBUS.md` |
| Testa utan omformare | Sätt `MOCK=1` i `backend/.env` och `systemctl restart pv-backend` |

## Fjärrstyrning

Installera Tailscale för utgående VPN-tunnel så att du kan SSH:a hemifrån:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
