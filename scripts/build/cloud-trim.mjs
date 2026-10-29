#!/usr/bin/env node
/**
 * Cloud profile trim: shrink the Vercel deployment by limiting the i18n
 * catalog to a curated locale subset.
 *
 * Why: `src/i18n/request.ts` loads catalogs via a dynamic import with a
 * template literal (`import(\`./messages/${locale}.json\`)`), so webpack
 * emits EVERY file in src/i18n/messages/ as an async chunk — all 67 catalogs,
 * ~76 MB of static upload per deployment. Vercel prebuilt deploys upload the
 * whole output every time, which is what aborted the upload in the first
 * production deploy attempts.
 *
 * What it does (runner is ephemeral; git is never modified):
 *   1. Filters `config/i18n.json` (the SOURCE OF TRUTH for LOCALES/LANGUAGES)
 *      down to the allowlist, so the language selector and cookie resolution
 *      only ever offer locales whose catalogs still exist. Removed locales
 *      gracefully fall back to the default (en) via resolveRequestedLocale.
 *   2. Moves non-allowlisted catalogs out of src/i18n/messages/ into
 *      .cloud-trim-backup/ so the dynamic-import chunk graph only contains
 *      the kept locales.
 *
 * Local / Electron / Docker builds never run this script: they keep the full
 * 67-locale catalog. Override the subset with PIXZFERENCE_CLOUD_LOCALES
 * (comma-separated; the default locale is always kept implicitly).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const DEFAULT_CLOUD_LOCALES =
  "en,id,zh-CN,zh-TW,ja,ko,es,de,fr,pt-BR,ru,ar,hi,vi,th";

const raw = (process.env.PIXZFERENCE_CLOUD_LOCALES ?? "").trim() || DEFAULT_CLOUD_LOCALES;
const keep = new Set(
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const configPath = path.join(root, "config", "i18n.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (!config.default) {
  throw new Error("[cloud-trim] config/i18n.json has no default locale");
}
// The default (and EN fallback) catalogs must always survive the trim.
keep.add(config.default);

const before = config.locales.length;
const keptLocales = config.locales.filter((l) => keep.has(l.code));
if (keptLocales.length === 0) {
  throw new Error(
    `[cloud-trim] allowlist matched zero locales (check PIXZFERENCE_CLOUD_LOCALES: ${raw})`
  );
}
const droppedCodes = config.locales.filter((l) => !keep.has(l.code)).map((l) => l.code);

// 1) Rewrite config/i18n.json — build-time source of truth for LOCALES,
//    LANGUAGES (language selector) and LOCALE_ALIASES.
config.locales = keptLocales;
config.rtl = (config.rtl ?? []).filter((c) => keep.has(c));
config.uiOnly = [...new Set((config.uiOnly ?? []).filter((c) => keep.has(c)))];
config.docsExcluded = [...new Set((config.docsExcluded ?? []).filter((c) => keep.has(c)))];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

// 2) Move surplus catalogs out of the import graph.
const messagesDir = path.join(root, "src", "i18n", "messages");
const backupDir = path.join(root, ".cloud-trim-backup", "messages");
fs.mkdirSync(backupDir, { recursive: true });

let moved = 0;
let keptBytes = 0;
for (const file of fs.readdirSync(messagesDir)) {
  if (!file.endsWith(".json")) continue;
  const code = file.slice(0, -".json".length);
  const full = path.join(messagesDir, file);
  if (keep.has(code)) {
    keptBytes += fs.statSync(full).size;
    continue;
  }
  fs.renameSync(full, path.join(backupDir, file));
  moved += 1;
}

// Sanity: every kept locale must have a catalog file left behind.
const existing = new Set(
  fs
    .readdirSync(messagesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
);
const missing = [...keep].filter((c) => !existing.has(c));
if (missing.length > 0) {
  console.warn(`[cloud-trim] no catalog found for: ${missing.join(", ")} (falling back to default at runtime)`);
}

console.log(
  `[cloud-trim] locales: ${before} -> ${keptLocales.length} (${keptLocales
    .map((l) => l.code)
    .join(", ")})`
);
console.log(`[cloud-trim] dropped ${droppedCodes.length} locales: ${droppedCodes.join(", ")}`);
console.log(`[cloud-trim] moved ${moved} catalogs to .cloud-trim-backup/`);
console.log(`[cloud-trim] kept catalog bytes: ~${Math.round(keptBytes / 1024 / 1024)} MB`);
