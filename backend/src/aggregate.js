import { config } from "./config.js";
import { getAllLatest, getHourlySince, hourBucket } from "./db.js";
import { getFooter } from "./footer.js";

const WH_PER_KWH = 1000;

function co2Kg(energyWh) {
  return (energyWh / WH_PER_KWH) * config.co2FactorKgPerKwh;
}

// Installerad märkeffekt (W) härledd ur modellnamnet (KOSTAL CI 30/50/100).
function ratedPowerW(model = "") {
  if (model.includes("100")) return 100_000;
  if (model.includes("50")) return 50_000;
  return 30_000;
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
    const inverters = (site.inverters ?? [])
      .filter((inv) => inv.enabled !== false)
      .map((inv) => {
        const row = byId.get(inv.id);
        return {
          id: inv.id,
          name: inv.name,
          model: inv.model,
          capacityW: inv.capacityW ? Number(inv.capacityW) : ratedPowerW(inv.model),
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
      capacityW: sum(inverters, "capacityW"),
      powerW: sum(inverters, "powerW"),
      energyTodayWh: sum(inverters, "energyTodayWh"),
      energyYearWh: sum(inverters, "energyYearWh"),
      energyTotalWh,
      co2SavedKg: co2Kg(energyTotalWh),
      invertersOnline: inverters.filter((i) => i.online).length,
      invertersTotal: inverters.length,
      inverters
    };
  });

  const energyTotalWh = sum(sites, "energyTotalWh");
  const invertersOnline = sum(sites, "invertersOnline");
  const invertersTotal = sum(sites, "invertersTotal");
  const totals = {
    capacityW: sum(sites, "capacityW"),
    powerW: sum(sites, "powerW"),
    energyTodayWh: sum(sites, "energyTodayWh"),
    energyYearWh: sum(sites, "energyYearWh"),
    energyTotalWh,
    co2SavedKg: co2Kg(energyTotalWh),
    invertersOnline,
    invertersTotal
  };

  return {
    updatedAt: new Date().toISOString(),
    co2FactorKgPerKwh: config.co2FactorKgPerKwh,
    invertersOnline,
    invertersTotal,
    allOnline: invertersOnline === invertersTotal,
    totals,
    sites,
    footerLogos: getFooter().logos
  };
}

// Bygger de senaste `hours` timmarnas produktion (kWh) för totalen och per
// anläggning, med tomma timmar utfyllda som noll så stapeldiagrammet blir jämnt.
export function buildHistory(hours = 24) {
  const now = new Date();
  const sinceMs = now.getTime() - (hours - 1) * 3600 * 1000;
  const rows = getHourlySince(hourBucket(new Date(sinceMs)));

  const map = new Map(); // bucket -> { __all__, siteId: wh }
  for (const r of rows) {
    if (!map.has(r.bucket)) map.set(r.bucket, {});
    map.get(r.bucket)[r.site_id] = r.produced_wh;
  }

  const out = [];
  for (let i = 0; i < hours; i++) {
    const d = new Date(sinceMs + i * 3600 * 1000);
    const bucket = hourBucket(d);
    const entry = map.get(bucket) ?? {};
    const bySite = {};
    for (const site of config.sites) {
      bySite[site.id] = (entry[site.id] ?? 0) / WH_PER_KWH;
    }
    out.push({
      bucket,
      hour: d.getHours(),
      isCurrent: bucket === hourBucket(now),
      kwh: (entry.__all__ ?? 0) / WH_PER_KWH,
      bySite
    });
  }

  const maxKwh = out.reduce((m, h) => Math.max(m, h.kwh), 0);
  return { hours: out, maxKwh };
}
