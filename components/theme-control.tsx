"use client";

import { useState, useSyncExternalStore } from "react";
import { isTheme, themeStorageKey } from "@/lib/theme";

function readTheme() {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : "system";
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== themeStorageKey && event.key !== null) return;
    document.documentElement.dataset.theme = isTheme(event.newValue) ? event.newValue : "system";
    onChange();
  }
  window.addEventListener("cartograph:theme", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("cartograph:theme", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");
  const [error, setError] = useState("");
  return (
    <div className="theme-control">
      <label htmlFor="theme">Theme</label>
      <select id="theme" value={theme} onChange={(event) => {
        const value = event.target.value;
        if (!isTheme(value)) return;
        document.documentElement.dataset.theme = value;
        try {
          localStorage.setItem(themeStorageKey, value);
          setError("");
        } catch {
          setError("Your browser could not save the theme.");
        }
        window.dispatchEvent(new Event("cartograph:theme"));
      }}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      {error && <span role="alert" className="theme-error">{error}</span>}
    </div>
  );
}
