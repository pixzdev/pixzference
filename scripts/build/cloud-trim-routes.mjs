#!/usr/bin/env node
/**
 * cloud-trim-routes.mjs — Vercel (PIXZFERENCE_CLOUD=1) route diet.
 *
 * The monorepo ships a self-hosted gateway: several API route groups spawn
 * local processes, bind listeners, drive native addons (tproxy), control the
 * host (cert install, /etc/hosts, restart/shutdown, docker, ffmpeg, tar), or
 * hold long-lived WebSocket servers. None of that can execute inside a Vercel
 * serverless function, yet every one of those routes still compiles into its
 * own lambda — ~213 functions of pure dead weight, dragging express, sharp,
 * tar/ffmpeg closures and spawn helpers into the shared server chunks (cold
 * start) and into the upload.
 *
 * Mechanism (mirrors cloud-trim.mjs): MOVE the route trees to
 * .cloud-trim-backup/api/<path> — idempotent on an ephemeral runner, git
 * untouched, and the backup dir is already tracing-excluded under
 * PIXZFERENCE_CLOUD. Next.js routes are resolved by filesystem path, so a
 * physical move is the only reliable suppression (webpack aliasing route.ts
 * does not work). Trimmed paths fall through to
 * src/app/api/[...omnirouteApiCatchAll]/route.ts which answers a clean JSON
 * 404 (#6424) — dashboard pages calling them degrade gracefully.
 *
 * Safety: fail-closed import guard. Every kept source file's import/export/
 * dynamic-import specifiers are resolved; if any resolves INTO a candidate
 * dir, that dir is kept (logged) instead of moved. The build must never see a
 * dangling import.
 *
 * Local / Docker / Electron builds never run this: it is only wired into
 * .github/workflows/deploy-vercel.yml behind PIXZFERENCE_CLOUD=1.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const APP_API = path.join(ROOT, "src", "app", "api");
const BACKUP = path.join(ROOT, ".cloud-trim-backup", "api");

const TRIM_DIRS = [
  // Local sidecar process manager (cliproxy/9router/bifrost/openwa/...): spawn
  "services",
  // MITM server spawn, cert download/regenerate, tproxy native addon, /etc/hosts, CA trust
  "tools/agent-bridge",
  // Local HTTP-proxy listener + system proxy edits + WS live stream
  "tools/traffic-inspector",
  // Local CLI binary probes (execFile which), writes ~/.claude, ~/.qwen, ...
  "cli-tools",
  // Downloads + executes CLIProxyAPI binaries
  "version-manager",
  // cloudflared/tailscale/ngrok daemons
  "tunnels",
  // Arbitrary code exec: worker_threads + child_process + vm.Script
  "plugins",
  "middleware",
  // Skill executor -> container spawn, CLI probes
  "skills",
  // Launches Redis via docker/podman
  "local",
  // Spawns Docker containers
  "vnc-session",
  // Spawns headroom-ai python CLI, kills PIDs
  "headroom",
  // Loopback-only scanner
  "discovery",
  // Local triage executor / execFileSync agent probes
  "issue-agent",
  "acp",
  // In-process JobRegistry control, loopback-only
  "jobs",
  // Host control: git+npm auto-update, host NICs, process restart/kill
  "system",
  "network",
  "restart",
  "shutdown",
  // Spawns tar, local fs archives
  "db-backups",
  // Local fs exports / volume health
  "log-export",
  "storage",
  // Ephemeral-fs experiments
  "chaos",
];

/** Subdirectory-level trims inside otherwise-kept groups. */
const TRIM_SUBDIRS = [
  // Read host credential files (~/.aws/sso/cache, ...)
  "oauth/cursor/auto-import",
  "oauth/kiro/auto-import",
  // System CA install + /etc/hosts; native sqlite diagnostics
  "settings/mitm",
  "settings/database",
  // Long-lived WebSocket upgrades
  "v1/ws",
  "internal/codex-responses-ws",
];

const IMPORT_RE =
  /(?:import|export)\s+(?:[\s\S]*?from\s*)?["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)|export\s*\*\s*from\s*["']([^"']+)["']/g;

const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function existsAsModule(base) {
  return RESOLVE_SUFFIXES.some((suffix) => fs.existsSync(base + suffix));
}

function resolveSpecifier(fromFile, spec) {
  let target;
  if (spec.startsWith(".")) target = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith("@/")) target = path.join(ROOT, "src", spec.slice(2));
  else return null; // bare package specifier — cannot reach a moved route dir
  target = target.split("?")[0].split("#")[0];
  if (existsAsModule(target)) return target;
  return null;
}

function main() {
  if (process.env.PIXZFERENCE_CLOUD !== "1") {
    console.log("[cloud-trim-routes] PIXZFERENCE_CLOUD!=1 — no-op (local profile keeps all routes)");
    return;
  }

  const candidates = [...TRIM_DIRS, ...TRIM_SUBDIRS].map((rel) => ({
    rel,
    abs: path.join(APP_API, rel),
  }));

  const present = candidates.filter((c) => fs.existsSync(c.abs));
  const missing = candidates.length - present.length;
  if (missing > 0) {
    console.log(`[cloud-trim-routes] ${missing} candidate paths absent (already trimmed?) — continuing`);
  }

  // ---- Fail-closed import guard -------------------------------------------
  // Scan every kept source file; a kept module must never import from a moved
  // dir. Route dirs referencing each other are the known hazard.
  const candidateAbs = present.map((c) => c.abs);
  const under = (p) => candidateAbs.some((c) => p === c || p.startsWith(c + path.sep));

  const keptRoots = [path.join(ROOT, "src")].filter(Boolean);
  const conflicts = [];
  const scanned = new Set();

  for (const root of keptRoots) {
    for (const file of walk(root)) {
      const ext = path.extname(file);
      if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"].includes(ext)) continue;
      if (under(file)) continue; // files inside moved dirs move together
      scanned.add(file);
      const text = fs.readFileSync(file, "utf-8");
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] || m[2] || m[3];
        if (!spec) continue;
        const resolved = resolveSpecifier(file, spec);
        if (resolved && under(resolved)) {
          conflicts.push({ from: path.relative(ROOT, file), spec, into: path.relative(ROOT, resolved) });
        }
      }
    }
  }

  const conflictDirs = new Set();
  for (const c of conflicts) {
    const abs = path.join(ROOT, c.into.startsWith("src") ? c.into : path.join("src", c.into));
    const hit = candidateAbs.find((cand) => abs === cand || abs.startsWith(cand + path.sep));
    if (hit) conflictDirs.add(hit);
  }

  const keptBack = [...conflictDirs].map((abs) => ({
    rel: path.relative(APP_API, abs),
    abs,
  }));
  const moving = present.filter((c) => !conflictDirs.has(c.abs));

  if (conflicts.length > 0) {
    console.log(
      `[cloud-trim-routes] import guard kept ${keptBack.length} dir(s) referenced by kept code:`
    );
    for (const k of keptBack) console.log(`  KEEP  src/app/api/${k.rel}`);
    for (const c of conflicts.slice(0, 10)) {
      console.log(`  ref: ${c.from} -> "${c.spec}"`);
    }
  }

  // ---- Move ---------------------------------------------------------------
  fs.mkdirSync(BACKUP, { recursive: true });
  let movedFiles = 0;
  for (const c of moving) {
    const dest = path.join(BACKUP, c.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(c.abs, dest);
    const count = [...walk(dest)].length;
    movedFiles += count;
    console.log(`[cloud-trim-routes] moved src/app/api/${c.rel} (${count} files)`);
  }

  const movedRouteCount = moving.reduce((acc, c) => {
    const dest = path.join(BACKUP, c.rel);
    let n = 0;
    for (const f of walk(dest)) if (f.endsWith("route.ts")) n += 1;
    return acc + n;
  }, 0);

  console.log(
    `[cloud-trim-routes] done: ${moving.length} dirs, ${movedFiles} files, ~${movedRouteCount} serverless functions trimmed`
  );
}

main();
