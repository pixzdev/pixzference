"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PixzThemeName =
  | "default"
  | "ember"
  | "aurora"
  | "neon"
  | "matrix"
  | "rosewood"
  | "ocean"
  | "candy"
  | "mono";
export type PixzDensity = "compact" | "cozy" | "spacious";
export type PixzRadius = "sharp" | "soft" | "round";
export type PixzMotion = "on" | "off";

export const PIXZ_THEMES: Array<{ id: PixzThemeName; label: string; swatch: string }> = [
  { id: "default", label: "OmniRoute Lime", swatch: "#d8ff00" },
  { id: "ember", label: "Ember", swatch: "#ff8a3d" },
  { id: "aurora", label: "Aurora", swatch: "#14e0b0" },
  { id: "neon", label: "Neon", swatch: "#ff2fd0" },
  { id: "matrix", label: "Matrix", swatch: "#38ff7a" },
  { id: "rosewood", label: "Rosewood", swatch: "#e5497a" },
  { id: "ocean", label: "Ocean", swatch: "#2e8bff" },
  { id: "candy", label: "Candy", swatch: "#8a5cf6" },
  { id: "mono", label: "Mono Ink", swatch: "#171a1f" },
];

export const PIXZ_DENSITIES: Array<{ id: PixzDensity; label: string }> = [
  { id: "compact", label: "Compact" },
  { id: "cozy", label: "Cozy" },
  { id: "spacious", label: "Spacious" },
];

export const PIXZ_RADII: Array<{ id: PixzRadius; label: string }> = [
  { id: "sharp", label: "Sharp" },
  { id: "soft", label: "Soft" },
  { id: "round", label: "Round" },
];

interface PixzSettingsState {
  pixzTheme: PixzThemeName;
  density: PixzDensity;
  radius: PixzRadius;
  motion: PixzMotion;
  setPixzTheme: (t: PixzThemeName) => void;
  setDensity: (d: PixzDensity) => void;
  setRadius: (r: PixzRadius) => void;
  setMotion: (m: PixzMotion) => void;
  initPixz: () => void;
}

/** Apply the Pixzference appearance attributes to <html>. */
export function applyPixzAttributes(s: {
  pixzTheme: PixzThemeName;
  density: PixzDensity;
  radius: PixzRadius;
  motion: PixzMotion;
}) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (s.pixzTheme && s.pixzTheme !== "default") root.setAttribute("data-pixz-theme", s.pixzTheme);
  else root.removeAttribute("data-pixz-theme");
  root.setAttribute("data-pixz-density", s.density || "cozy");
  root.setAttribute("data-pixz-radius", s.radius || "soft");
  root.setAttribute("data-pixz-motion", s.motion || "on");
}

/** Pre-hydration restore — mirrors the theme bootstrap inline script in layout.tsx. */
export const PIXZ_BOOTSTRAP_SCRIPT = `(function(){try{
var raw=localStorage.getItem('pixz-settings');var s=raw?(JSON.parse(raw).state||null):null;
var t=s&&s.pixzTheme,d=s&&s.density,r=s&&s.radius,m=s&&s.motion;
var root=document.documentElement;
if(t&&t!=='default'){root.setAttribute('data-pixz-theme',t);}else{root.removeAttribute('data-pixz-theme');}
root.setAttribute('data-pixz-density',d||'cozy');
root.setAttribute('data-pixz-radius',r||'soft');
root.setAttribute('data-pixz-motion',m||'on');
}catch(e){
document.documentElement.setAttribute('data-pixz-density','cozy');
document.documentElement.setAttribute('data-pixz-radius','soft');
document.documentElement.setAttribute('data-pixz-motion','on');
}})();`;

const usePixzSettingsStore = create<PixzSettingsState>()(
  persist(
    (set, get) => ({
      pixzTheme: "default",
      density: "cozy",
      radius: "soft",
      motion: "on",
      setPixzTheme: (pixzTheme) => {
        set({ pixzTheme });
        applyPixzAttributes(get());
      },
      setDensity: (density) => {
        set({ density });
        applyPixzAttributes(get());
      },
      setRadius: (radius) => {
        set({ radius });
        applyPixzAttributes(get());
      },
      setMotion: (motion) => {
        set({ motion });
        applyPixzAttributes(get());
      },
      initPixz: () => applyPixzAttributes(get()),
    }),
    { name: "pixz-settings" }
  )
);

export default usePixzSettingsStore;
