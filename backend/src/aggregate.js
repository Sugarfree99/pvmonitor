import { config } from "./config.js";
import { getAllLatest } from "./db.js";

const WH_PER_KWH = 1000;

function co2Kg(energyWh) {
  return (energyWh / WH_PER_KWH) * config.co2FactorKgPerKwh;
}

function sum(list, key) {
  return list.reduce((acc, item) => acc + (item[key] ?? 0), 0);
}

// Bygger hela API-svaret utifrån senaste lagrade värden och konfigurationens
// struktur (så att ordning och namn följer inverters.json).
export function buildSnapshot() {
  const latestRows = getAllLatest();
  const byId = new Map(latestRows.map((row) => [row.inverter_id, row]));

  const sites = config.sites.map((site) => {
    const inverters = site.inverters.map((inv) => {
      const row = byId.get(inv.id);
      return {
        id: inv.id,
        name: inv.name,
        model: inv.model,
        online: row ? Boolean(row.online) : false,
        powerW: row?.power_w ?? 0,
        energyTodayWh: row?.energy_today_wh ?? 0,
        energyYearWh: row?.energy_year_wh ?? 0,
        energyTotalWh: row?.energy_total_wh ?? 0,
        updatedAt: row?.updated_at ?? null
      };
    });

    const energyTotalWh = sum(inverters, "energyTotalWh");
    return {
      id: site.id,
      name: site.name,
      powerW: sum(inverters, "powerW"),
      energyTodayWh: sum(inverters, "energyTodayWh"),
      energyYearWh: sum(inverters, "energyYearWh"),
      energyTotalWh,
      co2SavedKg: co2Kg(energyTotalWh),
      inverters
    };
  });

  const energyTotalWh = sum(sites, "energyTotalWh");
  const totals = {
    powerW: sum(sites, "powerW"),
    energyTodayWh: sum(sites, "energyTodayWh"),
    energyYearWh: sum(sites, "energyYearWh"),
    energyTotalWh,
    co2SavedKg: co2Kg(energyTotalWh)
  };

  return {
    updatedAt: new Date().toISOString(),
    co2FactorKgPerKwh: config.co2FactorKgPerKwh,
    totals,
    sites
  };
}
