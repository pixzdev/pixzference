/**
 * Pixzference cold-start provider seed — durable defaults for ephemeral instances.
 *
 * Cloud/serverless deployments boot every instance with a fresh in-memory
 * database, so provider connections added through the dashboard evaporate the
 * moment the platform recycles the instance (observed repeatedly on Vercel:
 * a warm instance serves 22 connections, the next request lands on a cold one
 * with zero). Until a PIXZ_SYNC_DATABASE_URL snapshot backend is configured,
 * the only durable state is the code itself — so this module re-creates the
 * verified no-credential provider set on every cold start.
 *
 * Behaviour:
 *  - Runs only in the cloud tier (isCloud) and only while the provider
 *    connections table is completely empty: a Neon snapshot replay, or any
 *    operator-added connection, wins over the seed.
 *  - Tier 1 (active): providers verified over plain HTTPS from a serverless
 *    runtime — no local CLI, no browser runtime, no credential (connection
 *    test + end-to-end chat verified 2026-10 on the production deployment).
 *  - Tier 2 (inactive): connectable without a credential but not usable on
 *    serverless right now — local-CLI transports, a browser-backed transport,
 *    or upstreams that demand a key/cookie despite the catalog marking them
 *    optional. Seeded inactive so the dashboard still lists them; the operator
 *    supplies the missing piece or deletes the row.
 *  - Opt out entirely with PIXZ_SEED_PROVIDERS=false|0|off.
 *
 * This module contains only public catalog identifiers — no credentials, no
 * endpoints, no secrets.
 */

import { isCloud } from "./core";
import { createProviderConnection, getProviderConnections } from "./providers";

const PIXZ_SEED_OFF_VALUES = new Set(["false", "0", "off"]);

interface ProviderSeedSpec {
  id: string;
  name: string;
  authType: "no-auth" | "apikey";
  active: boolean;
}

/** Verified working from serverless over HTTPS — seeded active. */
const TIER_1_ACTIVE: ProviderSeedSpec[] = [
  { id: "duckduckgo-web", name: "DuckDuckGo AI Chat", authType: "no-auth", active: true },
  { id: "aihorde", name: "AI Horde", authType: "no-auth", active: true },
  { id: "veoaifree-web", name: "Veo AI Free", authType: "no-auth", active: true },
  { id: "firecrawl", name: "Firecrawl", authType: "apikey", active: true },
  { id: "g4f-groq", name: "g4f.space — Groq", authType: "apikey", active: true },
  { id: "g4f-gemini", name: "g4f.space — Gemini", authType: "apikey", active: true },
  { id: "g4f-pollinations", name: "g4f.space — Pollinations", authType: "apikey", active: true },
  { id: "g4f-ollama", name: "g4f.space — Ollama", authType: "apikey", active: true },
  { id: "g4f-nvidia", name: "g4f.space — NVIDIA", authType: "apikey", active: true },
  { id: "naga-ac", name: "Naga.ac", authType: "apikey", active: true },
];

/**
 * Connectable without credentials but blocked on serverless today — seeded
 * inactive so they remain visible in the dashboard.
 */
const TIER_2_INACTIVE: ProviderSeedSpec[] = [
  // Browser-backed transport: connection test passes, but live inference needs
  // a local Playwright/Chromium runtime that serverless does not provide.
  { id: "cloudflare-playground", name: "Cloudflare AI Playground", authType: "no-auth", active: false },
  // Local-CLI bridges: transport only exists on an operator machine.
  { id: "devin-cli-agentic", name: "Devin CLI Agentic Bridge", authType: "no-auth", active: false },
  { id: "auggie", name: "Augment (Auggie CLI)", authType: "no-auth", active: false },
  { id: "zcode", name: "ZCode (GLM Coding Plan)", authType: "no-auth", active: false },
  { id: "codex-app-server", name: "OpenAI Codex (App-Server)", authType: "no-auth", active: false },
  // Upstream rejects credential-less calls — needs an API key / cookie / token.
  { id: "uncloseai", name: "UncloseAI", authType: "no-auth", active: false },
  { id: "searxng-search", name: "SearXNG Search", authType: "apikey", active: false },
  { id: "copilot-web", name: "Microsoft Copilot Web", authType: "apikey", active: false },
  { id: "huggingchat", name: "HuggingChat (Free)", authType: "apikey", active: false },
  { id: "gitlawb", name: "Gitlawb Opengateway (MiMo)", authType: "apikey", active: false },
  { id: "gitlawb-gmi", name: "Gitlawb Opengateway (GMI Cloud)", authType: "apikey", active: false },
  { id: "uc", name: "UC (uncensored.com)", authType: "apikey", active: false },
];

export function isProviderSeedEnabled(): boolean {
  if (!isCloud) return false;
  const raw = (process.env.PIXZ_SEED_PROVIDERS ?? "").trim().toLowerCase();
  if (raw.length === 0) return true; // default: on in the cloud tier
  return !PIXZ_SEED_OFF_VALUES.has(raw);
}

/**
 * Seed the default provider set when the connections table is empty.
 * Returns the number of connections created (0 when seeding was skipped).
 * Every failure is logged and swallowed — seeding must never block boot.
 */
export async function seedDefaultProvidersIfEmpty(): Promise<number> {
  if (!isProviderSeedEnabled()) return 0;

  try {
    const existing = await getProviderConnections();
    if (existing.length > 0) return 0;
  } catch (err: unknown) {
    console.warn(
      "[pixz-seed] Could not inspect provider connections, skipping seed:",
      err instanceof Error ? err.message : err
    );
    return 0;
  }

  let created = 0;
  for (const spec of [...TIER_1_ACTIVE, ...TIER_2_INACTIVE]) {
    try {
      await createProviderConnection({
        provider: spec.id,
        authType: spec.authType,
        name: spec.name,
        priority: 1,
        defaultModel: null,
        providerSpecificData: null,
        // Tier 1 mirrors the free-onboarding convention (isActive: true);
        // testStatus reflects the verified matrix so the dashboard badge and
        // /v1/models advertising match reality from the first request.
        isActive: spec.active,
        testStatus: spec.active ? "active" : "unknown",
      });
      created += 1;
    } catch (err: unknown) {
      console.warn(
        `[pixz-seed] Failed to seed ${spec.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (created > 0) {
    console.log(
      `[pixz-seed] Seeded ${created} default provider connections on cold start ` +
        `(${TIER_1_ACTIVE.length} active, ${created - TIER_1_ACTIVE.length} inactive)`
    );
  }
  return created;
}
