import { config, allInverters } from "./config.js";
import { readInverter } from "./modbus/kostal.js";
import { mockReading } from "./mock.js";
import { saveReading, getLatestById } from "./db.js";

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
