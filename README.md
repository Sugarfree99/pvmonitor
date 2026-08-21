# PV Monitor — KOSTAL Solcellsskärm

Autonom informationsskärm som visar realtidsstatistik från tre lokala KOSTAL-omformare:

- **SOS-anläggningen:** 2 × KOSTAL CI 30
- **RSYD-anläggningen:** 1 × KOSTAL CI 100

Systemet kör på en Beelink Mini S (Debian Stable) i kiosk-läge och är byggt för att
starta helt autonomt efter strömavbrott utan handpåläggning.

## Arkitektur

| Skikt      | Teknik                         | Uppgift                                                       |
| ---------- | ------------------------------ | ------------------------------------------------------------ |
| Backend    | Node.js / Express              | Pollar KOSTAL via Modbus TCP, exponerar internt JSON-API.    |
| Lagring    | SQLite (RAM-disk `/tmpfs`)     | Skriver var 10:e sek i RAM, synkas till disk 1 gång/min.     |
| Frontend   | React (Vite SPA)               | Karusellvy som roterar mellan 3 vyer var 15:e sekund.        |
| Kiosk      | Chromium + Openbox (Debian)    | Fullskärm utan menyer, muspekare eller felmeddelanden.       |

### Datavyer (karusell, 15 s rotation)

1. **Huvudöversikt** — total effekt nu, energi idag (kWh), i år (MWh), totalt producerat, total minskad CO₂.
2. **SOS** — de två KOSTAL CI 30 sida vid sida med individuella mätvärden.
3. **RSYD** — den stora KOSTAL CI 100 separat.

## Projektstruktur

```
PV_Monitor/
├── backend/            Node.js/Express + Modbus-poller + SQLite
│   ├── src/
│   └── config/inverters.json   ← IP-adresser & Modbus-register per omformare
├── frontend/           React (Vite) kiosk-SPA
│   └── src/
└── deploy/             Debian-installation (systemd, openbox, lightdm)
```

## Lokal utveckling

```bash
# Backend
cd backend
npm install
npm run dev            # startar API på http://localhost:3000

# Frontend (nytt terminalfönster)
cd frontend
npm install
npm run dev            # startar SPA på http://localhost:5173
```

Backenden kan köras utan fysiska omformare genom att sätta `MOCK=1` i miljön —
då genereras syntetisk data så att gränssnittet kan utvecklas offline.

```bash
MOCK=1 npm run dev
```

## Konfiguration av omformare

All hårdvarukonfiguration ligger i [`backend/config/inverters.json`](backend/config/inverters.json).
Fyll i varje omformares IP-adress, Modbus-port och unit-ID. Se filens kommentarer och
[`docs/MODBUS.md`](docs/MODBUS.md) för registerkartan.

## Driftsättning på Beelink (Debian)

Se [`deploy/README.md`](deploy/README.md) för fullständig installation (BIOS, LightDM,
Openbox-autostart, systemd-tjänster och hårdvaru-watchdog).

Snabbversion på en färdiginstallerad Debian:

```bash
git clone https://github.com/Sugarfree99/pvmonitor.git /opt/pvmonitor
cd /opt/pvmonitor/deploy
sudo ./install.sh
```
