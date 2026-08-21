import { config, allInverters } from "./config.js";
import { readInverter } from "./modbus/kostal.js";
import { mockReading } from "./mock.js";
import {
  saveReading,
  getLatestById,
  getAllLatest,
  addProduction,
  pruneHourly,
  hourBucket
} from "./db.js";

async function pollOne(inverter) {
  const base = {
    inverterId: inverter.id,
    siteId: inverter.siteId,
    name: inverter.name,
    model: inverter.model
  };

  try {
    const data = config.mock ? mockReading(inverter) : await readInverter(inverter);
    saveReading({ ...base, ...data });
  } catch (err) {
    // Feltolerant: en offline omformare får inte fälla systemet. Behåll senaste
    // energivärden men markera som offline och nolla effekten.
    console.warn(`[poller] ${inverter.id} kunde inte läsas: ${err.message}`);
    const prev = getLatestById(inverter.id);
    saveReading({
      ...base,
      online: false,
      powerW: 0,
      energyTodayWh: prev?.energy_today_wh ?? 0,
      energyYearWh: prev?.energy_year_wh ?? 0,
      energyTotalWh: prev?.energy_total_wh ?? 0
    });
  }
}

async function pollAll() {
  const inverters = allInverters();
  await Promise.allSettled(inverters.map(pollOne));
  recordProduction();
}

// Integrerar aktuell effekt över tid till timvis producerad energi (Wh) per
// anläggning + totalen, för stapeldiagrammet.
let lastRecordMs = Date.now();

function recordProduction() {
  const now = Date.now();
  // Begränsa dt så en paus/omstart inte ger orimliga hopp.
  const dtSec = Math.min((now - lastRecordMs) / 1000, (config.pollIntervalMs / 1000) * 3);
  lastRecordMs = now;
  if (dtSec <= 0) return;

  const bucket = hourBucket(new Date());
  const rows = getAllLatest();
  const bySite = {};
  let total = 0;
  for (const r of rows) {
    const w = r.online ? r.power_w : 0;
    bySite[r.site_id] = (bySite[r.site_id] ?? 0) + w;
    total += w;
  }
  for (const [siteId, w] of Object.entries(bySite)) {
    addProduction(bucket, siteId, (w * dtSec) / 3600);
  }
  addProduction(bucket, "__all__", (total * dtSec) / 3600);

  // Behåll ~3 dygns historik.
  pruneHourly(hourBucket(new Date(now - 3 * 24 * 3600 * 1000)));
}

let timer = null;

export function startPoller() {
  const mode = config.mock ? "MOCK" : "Modbus TCP";
  console.log(
    `[poller] startar (${mode}), ${allInverters().length} omformare, intervall ${config.pollIntervalMs} ms`
  );
  pollAll();
  timer = setInterval(pollAll, config.pollIntervalMs);
}

export function stopPoller() {
  if (timer) clearInterval(timer);
}
