"use client";

import { useEffect, useSyncExternalStore } from "react";
import { setTheme, type ThemeChoice } from "./theme";

function subscribe(cb: () => void) {
  window.addEventListener("esi-theme", cb);
  return () => window.removeEventListener("esi-theme", cb);
}
const current = () => (document.documentElement.dataset.themeChoice as ThemeChoice | undefined) ?? "system";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };

/** Cycles system → light → dark. The choice is stored in this browser only. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, current, () => "system" as ThemeChoice);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => current() === "system" && setTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[choice])}
      className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink"
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[NEXT[choice]]}.`}
      title={`Theme: ${LABEL[choice]}`}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" fill="currentColor" />
      </svg>
      <span className="max-sm:sr-only">{LABEL[choice]}</span>
    </button>
  );
}
