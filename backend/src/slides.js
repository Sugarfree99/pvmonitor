import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Konfig för den extra bildsidan i karusellen (site-specifik, gitignorerad).
export const slidesConfigPath =
  process.env.SLIDES_CONFIG ?? join(__dirname, "..", "config", "slides.json");

const DEFAULT = { enabled: false, title: "", images: [] };

function ensure() {
  if (!existsSync(slidesConfigPath)) {
    writeFileSync(slidesConfigPath, JSON.stringify(DEFAULT, null, 2) + "\n");
  }
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
      images: (Array.isArray(raw.images) ? raw.images : []).map(normImg).filter(Boolean)
    };
  } catch {
    return { enabled: false, title: "", images: [] };
  }
}

export function saveSlides(body) {
  ensure();
  const clean = {
    enabled: !!body?.enabled,
    title: String(body?.title ?? "").slice(0, 200),
    images: (Array.isArray(body?.images) ? body.images : []).map(normImg).filter(Boolean)
  };
  writeFileSync(slidesConfigPath, JSON.stringify(clean, null, 2) + "\n");
  return clean;
}
