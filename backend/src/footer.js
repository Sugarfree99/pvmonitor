import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Konfigfil med sidfotens logotyper (site-specifik, gitignorerad).
export const footerConfigPath =
  process.env.FOOTER_CONFIG ??
  join(__dirname, "..", "config", "footer.json");

// Mapp för uppladdade logotypfiler (beständig, gitignorerad – rörs inte av deploy).
export const logosDir =
  process.env.LOGOS_DIR ?? join(__dirname, "..", "data", "logos");

// Standarduppsättning: RSYD-sköld + leverantörslogga (som innan admin ändrar).
const DEFAULT = {
  logos: [
    { src: "/rsyd-shield.png", alt: "Räddningstjänsten Syd", invert: false, height: 54 },
    { src: "/bbk-logo.png", alt: "Bredbandskompetens", invert: true, height: 40 }
  ]
};

mkdirSync(logosDir, { recursive: true });

function ensure() {
  if (!existsSync(footerConfigPath)) {
    writeFileSync(footerConfigPath, JSON.stringify(DEFAULT, null, 2) + "\n");
  }
}

function clampHeight(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 44;
  return Math.min(200, Math.max(10, Math.round(n)));
}

function normalize(l) {
  if (!l || typeof l.src !== "string" || !l.src.trim()) return null;
  return {
    src: l.src.trim(),
    alt: String(l.alt ?? "").slice(0, 120),
    invert: !!l.invert,
    height: clampHeight(l.height)
  };
}

export function getFooter() {
  ensure();
  try {
    const raw = JSON.parse(readFileSync(footerConfigPath, "utf-8"));
    const logos = Array.isArray(raw.logos) ? raw.logos : [];
    return { logos: logos.map(normalize).filter(Boolean) };
  } catch {
    return { logos: [] };
  }
}

export function saveFooter(logos) {
  ensure();
  const clean = (Array.isArray(logos) ? logos : []).map(normalize).filter(Boolean);
  writeFileSync(footerConfigPath, JSON.stringify({ logos: clean }, null, 2) + "\n");
  return { logos: clean };
}

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/gif": "gif"
};

// Sparar en uppladdad bild (base64 data-URL) och returnerar dess serverade src.
export function saveUpload(dataUrl, name) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!m) throw new Error("Ogiltig bilddata");
  const ext = EXT[m[1]];
  if (!ext) throw new Error("Filtyp stöds inte (png, jpg, svg, webp, gif)");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2_000_000) throw new Error("Filen är för stor (max 2 MB)");
  const base = String(name || "logo")
    .toLowerCase()
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 40) || "logo";
  const file = `${Date.now()}-${base}.${ext}`;
  writeFileSync(join(logosDir, file), buf);
  return `/api/logos/${file}`;
}
