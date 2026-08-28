import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Kumo keys its dark palette off `data-mode="dark"` on an ancestor. We drive
 * that attribute on <html> and mirror it to `color-scheme` so native controls
 * follow along. The stored preference key is kept as `admin-theme` for
 * continuity with the previous UI.
 */
const STORAGE_KEY = 'admin-theme';

export type ThemePref = 'light' | 'dark';

function systemPref(): ThemePref {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedPref(): ThemePref {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : systemPref();
}

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  root.dataset.mode = pref;
  root.style.colorScheme = pref;
}

/** Called once from main.tsx before React mounts, to avoid a theme flash. */
export function applyStoredTheme(): void {
  apply(storedPref());
}

interface ThemeValue {
  theme: ThemePref;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue>({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePref>(storedPref);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: ThemePref = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
