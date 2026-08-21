// KOSTAL Modbus TCP-simulator.
//
// Startar en Modbus TCP-server per omformare (från config/inverters.sim.json) och
// svarar med samma holding-register som en riktig KOSTAL-omformare. Backenden
// pollar simulatorn via EXAKT samma Modbus-kod som i produktion – skillnaden är
// bara vilken config (IP-adresser) som används.
//
// Vid driftsättning: peka backenden mot config/inverters.json med riktiga IP:n
// och stäng av simulatorn. Ingen kodändring behövs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import ModbusPkg from "modbus-serial";
import { getProfile } from "../src/modbus/registerProfiles.js";

const { ServerTCP } = ModbusPkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveConfigPath() {
  const arg = process.argv[2] ?? process.env.INVERTERS_CONFIG;
  const fallback = join(__dirname, "..", "config", "inverters.sim.json");
  if (!arg) return fallback;
  return isAbsolute(arg) ? arg : join(process.cwd(), arg);
}

const config = JSON.parse(readFileSync(resolveConfigPath(), "utf-8"));

function ratedPowerW(model = "") {
  if (model.includes("100")) return 100_000;
  if (model.includes("50")) return 50_000;
  return 30_000;
}

// Klockkurva över dygnet: 0 på natten, topp runt kl 13.
function solarFactor(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (hour <= 5 || hour >= 21) return 0;
  return Math.exp(-((hour - 13) ** 2) / (2 * 3.5 ** 2));
}

// Kodar ett värde till ett eller två 16-bitars holding-register enligt profilens
// datatyp. Speglar avkodningen i src/modbus/kostal.js.
function encode(regs, metric, wordSwap, value) {
  const { address, type } = metric;
  const scaled = value / (metric.scale ?? 1);

  if (type === "int16" || type === "uint16") {
    const buf = Buffer.alloc(2);
    if (type === "int16") buf.writeInt16BE(Math.round(scaled) | 0, 0);
    else buf.writeUInt16BE(Math.round(scaled) & 0xffff, 0);
    regs[address] = buf.readUInt16BE(0);
    return;
  }

  const buf = Buffer.alloc(4);
  if (type === "float32") buf.writeFloatBE(scaled, 0);
  else if (type === "int32") buf.writeInt32BE(Math.round(scaled) | 0, 0);
  else if (type === "uint32") buf.writeUInt32BE(Math.round(scaled) >>> 0, 0);
  else throw new Error(`Simulator saknar stöd för typ: ${type}`);

  let hi = buf.readUInt16BE(0);
  let lo = buf.readUInt16BE(2);
  if (wordSwap) [hi, lo] = [lo, hi];
  regs[address] = hi;
  regs[address + 1] = lo;
}

class SimulatedInverter {
  constructor(inverter) {
    this.inverter = inverter;
    this.profile = getProfile(inverter.profile);
    this.rated = ratedPowerW(inverter.model);
    this.regs = new Array(1024).fill(0);

    // Startvärden så att totalsummorna ser realistiska ut direkt.
    this.energyTotalWh = this.rated * 3200; // ~livstidsproduktion
    this.energyYearWh = this.rated * 1100;
    this.energyTodayWh = this.rated * 2.5;
    this.dayKey = new Date().toDateString();
    this.lastTick = Date.now();

    this.update();

    const wordSwap = this.profile.wordSwap ?? false;
    const vector = {
      getHoldingRegister: (addr) => this.regs[addr] ?? 0,
      getInputRegister: (addr) => this.regs[addr] ?? 0
    };
    this._wordSwap = wordSwap;

    this.server = new ServerTCP(vector, {
      host: inverter.host,
      port: inverter.port,
      unitID: inverter.unitId,
      debug: false
    });
    this.server.on("socketError", () => {});
    this.server.on("serverError", (e) =>
      console.error(`[sim ${inverter.id}] serverfel: ${e.message}`)
    );
    this.server.on("initialized", () =>
      console.log(
        `[sim ${inverter.id}] ${inverter.model} lyssnar på ${inverter.host}:${inverter.port} (unit ${inverter.unitId})`
      )
    );
  }

  update() {
    const now = Date.now();
    const dtSec = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // Nollställ dagens energi vid midnatt.
    const todayKey = new Date().toDateString();
    if (todayKey !== this.dayKey) {
      this.dayKey = todayKey;
      this.energyTodayWh = 0;
    }

    const factor = solarFactor();
    const jitter = 0.92 + Math.random() * 0.16;
    const powerW = Math.max(0, this.rated * factor * jitter);

    const producedWh = (powerW * dtSec) / 3600;
    this.energyTodayWh += producedWh;
    this.energyYearWh += producedWh;
    this.energyTotalWh += producedWh;

    const { metrics } = this.profile;
    const values = {
      powerW,
      energyTodayWh: this.energyTodayWh,
      energyYearWh: this.energyYearWh,
      energyTotalWh: this.energyTotalWh
    };
    for (const [name, metric] of Object.entries(metrics)) {
      if (values[name] !== undefined) {
        encode(this.regs, metric, this._wordSwap, values[name]);
      }
    }
  }
}

const inverters = config.sites.flatMap((site) => site.inverters);
const sims = inverters.map((inv) => new SimulatedInverter(inv));

// Uppdatera registervärdena en gång per sekund.
const ticker = setInterval(() => sims.forEach((s) => s.update()), 1000);

console.log(`[sim] KOSTAL-simulator startad med ${sims.length} omformare.`);

function shutdown() {
  clearInterval(ticker);
  for (const s of sims) {
    try {
      s.server.close(() => {});
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
