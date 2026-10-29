"use client";

import { useEffect } from "react";
import usePixzSettingsStore from "@/store/pixzSettingsStore";

/** Applies persisted Pixzference appearance attributes after hydration. */
export function PixzThemeProvider({ children }: { children: React.ReactNode }) {
  const initPixz = usePixzSettingsStore((s) => s.initPixz);
  useEffect(() => {
    initPixz();
  }, [initPixz]);
  return <>{children}</>;
}
