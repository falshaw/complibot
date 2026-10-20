"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { getTheme, subscribe } from "@/components/ThemeToggle";

/** Sonner toasts that follow the light/dark toggle. */
export function ThemedToaster() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");
  return (
    <Toaster
      position="top-right"
      richColors
      theme={theme === "dark" ? "dark" : "light"}
    />
  );
}
