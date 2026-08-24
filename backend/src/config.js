import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveConfigPath() {
  const fromEnv = process.env.INVERTERS_CONFIG;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(__dirname, "..", "config", "inverters.json");
}

const configPath = resolveConfigPath();

function loadRaw() {
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

const raw = loadRaw();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  // Hur ofta omformarna pollas (ms)
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  // Sökväg till SQLite-databasen. På Beelink pekas denna mot en RAM-disk.
  dbPath: process.env.DB_PATH ?? join(__dirname, "..", "data", "pvmonitor.sqlite"),
  // Beständig disk-backup av RAM-databasen (återläses vid uppstart).
  dbBackupPath: process.env.DB_BACKUP_PATH ?? null,
  // Mock-läge genererar syntetisk data utan fysiska omformare.
  mock: process.env.MOCK === "1" || process.env.MOCK === "true",
  // Aktiv konfigurationsfil (redigeras av admin-gränssnittet).
  configPath,
  co2FactorKgPerKwh: Number(raw.co2FactorKgPerKwh ?? 0.4),
  sites: raw.sites ?? []
};

// Läser om omformarkonfigurationen från fil (efter att admin sparat) och
// uppdaterar det delade config-objektet så pollern/aggregeringen tar nya värden.
export function reloadConfig() {
  const r = loadRaw();
  config.co2FactorKgPerKwh = Number(r.co2FactorKgPerKwh ?? 0.4);
  config.sites = r.sites ?? [];
  return config;
}

// Alla aktiverade omformare (avaktiverade hoppas över helt).
export function allInverters() {
  return config.sites.flatMap((site) =>
    (site.inverters ?? [])
      .filter((inv) => inv.enabled !== false)
      .map((inv) => ({ ...inv, siteId: site.id, siteName: site.name }))
  );
}
