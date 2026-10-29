import { getServerLifecyclePhase } from "@/lib/serverLifecycle";

/**
 * TEMPORARY boot-diagnostics endpoint (Vercel bring-up).
 *
 * When the serverless instrumentation hook fails, src/instrumentation.ts
 * records the cause on globalThis.__pixzBootError and continues booting in
 * a degraded state. This route reports that recorded cause so the exact
 * boot failure is retrievable with a plain curl from outside the platform
 * (Vercel's runtime log stream can be empty for early boot crashes on the
 * Hobby tier).
 *
 * Gated by the obscure-but-unauthenticated `x-boot-debug: pixz` header —
 * it exposes an internal stack trace, so remove this route (and the
 * globalThis slot) once the serverless boot is stable.
 */
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  if (request.headers.get("x-boot-debug") !== "pixz") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const bootError =
    (globalThis as { __pixzBootError?: { message: string; stack?: string } })
      .__pixzBootError ?? null;

  return Response.json({
    ok: !bootError,
    phase: getServerLifecyclePhase(),
    runtime: {
      vercel: process.env.VERCEL ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      node: process.version,
    },
    bootError: bootError
      ? { message: bootError.message, stack: bootError.stack ?? null }
      : null,
  });
}
