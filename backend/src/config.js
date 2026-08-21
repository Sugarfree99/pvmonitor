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

const raw = JSON.parse(readFileSync(resolveConfigPath(), "utf-8"));

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  // Hur ofta omformarna pollas (ms)
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  // Sökväg till SQLite-databasen. På Beelink pekas denna mot en RAM-disk.
  dbPath: process.env.DB_PATH ?? join(__dirname, "..", "data", "pvmonitor.sqlite"),
  // Mock-läge genererar syntetisk data utan fysiska omformare.
  mock: process.env.MOCK === "1" || process.env.MOCK === "true",
  co2FactorKgPerKwh: Number(raw.co2FactorKgPerKwh ?? 0.4),
  sites: raw.sites ?? []
};

export function allInverters() {
  return config.sites.flatMap((site) =>
    site.inverters.map((inv) => ({ ...inv, siteId: site.id, siteName: site.name }))
  );
}
