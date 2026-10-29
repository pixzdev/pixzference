"use client";

import { cn } from "@/shared/utils/cn";

/**
 * Pixzference animated logo — a hexagonal "signal core" with a rotating
 * conic-gradient ring, pulsing center and two orbiting relay dots (the router
 * metaphor: one endpoint, many providers). Pure SVG + CSS, zero JS animation
 * cost, respects data-pixz-motion="off" via the pixz-paused class rules below.
 */
export function PixzLogo({
  size = 28,
  className = "",
  animated = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("pixz-logo", className)}
      suppressHydrationWarning
    >
      <defs>
        <linearGradient id="pixzGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--ci-color-accent, #ff8a3d)" />
          <stop offset="100%" stopColor="var(--ci-chart-3, #8a5cf6)" />
        </linearGradient>
        <linearGradient id="pixzCore" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--ci-color-accent, #ff8a3d)" />
          <stop offset="100%" stopColor="var(--ci-color-accent-hover, #ffa260)" />
        </linearGradient>
      </defs>

      {/* Outer rotating ring */}
      <g
        className={animated ? "pixz-logo-ring" : undefined}
        style={{ transformOrigin: "32px 32px" }}
      >
        <circle
          cx="32"
          cy="32"
          r="29"
          stroke="url(#pixzGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="46 26 12 30"
        />
      </g>

      {/* Hexagon body */}
      <path
        d="M32 10 L50.4 20.5 L50.4 43.5 L32 54 L13.6 43.5 L13.6 20.5 Z"
        stroke="url(#pixzGrad)"
        strokeWidth="2.5"
        fill="var(--ci-color-surface, #fff)"
      />

      {/* Pulsing core */}
      <g className={animated ? "pixz-logo-core" : undefined} style={{ transformOrigin: "32px 32px" }}>
        <path d="M26 24 L26 40 M26 24 L38 40 M38 24 L38 40" stroke="url(#pixzCore)" strokeWidth="4.5" strokeLinecap="round" />
      </g>

      {/* Orbiting relay dots */}
      <g className={animated ? "pixz-logo-orbit" : undefined} style={{ transformOrigin: "32px 32px" }}>
        <circle cx="32" cy="3.5" r="3.2" fill="var(--ci-color-accent, #ff8a3d)" />
      </g>
      <g className={animated ? "pixz-logo-orbit-rev" : undefined} style={{ transformOrigin: "32px 32px" }}>
        <circle cx="32" cy="60.5" r="2.4" fill="var(--ci-chart-3, #8a5cf6)" />
      </g>

      <style>{`
        .pixz-logo-ring { animation: pixzLogoSpin 9s linear infinite; }
        .pixz-logo-core { animation: pixzLogoPulse 2.6s ease-in-out infinite; }
        .pixz-logo-orbit { animation: pixzLogoSpin 5.5s linear infinite; }
        .pixz-logo-orbit-rev { animation: pixzLogoSpinRev 7.5s linear infinite; }
        @keyframes pixzLogoSpin { to { transform: rotate(360deg); } }
        @keyframes pixzLogoSpinRev { to { transform: rotate(-360deg); } }
        @keyframes pixzLogoPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.86); opacity: 0.72; }
        }
        [data-pixz-motion="off"] .pixz-logo-ring,
        [data-pixz-motion="off"] .pixz-logo-core,
        [data-pixz-motion="off"] .pixz-logo-orbit,
        [data-pixz-motion="off"] .pixz-logo-orbit-rev { animation: none !important; }
        @media (prefers-reduced-motion: reduce) {
          .pixz-logo-ring, .pixz-logo-core,
          .pixz-logo-orbit, .pixz-logo-orbit-rev { animation: none !important; }
        }
      `}</style>
    </svg>
  );
}

/** Full lockup: logo + wordmark. */
export function PixzLockup({
  name = "Pixzference",
  size = 30,
  className = "",
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} role="img" aria-label={name}>
      <PixzLogo size={size} />
      <span
        aria-hidden="true"
        className="font-semibold tracking-tight pixz-gradient-text"
        style={{ fontSize: size * 0.62 }}
      >
        {name}
      </span>
    </span>
  );
}

export default PixzLogo;
