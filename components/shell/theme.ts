export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "esi.theme";

/** Inline script for <head>: applies the stored or system theme before first paint (no flash). */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var d=c==="dark"||((c===null||c==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themeChoice=c||"system";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export function resolvedTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage disabled */
  }
  document.documentElement.dataset.theme = resolvedTheme(choice);
  document.documentElement.dataset.themeChoice = choice;
  window.dispatchEvent(new CustomEvent("esi-theme", { detail: choice }));
}

/** Back to the system theme after "Clear all my data" (the stored choice is already removed). No-op outside a browser. */
export function resetTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolvedTheme("system");
  document.documentElement.dataset.themeChoice = "system";
  window.dispatchEvent(new CustomEvent("esi-theme", { detail: "system" }));
}
