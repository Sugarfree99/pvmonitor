import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { startPoller, stopPoller } from "./poller.js";
import { buildSnapshot } from "./aggregate.js";
import { backupTo } from "./db.js";

const app = express();
app.use(cors());

// Enkel hälsokontroll som kiosk-skriptet väntar på innan Chromium startar.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", mock: config.mock, uptime: process.uptime() });
});

// Hela ögonblicksbilden (översikt + alla anläggningar/omformare).
app.get("/api/data", (_req, res) => {
  res.json(buildSnapshot());
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[api] lyssnar på http://${config.host}:${config.port}`);
  startPoller();
});

// Backa RAM-databasen till beständig disk 1 gång/min (skyddar mot dataförlust
// vid strömavbrott utan att slita på hårddisken).
let backupTimer = null;
if (process.env.DB_BACKUP_PATH) {
  const target = process.env.DB_BACKUP_PATH;
  backupTimer = setInterval(() => {
    backupTo(target).catch((err) =>
      console.warn(`[backup] misslyckades: ${err.message}`)
    );
  }, 60_000);
}

function shutdown() {
  console.log("[api] stänger ner...");
  stopPoller();
  if (backupTimer) clearInterval(backupTimer);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
