import { getServerLifecyclePhase } from "@/lib/serverLifecycle";
import { observeHealthzEventLoopLag } from "@/lib/healthzLag";

export const dynamic = "force-dynamic";

const HEALTH_BODIES = {
  ready: "ok\n",
  starting: "starting\n",
  stopping: "stopping\n",
} as const;

function createHealthResponse(method: "GET" | "HEAD"): Response {
  const phase = getServerLifecyclePhase();
  const body = HEALTH_BODIES[phase];

  // TEMPORARY (Vercel bring-up): when the serverless instrumentation hook
  // fails, src/instrumentation.ts records the cause on globalThis and boots
  // degraded (phase stays "starting" => 503). Surface that recorded message
  // as a response header so a plain `curl -i /healthz` reveals the boot
  // failure without needing runtime-log access. Remove with the
  // /boot-diagnostics route once the serverless boot is stable.
  const bootError =
    (globalThis as { __pixzBootError?: { message: string } }).__pixzBootError ?? null;
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (bootError) {
    headers["x-boot-error"] = (bootError.message || "unknown").slice(0, 512);
  }

  return new Response(method === "HEAD" ? null : body, {
    status: phase === "ready" ? 200 : 503,
    headers,
  });
}

export function GET(): Response {
  observeHealthzEventLoopLag();
  return createHealthResponse("GET");
}

export function HEAD(): Response {
  return createHealthResponse("HEAD");
}
