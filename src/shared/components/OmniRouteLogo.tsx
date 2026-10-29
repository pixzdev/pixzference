"use client";

// Pixzference: this module keeps the OmniRoute export names (imported in ~14 places —
// Sidebar, landing, error pages, status, forgot-password…) but renders the Pixzference
// brand mark instead. White-label operators keep full control via name/logoSrc.
import { PixzLogo, PixzLockup } from "@/shared/components/PixzLogo";
import { cn } from "@/shared/utils/cn";

type OmniRouteLogoProps = { size?: number; className?: string };

/** Pixzference product glyph (animated signal core) — inline SVG, basePath-safe. */
export default function OmniRouteLogo({ size = 20, className = "" }: OmniRouteLogoProps) {
  return <PixzLogo size={size} className={className} />;
}

interface OmniRouteLockupProps {
  name?: string | null;
  logoSrc?: string | null;
  className?: string;
}

/** Full lockup: white-label operators get their own name/logo; the default brand is Pixzference. */
export function OmniRouteLockup({ name, logoSrc, className }: OmniRouteLockupProps) {
  if (name || logoSrc) {
    return (
      <span
        role="img"
        aria-label={name || "Pixzference"}
        className={cn("inline-flex items-center gap-2", className)}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator-supplied white-label logo (data: or remote URL), not a static/known asset
          <img src={logoSrc} alt="" className="size-6 object-contain" />
        ) : (
          <PixzLogo size={24} />
        )}
        {name && (
          <span aria-hidden="true" className="truncate font-semibold">
            {name}
          </span>
        )}
      </span>
    );
  }
  return <PixzLockup className={className} />;
}
