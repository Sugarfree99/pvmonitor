# Modbus-registerkarta (KOSTAL CI)

Backenden läser fyra värden per omformare via **Modbus TCP** (funktionskod 03,
holding-register):

| Metrik           | Beskrivning                          | Enhet |
| ---------------- | ------------------------------------ | ----- |
| `powerW`         | Aktuell total AC-effekt              | W     |
| `energyTodayWh`  | Producerad energi idag               | Wh    |
| `energyYearWh`   | Producerad energi i år               | Wh    |
| `energyTotalWh`  | Totalt producerad energi             | Wh    |

## ⚠️ Verifiera adresserna

Standardadresserna i [`../backend/src/modbus/registerProfiles.js`](../backend/src/modbus/registerProfiles.js)
följer KOSTAL:s **float32**-registerkarta (PIKO IQ / PLENTICORE / PIKO CI). De
**måste verifieras** mot KOSTAL:s officiella *"Modbus TCP interface"*-dokument för
**CI 30** respektive **CI 100** innan produktion, eftersom registerlayouten kan
skilja sig mellan modeller/firmware.

Nuvarande standard:

| Metrik          | Adress | Typ     |
| --------------- | ------ | ------- |
| `powerW`        | 172    | float32 |
| `energyTotalWh` | 320    | float32 |
| `energyYearWh`  | 322    | float32 |
| `energyTodayWh` | 326    | float32 |

Standard-anslutning: **port 1502**, **unit-ID 71**.

## Så här justerar du

1. Öppna KOSTAL:s Modbus-dokument och slå upp rätt registeradress + datatyp.
2. Ändra i `registerProfiles.js`. Datatyper som stöds:
   `float32`, `int32`, `uint32`, `int16`, `uint16`.
3. Använd `scale` om värdet har en skalfaktor (t.ex. `{ address: 100, type: "int32", scale: 0.1 }`).
4. Sätt `wordSwap: true` om de två 16-bitsorden är omkastade (little-endian).
5. Starta om backenden: `sudo systemctl restart pv-backend`.

## Aktivera Modbus i omformaren

Modbus TCP måste aktiveras i varje KOSTAL-omformares webbgränssnitt
(*Inställningar → Modbus / SunSpec*). Notera IP-adress, port och unit-ID och för
in dem i [`../backend/config/inverters.json`](../backend/config/inverters.json).

## Testa en enskild omformare

```bash
# Läs 2 register från adress 172 (unit-ID 71) på angiven IP
sudo apt install -y mbpoll
mbpoll -t 4 -r 173 -c 2 -0 -a 71 -p 1502 <omformarens-ip>
```
