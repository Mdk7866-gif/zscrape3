"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "zscrape_theme";

interface ThemeContextType {
  /** What the user picked — including "system", which follows the OS. */
  theme: Theme;
  /** What's actually on screen right now, with "system" already resolved. */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Runs before first paint (see THEME_SCRIPT below) *and* whenever the choice
 * changes, so the class on <html> is always the single source of truth.
 */
function applyTheme(theme: Theme): "light" | "dark" {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
  return dark ? "dark" : "light";
}

/**
 * Injected into <head> and executed synchronously, before the browser paints
 * anything. Without it the page renders light, then React hydrates and flips it
 * to dark — a full-screen flash on every load for dark-mode users.
 *
 * Kept dependency-free and wrapped in try/catch because localStorage throws in
 * private-mode Safari and with third-party cookies blocked in an iframe.
 */
export const THEME_SCRIPT = `
(function(){try{
  var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"system";
  var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark",d);
  document.documentElement.style.colorScheme=d?"dark":"light";
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always "system" on the server so SSR markup is deterministic. The real
  // value is read from localStorage in the effect below; the pre-paint script
  // has already applied the correct class, so this never causes a flash.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* storage unavailable — fall back to system */
    }
    // Intentional one-shot sync from an external store (localStorage), which
    // doesn't exist during SSR and so can only be read after mount — the
    // sanctioned exception to "don't setState in an effect", not an oversight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored);
    setResolved(applyTheme(stored));
    setMounted(true);
  }, []);

  // Follow the OS while (and only while) the user is on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setResolved(applyTheme(t));
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* non-fatal: the choice just won't persist */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {/* `mounted` gates only the toggle's visual state, never the content,
          so nothing about the page layout depends on hydration finishing. */}
      <span hidden data-theme-mounted={mounted} />
      {children}
    </ThemeContext.Provider>
  );
}
