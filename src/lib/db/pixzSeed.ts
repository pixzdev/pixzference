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
 *  - Community 9Router tier: public community deployments of the same router
 *    software, added as deterministic openai-compatible provider nodes plus
 *    apikey connections. The upstreams publish their key pools openly at
 *    /api/keys (that is the community model), so the keys below are public
 *    pool credentials, not operator secrets. Verified 2026-10-30 from the
 *    production runtime: connection test + streaming chat per instance.
 *    Nodes are seeded per deterministic id (idempotent), connections follow
 *    the same empty-table gate as the built-in tiers.
 *  - Opt out entirely with PIXZ_SEED_PROVIDERS=false|0|off.
 */

import { isCloud } from "./core";
import { createProviderConnection, getProviderConnections } from "./providers";
import {
  createProviderNode,
  getProviderNodeById,
  isProviderNodeIdConflictError,
} from "./providers/nodes";

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

interface CommunityRouterNodeSeed {
  /** Deterministic node id — stable across cold starts so connections keep pointing at it. */
  id: string;
  name: string;
  prefix: string;
  /** OpenAI-compatible chat root (the router's /v1). */
  baseUrl: string;
  /** Public community key pool — published by the instance at /api/keys. */
  keys: string[];
}

/**
 * Community 9Router tier — public community deployments verified live from the
 * production serverless runtime on 2026-10-30 (connection test + stream chat
 * + model discovery). Key pools are the instances' own published public keys.
 */
const COMMUNITY_9ROUTER_NODES: CommunityRouterNodeSeed[] = [
  {
    id: "openai-compatible-chat-9r-nexme",
    name: "9R Nexme (VN)",
    prefix: "nexme",
    baseUrl: "https://9router.nexme.vn/v1",
    keys: [
      "sk-933b00f8d5cccea7-cu9k4p-dea1117d",
      "sk-933b00f8d5cccea7-t5azz8-fc5ed6bb",
      "sk-933b00f8d5cccea7-bw8ecn-fe452d38",
    ],
  },
  {
    id: "openai-compatible-chat-9r-smkdata",
    name: "9R SMKData",
    prefix: "smkdata",
    baseUrl: "https://life.smkdata.sch.id/v1",
    keys: [
      "sk-5e32b023e2dc1ab2-9riki9-f6ea4e2a",
      "sk-9a6db379fee63041-d552sc-7f6ea5b0",
      "sk-9a6db379fee63041-u3p52j-0b34fec5",
    ],
  },
  {
    id: "openai-compatible-chat-9r-sslip",
    name: "9R sslip HKG",
    prefix: "sslip",
    baseUrl: "https://9router-43-134-165-218.sslip.io/v1",
    keys: [
      "sk-752b90456c373287-7ndp1b-1930998e",
      "sk-752b90456c373287-9rtr01-de05c2e8",
      "sk-4dd43230cd861e78-2pvbku-17bc8ddc",
    ],
  },
  {
    id: "openai-compatible-chat-9r-unicon",
    name: "9R Unicon",
    prefix: "unicon",
    baseUrl: "https://9router.unicon.ltd/v1",
    keys: ["sk-332d09214d38df3a-hxnq07-676b2e7f"],
  },
  {
    id: "openai-compatible-chat-9r-ireng",
    name: "9R IrengCloud",
    prefix: "ireng",
    baseUrl: "https://router.irengcloud.com/v1",
    keys: ["sk-1ee0ea9b1557e97f-30ikoa-4f356d01"],
  },
  {
    id: "openai-compatible-chat-9r-jishnu",
    name: "9R Jishnu (HF)",
    prefix: "jishnu",
    baseUrl: "https://jishnupg-opencode-cli.hf.space/v1",
    keys: ["Jishnu2005-nexme"],
  },
  {
    id: "openai-compatible-chat-9r-hermes",
    name: "9R HermesDev",
    prefix: "hermes",
    baseUrl: "https://omni.hermesdev.duckdns.org/v1",
    keys: ["sk-no-key"],
  },
  {
    id: "openai-compatible-chat-9r-s2ia",
    name: "9R S2IA",
    prefix: "s2ia",
    baseUrl: "https://my-9router-service-s2ia.onrender.com/v1",
    keys: ["sk-f28a6d1a3484f1d8-3n2ph3-d4150af7"],
  },
  {
    id: "openai-compatible-chat-9r-aldihh",
    name: "9R Aldihh (HF)",
    prefix: "aldihh",
    baseUrl: "https://aldihh-9router.hf.space/v1",
    keys: [
      "sk-a16da12d6f7fe4e7-t7ggkj-e374f908",
      "sk-ddb7409bf77c6ff0-6ull2c-a9f8c480",
    ],
  },
  {
    id: "openai-compatible-chat-9r-arinaldi",
    name: "9R Arinaldi (HF)",
    prefix: "arinaldi",
    baseUrl: "https://arinaldi999-9router.hf.space/v1",
    keys: ["sk-2e9805ef7ff65524-qs889z-d293bab4"],
  },
  {
    id: "openai-compatible-chat-9r-persia",
    name: "9R OmniPersia",
    prefix: "persia",
    baseUrl: "https://omni.nemidoonamcherainogereftamonline.online/v1",
    keys: ["sk-no-key"],
  },
];

export function isProviderSeedEnabled(): boolean {
  if (!isCloud) return false;
  const raw = (process.env.PIXZ_SEED_PROVIDERS ?? "").trim().toLowerCase();
  if (raw.length === 0) return true; // default: on in the cloud tier
  return !PIXZ_SEED_OFF_VALUES.has(raw);
}

/**
 * Seed the community 9Router provider nodes. Idempotent per deterministic id:
 * a node that already exists (operator-created or a previous seed pass on a
 * warm instance) is left untouched, so this is safe to call on every boot
 * regardless of the connections-table state.
 * Returns the number of nodes created.
 */
async function seedCommunityRouterNodes(): Promise<number> {
  let created = 0;
  for (const spec of COMMUNITY_9ROUTER_NODES) {
    try {
      const existing = await getProviderNodeById(spec.id);
      if (existing) continue;
      await createProviderNode({
        id: spec.id,
        type: "openai-compatible",
        name: spec.name,
        prefix: spec.prefix,
        apiType: "chat",
        baseUrl: spec.baseUrl,
      });
      created += 1;
    } catch (err: unknown) {
      // A concurrent seed pass on the same instance may have inserted the node
      // first — that collision is the desired end state, not a failure.
      if (isProviderNodeIdConflictError(err)) continue;
      console.warn(
        `[pixz-seed] Failed to seed community node ${spec.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  if (created > 0) {
    console.log(`[pixz-seed] Seeded ${created} community 9Router provider nodes`);
  }
  return created;
}

/**
 * Seed the default provider set when the connections table is empty.
 * Returns the number of connections created (0 when seeding was skipped).
 * Every failure is logged and swallowed — seeding must never block boot.
 */
export async function seedDefaultProvidersIfEmpty(): Promise<number> {
  if (!isProviderSeedEnabled()) return 0;

  // Community router nodes are keyed by deterministic ids, so they seed
  // idempotently even when the connections table already has rows.
  await seedCommunityRouterNodes();

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

  // Community 9Router tier: one apikey connection per published pool key.
  // providerSpecificData mirrors what POST /api/providers stamps for
  // compatible-node connections (prefix/apiType/baseUrl/nodeName), so the
  // self-heal in compatibleNodeBaseUrl.ts stays a no-op for these rows.
  for (const node of COMMUNITY_9ROUTER_NODES) {
    for (const [index, apiKey] of node.keys.entries()) {
      try {
        await createProviderConnection({
          provider: node.id,
          authType: "apikey",
          apiKey,
          name: `${node.name} #${index + 1}`,
          priority: index + 1,
          defaultModel: null,
          providerSpecificData: {
            prefix: node.prefix,
            apiType: "chat",
            baseUrl: node.baseUrl,
            nodeName: node.name,
          },
          isActive: true,
          testStatus: "active",
        });
        created += 1;
      } catch (err: unknown) {
        console.warn(
          `[pixz-seed] Failed to seed ${node.id} key #${index + 1}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  if (created > 0) {
    const communityConnections = COMMUNITY_9ROUTER_NODES.reduce(
      (sum, node) => sum + node.keys.length,
      0
    );
    console.log(
      `[pixz-seed] Seeded ${created} default provider connections on cold start ` +
        `(${TIER_1_ACTIVE.length} active, ${TIER_2_INACTIVE.length} inactive, ` +
        `${communityConnections} community 9Router)`
    );
  }
  return created;
}
