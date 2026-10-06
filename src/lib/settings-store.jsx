import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const DEFAULT_SETTINGS = { theme: "navy", menuPosition: "top", menuCollapsed: false };
const STORAGE_KEY = "employee-appraisal-settings";
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...DEFAULT_SETTINGS, ...(saved || {}) };
  } catch { return DEFAULT_SETTINGS; }
}
const SettingsContext = createContext(null);
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => {
    document.documentElement.dataset.appTheme = settings.theme;
    document.documentElement.dataset.menuPosition = settings.menuPosition;
    document.documentElement.dataset.menuCollapsed = String(settings.menuCollapsed);
  }, [settings]);
  const value = useMemo(() => ({
    settings,
    saveSettings(next) {
      const normalized = { ...DEFAULT_SETTINGS, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setSettings(normalized);
    },
    resetSettings() {
      localStorage.removeItem(STORAGE_KEY);
      setSettings(DEFAULT_SETTINGS);
    },
  }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
