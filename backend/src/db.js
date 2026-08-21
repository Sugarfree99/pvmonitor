import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS latest (
    inverter_id     TEXT PRIMARY KEY,
    site_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    model           TEXT NOT NULL,
    online          INTEGER NOT NULL DEFAULT 0,
    power_w         REAL NOT NULL DEFAULT 0,
    energy_today_wh REAL NOT NULL DEFAULT 0,
    energy_year_wh  REAL NOT NULL DEFAULT 0,
    energy_total_wh REAL NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO latest (inverter_id, site_id, name, model, online, power_w,
                      energy_today_wh, energy_year_wh, energy_total_wh, updated_at)
  VALUES (@inverterId, @siteId, @name, @model, @online, @powerW,
          @energyTodayWh, @energyYearWh, @energyTotalWh, @updatedAt)
  ON CONFLICT(inverter_id) DO UPDATE SET
    site_id         = excluded.site_id,
    name            = excluded.name,
    model           = excluded.model,
    online          = excluded.online,
    power_w         = excluded.power_w,
    energy_today_wh = excluded.energy_today_wh,
    energy_year_wh  = excluded.energy_year_wh,
    energy_total_wh = excluded.energy_total_wh,
    updated_at      = excluded.updated_at
`);

export function saveReading(reading) {
  upsertStmt.run({
    inverterId: reading.inverterId,
    siteId: reading.siteId,
    name: reading.name,
    model: reading.model,
    online: reading.online ? 1 : 0,
    powerW: reading.powerW ?? 0,
    energyTodayWh: reading.energyTodayWh ?? 0,
    energyYearWh: reading.energyYearWh ?? 0,
    energyTotalWh: reading.energyTotalWh ?? 0,
    updatedAt: new Date().toISOString()
  });
}

const selectAllStmt = db.prepare(`SELECT * FROM latest`);

export function getAllLatest() {
  return selectAllStmt.all();
}

// Backar RAM-databasen till beständig disk (anropas periodiskt av backuparen).
export function backupTo(targetPath) {
  return db.backup(targetPath);
}

export default db;
