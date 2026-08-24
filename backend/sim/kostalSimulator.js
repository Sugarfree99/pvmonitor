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
import http from "node:http";
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
    this._wordSwap = wordSwap;
    this._vector = {
      getHoldingRegister: (addr) => this.regs[addr] ?? 0,
      getInputRegister: (addr) => this.regs[addr] ?? 0
    };

    this.online = true;
    this.server = null;
    this.openServer();
  }

  openServer() {
    if (this.server) return;
    const inv = this.inverter;
    this.server = new ServerTCP(this._vector, {
      host: inv.host,
      port: inv.port,
      unitID: inv.unitId,
      debug: false
    });
    this.server.on("socketError", () => {});
    this.server.on("serverError", (e) =>
      console.error(`[sim ${inv.id}] serverfel: ${e.message}`)
    );
    this.server.on("initialized", () =>
      console.log(
        `[sim ${inv.id}] ${inv.model} lyssnar på ${inv.host}:${inv.port} (unit ${inv.unitId})`
      )
    );
  }

  closeServer() {
    if (!this.server) return;
    try {
      this.server.close(() => {});
    } catch {
      /* ignore */
    }
    this.server = null;
  }

  // Sätter omformaren i/ur drift. Ur drift = Modbus-servern stängs, så backendens
  // poller får anslutningsfel och markerar omformaren som offline.
  setOnline(on) {
    if (on === this.online) return;
    this.online = on;
    if (on) {
      this.openServer();
      console.log(`[sim ${this.inverter.id}] åter i drift (online)`);
    } else {
      this.closeServer();
      console.log(`[sim ${this.inverter.id}] tagen ur drift (offline)`);
    }
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
const simById = new Map(sims.map((s) => [s.inverter.id, s]));

// Uppdatera registervärdena en gång per sekund.
const ticker = setInterval(() => sims.forEach((s) => s.update()), 1000);

console.log(`[sim] KOSTAL-simulator startad med ${sims.length} omformare.`);

// --- Kontrollpanel: slå enskilda omformare i/ur drift från webbläsaren ---
const controlPort = Number(process.env.SIM_CONTROL_PORT ?? 4000);

const PANEL_HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simulatorkontroll</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;background:#0a0f1e;color:#eef2fb;margin:0;padding:2rem}
  h1{font-size:1.4rem;margin:0 0 .3rem}
  p{color:#93a0bd;margin:.2rem 0 1.5rem}
  .row{display:flex;align-items:center;gap:1rem;background:rgba(255,255,255,.05);
    border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:1rem 1.2rem;margin-bottom:.8rem}
  .dot{width:14px;height:14px;border-radius:50%}
  .on{background:#34d399;box-shadow:0 0 12px #34d399}
  .off{background:#f87171;box-shadow:0 0 12px #f87171}
  .name{font-weight:700;font-size:1.1rem}
  .model{color:#93a0bd;font-size:.9rem}
  .spacer{flex:1}
  button{border:0;border-radius:10px;padding:.6rem 1.1rem;font-size:1rem;font-weight:600;cursor:pointer}
  .b-off{background:#f87171;color:#3a0d0d}
  .b-on{background:#34d399;color:#06331f}
  .bar{display:flex;gap:.6rem;margin-bottom:1.4rem}
  .bar button{background:#243056;color:#eef2fb}
</style></head><body>
<h1>KOSTAL-simulator – driftkontroll</h1>
<p>Slå omformare i eller ur drift. Ur drift = Modbus stängs och skärmen markerar den som offline.</p>
<div class="bar">
  <button onclick="setAll(1)">Alla i drift</button>
  <button onclick="setAll(0)">Alla ur drift</button>
</div>
<div id="list"></div>
<script>
async function load(){
  const r = await fetch('/api/status'); const d = await r.json();
  document.getElementById('list').innerHTML = d.map(function(s){
    return '<div class="row"><span class="dot '+(s.online?'on':'off')+'"></span>'+
      '<div><div class="name">'+s.name+' <span class="model">'+s.model+' · '+s.id+'</span></div></div>'+
      '<div class="spacer"></div>'+
      (s.online
        ? '<button class="b-off" onclick="setOne(\\''+s.id+'\\',0)">Ta ur drift</button>'
        : '<button class="b-on" onclick="setOne(\\''+s.id+'\\',1)">Sätt i drift</button>')+
      '</div>';
  }).join('');
}
async function setOne(id,on){ await fetch('/api/set?id='+id+'&on='+on); load(); }
async function setAll(on){ await fetch('/api/set?id=all&on='+on); load(); }
load(); setInterval(load, 2000);
</script></body></html>`;

const controlServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${controlPort}`);
  if (url.pathname === "/api/set") {
    const id = url.searchParams.get("id");
    const on = url.searchParams.get("on") === "1";
    if (id === "all") sims.forEach((s) => s.setOnline(on));
    else simById.get(id)?.setOnline(on);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        sims.map((s) => ({
          id: s.inverter.id,
          name: s.inverter.name,
          model: s.inverter.model,
          online: s.online
        }))
      )
    );
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PANEL_HTML);
});
controlServer.listen(controlPort, () =>
  console.log(`[sim] kontrollpanel: http://localhost:${controlPort}`)
);

function shutdown() {
  clearInterval(ticker);
  controlServer.close();
  for (const s of sims) s.closeServer();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
