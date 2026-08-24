// Schemalagd extern kopia av databasen till en målplats (mapp/nätverksmapp
// eller server:/sökväg via scp), med gallring. Säkrare/effektivare än mejl.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  copyFileSync
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
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
  compression: "gzip", // "gzip" | "brotli" | "none"
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
  const comp = ["gzip", "brotli", "none"].includes(patch.compression)
    ? patch.compression
    : s.compression || "gzip";
  const next = {
    ...s,
    enabled: !!patch.enabled,
    intervalHours: Math.max(0, Number(patch.intervalHours) || 0),
    time: /^\d{2}:\d{2}$/.test(patch.time || "") ? patch.time : s.time,
    destination: String(patch.destination || "").trim(),
    keep: Math.max(1, Number(patch.keep) || 14),
    compression: comp
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

function compExt(comp) {
  return comp === "brotli" ? ".br" : comp === "gzip" ? ".gz" : "";
}

function compressFile(src, dest, comp) {
  const data = readFileSync(src);
  const out =
    comp === "brotli"
      ? brotliCompressSync(data, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
        })
      : gzipSync(data, { level: 9 });
  writeFileSync(dest, out);
}

// Skapar en konsistent kopia (via SQLite online-backup), komprimerar och lägger
// den på målplatsen.
export async function runBackupNow() {
  const s = getBackupSettings();
  if (!s.destination) throw new Error("Ingen målplats angiven");
  const comp = s.compression || "gzip";
  const base = `pvmonitor-${stamp()}.sqlite`;
  const finalName = base + compExt(comp);

  const tmpRaw = join(os.tmpdir(), base);
  await backupTo(tmpRaw);
  let tmpFinal = tmpRaw;
  if (compExt(comp)) {
    tmpFinal = join(os.tmpdir(), finalName);
    compressFile(tmpRaw, tmpFinal, comp);
    try {
      unlinkSync(tmpRaw);
    } catch {
      /* ignore */
    }
  }

  try {
    if (isRemote(s.destination)) {
      await scp(tmpFinal, `${s.destination.replace(/\/+$/, "")}/${finalName}`);
      await pruneRemote(s.destination, s.keep);
    } else {
      mkdirSync(s.destination, { recursive: true });
      copyFileSync(tmpFinal, join(s.destination, finalName));
      pruneLocal(s.destination, s.keep);
    }
  } finally {
    try {
      unlinkSync(tmpFinal);
    } catch {
      /* ignore */
    }
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
      .filter((f) => /^pvmonitor-\d{8}-\d{6}\.sqlite(\.(gz|br))?$/.test(f))
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

// Gallrar på en fjärrserver (scp-mål) via ssh, bäst-effort.
function pruneRemote(destination, keep) {
  const idx = destination.indexOf(":");
  if (idx < 0) return Promise.resolve();
  const host = destination.slice(0, idx);
  const path = destination.slice(idx + 1).replace(/\/+$/, "") || ".";
  const cmd = `cd '${path}' 2>/dev/null && ls -1t pvmonitor-*.sqlite* 2>/dev/null | tail -n +${keep + 1} | xargs -r rm -f`;
  return new Promise((resolve) => {
    const p = spawn("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", host, cmd]);
    p.on("error", () => resolve());
    p.on("close", () => resolve());
  });
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
