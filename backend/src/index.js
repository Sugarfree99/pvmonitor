import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { startPoller, stopPoller } from "./poller.js";
import { buildSnapshot, buildHistory } from "./aggregate.js";
import { backupTo } from "./db.js";
import { adminRouter } from "./admin.js";

const app = express();
app.use(cors());

// Admin-gränssnitt (lösenordsskyddat) för att redigera omformare.
app.use("/admin", adminRouter);

// Enkel hälsokontroll som kiosk-skriptet väntar på innan Chromium startar.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", mock: config.mock, uptime: process.uptime() });
});

// Hela ögonblicksbilden (översikt + alla anläggningar/omformare).
app.get("/api/data", (_req, res) => {
  res.json(buildSnapshot());
});

// Timvis produktion (kWh) för stapeldiagrammet.
app.get("/api/history", (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours ?? 24), 1), 72);
  res.json(buildHistory(hours));
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[api] lyssnar på http://${config.host}:${config.port}`);
  startPoller();
});

// Backa RAM-databasen till beständig disk (skyddar mot dataförlust vid
// strömavbrott). Intervallet styr hur stor lucka timdiagrammet kan få.
let backupTimer = null;
if (process.env.DB_BACKUP_PATH) {
  const target = process.env.DB_BACKUP_PATH;
  const intervalMs = Number(process.env.DB_BACKUP_INTERVAL_MS ?? 15_000);
  backupTimer = setInterval(() => {
    backupTo(target).catch((err) =>
      console.warn(`[backup] misslyckades: ${err.message}`)
    );
  }, intervalMs);
}

function shutdown() {
  console.log("[api] stänger ner...");
  stopPoller();
  if (backupTimer) clearInterval(backupTimer);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
