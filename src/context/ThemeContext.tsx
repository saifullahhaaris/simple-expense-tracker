import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const KEY = "expense-tracker-theme"; // same key as the previous version: users keep their choice

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeValue | null>(null);

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#f5f5f5");
    try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === "dark" ? "light" : "dark")), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
