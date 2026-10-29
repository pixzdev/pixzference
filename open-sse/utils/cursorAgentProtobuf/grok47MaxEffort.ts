import { resolveRegisteredFeatureFlag } from "@/shared/utils/featureFlagResolverBridge";

/**
 * #17386: Cursor's docs list exactly four Grok 4.7 effort levels (low/medium/high/xhigh), but
 * the catalog code was earlier verified live with `max` returning HTTP 200 through
 * AgentService/Run. Conflicting evidence, so dropping `max` (catalog fallback aliases and the
 * forwarded effort parameter) is opt-in behind this flag; default off keeps `max` as before.
 *
 * #10692: this module is reachable from client bundles (provider detail page via
 * cursorAutoCatalog -> mergeProviderModelListing), so it must resolve the flag through
 * the resolver bridge — NEVER a static import of `@/shared/utils/featureFlags`, which
 * reads the SQLite override table through `@/lib/db/core` and drags `fs`/`sharp`/the
 * whole server stack into the browser bundle (webpack "Module not found: Can't resolve
 * 'fs'"). On the server the bridge resolves exactly like `isFeatureFlagEnabled`
 * (featureFlags.ts registers itself as the resolver); in the browser it falls back to
 * the env-var-only check, matching the imageRegistry.ts precedent.
 */
export const CURSOR_GROK_47_DROP_MAX_EFFORT_FLAG = "CURSOR_GROK_47_DROP_MAX_EFFORT";

export function isCursorGrok47MaxEffortDropped(): boolean {
  try {
    return resolveRegisteredFeatureFlag(CURSOR_GROK_47_DROP_MAX_EFFORT_FLAG);
  } catch {
    // Unreadable flag store fails closed: keep the old behavior (max stays).
    return false;
  }
}
