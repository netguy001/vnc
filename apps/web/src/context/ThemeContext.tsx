import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'ioc_theme_mode';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {}
  return 'dark';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    mode === 'system' ? getSystemTheme() : mode
  );

  useEffect(() => {
    const next = mode === 'system' ? getSystemTheme() : mode;
    setResolvedTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>{children}</ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
