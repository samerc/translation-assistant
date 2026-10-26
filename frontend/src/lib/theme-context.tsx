'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth-context';

export type Palette = 'indigo' | 'ocean' | 'teal' | 'slate';
const PALETTES: Palette[] = ['indigo', 'ocean', 'teal', 'slate'];

interface ThemeContextType {
  palette: Palette;
  darkMode: boolean;
  setPalette: (palette: Palette) => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [palette, setPaletteState] = useState<Palette>('indigo');
  const [darkMode, setDarkModeState] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  // localStorage only exists after hydration, so the saved theme is applied in a
  // second pass (rendering it on the first pass would mismatch the server HTML).
  useEffect(() => {
    const savedPalette = localStorage.getItem('palette') as Palette | null;
    const savedDark = localStorage.getItem('darkMode');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedPalette) setPaletteState(savedPalette);
    if (savedDark) setDarkModeState(savedDark === 'true');
  }, []);

  // On login, adopt the user's saved preferences (cross-device), once per login.
  if ((user?.id ?? null) !== hydratedUserId) {
    setHydratedUserId(user?.id ?? null);
    if (user) {
      if (PALETTES.includes(user.colorPalette as Palette)) setPaletteState(user.colorPalette as Palette);
      if (typeof user.darkMode === 'boolean') setDarkModeState(user.darkMode);
    }
  }

  // Write preference changes back to the user's profile (best-effort).
  const persist = (patch: { colorPalette?: string; darkMode?: boolean }) => {
    if (typeof window !== 'undefined' && localStorage.getItem('accessToken')) {
      api.patch('/users/profile/me', patch).catch(() => {});
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    localStorage.setItem('palette', palette);
  }, [palette]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const setPalette = (p: Palette) => { setPaletteState(p); persist({ colorPalette: p }); };
  const setDarkMode = (d: boolean) => { setDarkModeState(d); persist({ darkMode: d }); };
  const toggleDarkMode = () => setDarkModeState((prev) => { persist({ darkMode: !prev }); return !prev; });

  return (
    <ThemeContext.Provider value={{ palette, darkMode, setPalette, setDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
