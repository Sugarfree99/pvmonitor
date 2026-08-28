import Database from "better-sqlite3";
import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

// Återställ RAM-databasen från disk-backup vid uppstart (efter omstart/strömavbrott),
// så att produktionshistoriken överlever. Görs bara om RAM-kopian saknas.
if (config.dbBackupPath) {
  mkdirSync(dirname(config.dbBackupPath), { recursive: true });
  if (!existsSync(config.dbPath) && existsSync(config.dbBackupPath)) {
    try {
      copyFileSync(config.dbBackupPath, config.dbPath);
      console.log("[db] återställde databasen från disk-backup");
    } catch (err) {
      console.warn(`[db] kunde inte återställa backup: ${err.message}`);
    }
  }
}

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

// Timvis produktion (Wh) per anläggning + '__all__' för totalen, för stapeldiagram.
db.exec(`
  CREATE TABLE IF NOT EXISTS hourly (
    bucket       TEXT NOT NULL,
    site_id      TEXT NOT NULL,
    produced_wh  REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, site_id)
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

const selectByIdStmt = db.prepare(`SELECT * FROM latest WHERE inverter_id = ?`);

export function getLatestById(id) {
  return selectByIdStmt.get(id);
}

// Timbucket i lokal tid: "YYYY-MM-DDTHH".
export function hourBucket(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

const addProductionStmt = db.prepare(`
  INSERT INTO hourly (bucket, site_id, produced_wh) VALUES (?, ?, ?)
  ON CONFLICT(bucket, site_id) DO UPDATE SET produced_wh = produced_wh + excluded.produced_wh
`);

export function addProduction(bucket, siteId, wh) {
  addProductionStmt.run(bucket, siteId, wh);
}

const getHourlyStmt = db.prepare(
  `SELECT bucket, site_id, produced_wh FROM hourly WHERE bucket >= ? ORDER BY bucket ASC`
);

export function getHourlySince(minBucket) {
  return getHourlyStmt.all(minBucket);
}

const pruneHourlyStmt = db.prepare(`DELETE FROM hourly WHERE bucket < ?`);

export function pruneHourly(minBucket) {
  pruneHourlyStmt.run(minBucket);
}

// Backar RAM-databasen till beständig disk (anropas periodiskt av backuparen).
export function backupTo(targetPath) {
  return db.backup(targetPath);
}

const resetHourlyStmt = db.prepare(`DELETE FROM hourly`);
const resetLatestStmt = db.prepare(`DELETE FROM latest`);

// Nollställer systemets egen data: produktionshistorik (timdiagram) och
// senaste-cache. Omformarnas energitotaler läses åter in vid nästa pollning.
export function resetHistory({ clearLatest = true } = {}) {
  resetHourlyStmt.run();
  if (clearLatest) resetLatestStmt.run();
}

export default db;
