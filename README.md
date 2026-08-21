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
│   ├── sim/            KOSTAL Modbus-simulator (för test före driftsättning)
│   └── config/
│       ├── inverters.json       ← PRODUKTION: riktiga IP-adresser
│       └── inverters.sim.json   ← SIMULERING: pekar mot lokala simulatorn
├── frontend/           React (Vite) kiosk-SPA
│   └── src/
├── deploy/             Debian-installation (systemd, openbox, lightdm)
└── docs/               MODBUS.md (registerkarta), SECURITY.md (hemligheter)
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

## Simulering av omformarna (rekommenderas före driftsättning)

Innan de fysiska omformarna är tillgängliga körs en inbyggd **KOSTAL Modbus
TCP-simulator** som emulerar alla tre omformarna lokalt. Backenden pollar
simulatorn via **exakt samma Modbus-kod** som mot riktig hårdvara – enda
skillnaden är vilken config (IP-adresser) som används.

```bash
cd backend
npm install
npm run dev:sim        # startar simulator + backend tillsammans

# i ett nytt fönster:
cd frontend && npm run dev
```

Simulatorn genererar realistiska värden som följer en solkurva över dygnet.

**Vid driftsättning** behöver du bara:

1. Fylla i riktiga IP-adresser i [`backend/config/inverters.json`](backend/config/inverters.json).
2. Lägga in ev. hemligheter i `backend/.env` (se nedan).
3. Låta bli att starta simulatorn.

Ingen kodändring krävs. Enklare fallback utan Modbus finns via `MOCK=1`.

## Var läggs inloggningsuppgifter och känslig data?

**I `backend/.env`** (gitignorerad, committas aldrig) – aldrig i `inverters.json`.
Modbus TCP är normalt oautentiserat, så oftast behövs inga inloggningsuppgifter
alls. Se [`docs/SECURITY.md`](docs/SECURITY.md) för fullständig beskrivning.


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
