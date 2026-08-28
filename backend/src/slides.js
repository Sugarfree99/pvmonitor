import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Konfig för den extra bildsidan i karusellen (site-specifik, gitignorerad).
export const slidesConfigPath =
  process.env.SLIDES_CONFIG ?? join(__dirname, "..", "config", "slides.json");

const DEFAULT = { enabled: false, title: "", backdrop: "", images: [] };

function ensure() {
  if (!existsSync(slidesConfigPath)) {
    writeFileSync(slidesConfigPath, JSON.stringify(DEFAULT, null, 2) + "\n");
  }
}

// Bakgrundston (radial uttoning bakom bilderna). Tom = ingen.
function normColor(c) {
  const s = String(c ?? "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s.toLowerCase() : "";
}

function clampHeight(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 240;
  return Math.min(800, Math.max(20, Math.round(n)));
}

function normImg(l) {
  if (!l || typeof l.src !== "string" || !l.src.trim()) return null;
  return {
    src: l.src.trim(),
    alt: String(l.alt ?? "").slice(0, 120),
    invert: !!l.invert,
    height: clampHeight(l.height)
  };
}

export function getSlides() {
  ensure();
  try {
    const raw = JSON.parse(readFileSync(slidesConfigPath, "utf-8"));
    return {
      enabled: !!raw.enabled,
      title: String(raw.title ?? "").slice(0, 200),
      backdrop: normColor(raw.backdrop),
      images: (Array.isArray(raw.images) ? raw.images : []).map(normImg).filter(Boolean)
    };
  } catch {
    return { enabled: false, title: "", backdrop: "", images: [] };
  }
}

export function saveSlides(body) {
  ensure();
  const clean = {
    enabled: !!body?.enabled,
    title: String(body?.title ?? "").slice(0, 200),
    backdrop: normColor(body?.backdrop),
    images: (Array.isArray(body?.images) ? body.images : []).map(normImg).filter(Boolean)
  };
  writeFileSync(slidesConfigPath, JSON.stringify(clean, null, 2) + "\n");
  return clean;
}
