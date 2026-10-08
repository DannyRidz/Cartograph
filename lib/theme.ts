export type Theme = "system" | "light" | "dark";
export const themeStorageKey = "cartograph.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

// Run before paint. CSS follows system preference changes without JavaScript.
export const themeScript = `try { var t = localStorage.getItem("${themeStorageKey}"); if (t === "light" || t === "dark" || t === "system") document.documentElement.dataset.theme = t; } catch {}`;
