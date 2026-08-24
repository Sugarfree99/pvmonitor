// Schemalagd extern kopia av databasen till en målplats (mapp/nätverksmapp
// eller server:/sökväg via scp), med gallring. Säkrare/effektivare än mejl.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { backupTo } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const settingsPath = join(__dirname, "..", "config", "backup.json");

const defaults = {
  enabled: false,
  intervalHours: 0, // 0 = daglig vid `time`; >0 = var N:e timme
  time: "03:00",
  destination: "", // mapp (lokal/monterad) eller user@host:/sökväg
  keep: 14,
  lastRun: null,
  lastStatus: null
};

export function getBackupSettings() {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(settingsPath, "utf-8")) };
  } catch {
    return { ...defaults };
  }
}

function save(s) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
}

export function updateBackupSettings(patch) {
  const s = getBackupSettings();
  const next = {
    ...s,
    enabled: !!patch.enabled,
    intervalHours: Math.max(0, Number(patch.intervalHours) || 0),
    time: /^\d{2}:\d{2}$/.test(patch.time || "") ? patch.time : s.time,
    destination: String(patch.destination || "").trim(),
    keep: Math.max(1, Number(patch.keep) || 14)
  };
  save(next);
  return next;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isRemote(dest) {
  return /@.+:/.test(dest);
}

// Skapar en konsistent kopia (via SQLite online-backup) och lägger den på målplatsen.
export async function runBackupNow() {
  const s = getBackupSettings();
  if (!s.destination) throw new Error("Ingen målplats angiven");
  const name = `pvmonitor-${stamp()}.sqlite`;

  if (isRemote(s.destination)) {
    const tmp = join(os.tmpdir(), name);
    await backupTo(tmp);
    await scp(tmp, `${s.destination.replace(/\/+$/, "")}/${name}`);
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  } else {
    mkdirSync(s.destination, { recursive: true });
    await backupTo(join(s.destination, name));
    pruneLocal(s.destination, s.keep);
  }

  const done = { ...s, lastRun: Date.now(), lastStatus: "ok" };
  save(done);
  return done;
}

function scp(src, target) {
  return new Promise((resolve, reject) => {
    const p = spawn("scp", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", src, target]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `scp kod ${code}`))));
  });
}

function pruneLocal(dir, keep) {
  try {
    const files = readdirSync(dir)
      .filter((f) => /^pvmonitor-\d{8}-\d{6}\.sqlite$/.test(f))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(keep).forEach((x) => {
      try {
        unlinkSync(join(dir, x.f));
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

let timer = null;

export function startBackupScheduler() {
  if (timer) return;
  timer = setInterval(tick, 60_000);
  tick();
}

async function tick() {
  const s = getBackupSettings();
  if (!s.enabled || !s.destination) return;
  const now = new Date();

  let due = false;
  if (s.intervalHours > 0) {
    due = Date.now() - (s.lastRun || 0) >= s.intervalHours * 3600 * 1000;
  } else {
    const [hh, mm] = s.time.split(":");
    const isTime = now.getHours() === Number(hh) && now.getMinutes() === Number(mm);
    const ranToday = s.lastRun && new Date(s.lastRun).toDateString() === now.toDateString();
    due = isTime && !ranToday;
  }

  if (!due) return;
  try {
    await runBackupNow();
    console.log("[backup] extern kopia klar");
  } catch (e) {
    console.warn(`[backup] extern kopia misslyckades: ${e.message}`);
    save({ ...getBackupSettings(), lastRun: Date.now(), lastStatus: "fel: " + e.message });
  }
}
