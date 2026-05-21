import { useEffect, useState } from "react";
import { api } from "./api";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "trace.theme";
const THEME_CHANGED_EVENT = "trace-theme-changed";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function setThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyThemePreference(preference);
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, { detail: preference })
  );
}

export function initializeTheme(): void {
  applyThemePreference(getStoredThemePreference());
}

export async function loadPersistedThemePreference(): Promise<ThemePreference> {
  try {
    const { preference } = await api.preferences.getTheme();
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    applyThemePreference(preference);
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGED_EVENT, { detail: preference })
    );
    return preference;
  } catch {
    return getStoredThemePreference();
  }
}

export async function persistThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await api.preferences.setTheme(preference);
  } catch {
    // LocalStorage still keeps the preference for browser/dev mode even if the
    // backend is unavailable.
  }
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    getStoredThemePreference()
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(preference)
  );

  useEffect(() => {
    const sync = () => {
      const nextPreference = getStoredThemePreference();
      setPreferenceState(nextPreference);
      setResolvedTheme(resolveTheme(nextPreference));
      applyThemePreference(nextPreference);
    };
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onThemeChanged = (event: Event) => {
      const custom = event as CustomEvent<ThemePreference>;
      const nextPreference = isThemePreference(custom.detail)
        ? custom.detail
        : getStoredThemePreference();
      setPreferenceState(nextPreference);
      setResolvedTheme(resolveTheme(nextPreference));
    };

    sync();
    loadPersistedThemePreference();
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
      media.removeEventListener("change", sync);
    };
  }, []);

  const setPreference = (nextPreference: ThemePreference) => {
    setThemePreference(nextPreference);
    persistThemePreference(nextPreference);
    setPreferenceState(nextPreference);
    setResolvedTheme(resolveTheme(nextPreference));
  };

  return { preference, resolvedTheme, setPreference };
}
