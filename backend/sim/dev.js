// Startar simulatorn + backenden tillsammans för lokal utveckling/demo.
//   npm run dev:sim
// Backenden pekas mot config/inverters.sim.json och pollar simulatorn via
// riktig Modbus TCP – samma kodväg som mot fysiska omformare.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");

function run(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: backendDir,
    env: { ...process.env, ...env },
    stdio: "inherit"
  });
  child.on("exit", (code) => {
    console.log(`[dev:sim] ${name} avslutades (kod ${code}) – stänger allt.`);
    shutdown();
  });
  return child;
}

let children = [];
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

const sim = run("simulator", ["sim/kostalSimulator.js"], {});
children.push(sim);

// Ge simulatorn ett litet försprång innan backenden börjar poll:a.
setTimeout(() => {
  const backend = run("backend", ["src/index.js"], {
    INVERTERS_CONFIG: "config/inverters.sim.json",
    MOCK: "0"
  });
  children.push(backend);
}, 1500);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
