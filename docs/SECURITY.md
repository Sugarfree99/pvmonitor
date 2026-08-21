# Säkerhet & känsliga uppgifter

## Var läggs inloggningsuppgifter och känslig data?

**Allt känsligt läggs i `backend/.env`** – aldrig i versionshanterade filer.

| Var | Vad | Committas? |
| --- | --- | --- |
| `backend/.env` | Lösenord, API-nycklar, tokens, auth-keys | ❌ Nej (gitignorerad) |
| `backend/.env.example` | Mall med tomma variabelnamn | ✅ Ja |
| `backend/config/inverters.json` | IP, port, unit-ID (icke-hemligt) | ✅ Ja |

`.env` är redan med i [`../.gitignore`](../.gitignore) och kan inte råka checkas in.

## Är någon autentisering nödvändig?

**Modbus TCP är oautentiserat.** KOSTAL-omformarna kräver normalt inga
inloggningsuppgifter för att läsas via Modbus – det räcker att Modbus/SunSpec är
aktiverat i omformarens webbgränssnitt. I standardfallet behöver du alltså bara
fylla i **IP-adress** per omformare.

`.env` innehåller ändå förberedda (utkommenterade) platshållare ifall en framtida
funktion skulle kräva t.ex. portalinloggning eller API-token.

## Så här hanterar du hemligheter på Beelink

```bash
# 1. Skapa .env från mallen (görs av install.sh om den saknas)
cp /opt/pvmonitor/backend/.env.example /opt/pvmonitor/backend/.env

# 2. Fyll i ev. hemligheter
sudo nano /opt/pvmonitor/backend/.env

# 3. Lås filen så bara kiosk-användaren kan läsa den
sudo chown kiosk:kiosk /opt/pvmonitor/backend/.env
sudo chmod 600 /opt/pvmonitor/backend/.env

# 4. Ladda om tjänsten
sudo systemctl restart pv-backend
```

Systemd laddar `.env` via `EnvironmentFile=` i
[`../deploy/pv-backend.service`](../deploy/pv-backend.service).

## Vid driftsättning – checklista

Detta är allt som behöver ändras för att gå från simulering till skarp drift:

1. **IP-adresser:** fyll i riktiga IP:n i `backend/config/inverters.json`
   (verifiera `port` 1502 och `unitId` 71).
2. **Ev. autentisering:** endast om det behövs – lägg hemligheter i `backend/.env`.
3. **Registerkarta:** verifiera adresserna mot KOSTAL:s Modbus-dokument, se
   [`MODBUS.md`](MODBUS.md).
4. Se till att `INVERTERS_CONFIG` **inte** pekar på `inverters.sim.json` i `.env`.
5. Stäng av simulatorn (den ska aldrig köras i produktion).

## Fjärraccess

För fjärrstyrning (Tailscale/WireGuard) – lagra auth-nycklar i VPN-tjänstens eget
säkra förvar, inte i repot. Se [`../deploy/README.md`](../deploy/README.md).
