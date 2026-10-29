"use client";

import { useEffect } from "react";
import usePixzSettingsStore, {
  PIXZ_THEMES,
  PIXZ_DENSITIES,
  PIXZ_RADII,
  type PixzThemeName,
  type PixzDensity,
  type PixzRadius,
  type PixzMotion,
} from "@/store/pixzSettingsStore";
import { PixzLogo } from "@/shared/components/PixzLogo";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

/**
 * Pixzference appearance controls — theme (9), density (3), corner radius (3)
 * and a motion kill-switch. Everything persists to localStorage and applies
 * instantly via data attributes on <html> (see src/app/pixz.css).
 */
export default function PixzThemePicker() {
  const { pixzTheme, density, radius, motion, setPixzTheme, setDensity, setRadius, setMotion } =
    usePixzSettingsStore();

  // Re-apply on mount in case the bootstrap script missed (SSR/static export).
  useEffect(() => {
    usePixzSettingsStore.getState().initPixz();
  }, []);

  return (
    <div className="pixz-card pixz-fade-up rounded-card border border-border bg-surface p-5 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-control bg-bg-subtle border border-border">
          <PixzLogo size={22} />
        </div>
        <div>
          <h3 className="ci-heading text-base leading-tight">Pixzference Appearance</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Theme, density, corner style and motion — applies instantly, saved per browser.
          </p>
        </div>
      </div>

      {/* Theme grid */}
      <div>
        <p className="text-sm font-medium mb-2.5">Theme</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5 pixz-stagger">
          {PIXZ_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPixzTheme(t.id as PixzThemeName)}
              aria-pressed={pixzTheme === t.id}
              className={cn(
                "pixz-card pixz-focus-glow group relative flex items-center gap-2.5 rounded-control border p-2.5 text-left transition-colors",
                pixzTheme === t.id
                  ? "border-primary bg-accent-light/40"
                  : "border-border bg-bg-subtle hover:bg-surface"
              )}
            >
              <span
                className="h-7 w-7 shrink-0 rounded-control border border-border-strong/40"
                style={{
                  background:
                    t.id === "neon" || t.id === "matrix"
                      ? `linear-gradient(135deg, ${t.swatch} 55%, #101018 55%)`
                      : t.swatch,
                }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium leading-tight">{t.label}</span>
                <span className="block text-[11px] text-text-muted">
                  {t.id === "default" ? "Kit default" : "Pixz preset"}
                </span>
              </span>
              {pixzTheme === t.id && (
                <Icon name="check_circle" size={16} className="ml-auto text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div>
        <p className="text-sm font-medium mb-2.5">Layout density</p>
        <div className="inline-flex rounded-control border border-border bg-bg-subtle p-1 gap-1">
          {PIXZ_DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDensity(d.id as PixzDensity)}
              aria-pressed={density === d.id}
              className={cn(
                "pixz-focus-glow rounded-[calc(var(--radius-control)-2px)] px-3.5 py-1.5 text-xs font-medium transition-colors",
                density === d.id ? "bg-primary text-primary-ink" : "text-text-muted hover:text-text-main"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Corner radius */}
      <div>
        <p className="text-sm font-medium mb-2.5">Corner style</p>
        <div className="inline-flex rounded-control border border-border bg-bg-subtle p-1 gap-1">
          {PIXZ_RADII.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRadius(r.id as PixzRadius)}
              aria-pressed={radius === r.id}
              className={cn(
                "pixz-focus-glow rounded-[calc(var(--radius-control)-2px)] px-3.5 py-1.5 text-xs font-medium transition-colors",
                radius === r.id ? "bg-primary text-primary-ink" : "text-text-muted hover:text-text-main"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Motion toggle */}
      <div className="flex items-center justify-between gap-4 rounded-control border border-border bg-bg-subtle p-3">
        <div className="flex items-start gap-2.5">
          <Icon name="movie" size={18} className="text-text-muted mt-0.5" />
          <div>
            <p className="text-sm font-medium leading-tight">Motion &amp; animations</p>
            <p className="text-xs text-text-muted mt-0.5">
              Page transitions, staggered reveals, hover glow and the animated logo. Automatically
              disabled when your OS prefers reduced motion.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={motion === "on"}
          onClick={() => setMotion((motion === "on" ? "off" : "on") as PixzMotion)}
          className={cn(
            "pixz-focus-glow relative h-6 w-11 shrink-0 rounded-full border transition-colors",
            motion === "on" ? "bg-primary border-primary" : "bg-muted border-border"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform",
              motion === "on" ? "translate-x-[22px]" : "translate-x-[3px]"
            )}
            style={{ height: 18, width: 18 }}
          />
        </button>
      </div>
    </div>
  );
}
