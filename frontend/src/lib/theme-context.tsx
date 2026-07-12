'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
  const hydratedFromUser = useRef(false);

  useEffect(() => {
    const savedPalette = localStorage.getItem('palette') as Palette | null;
    const savedDark = localStorage.getItem('darkMode');
    if (savedPalette) setPaletteState(savedPalette);
    if (savedDark) setDarkModeState(savedDark === 'true');
  }, []);

  // On login, adopt the user's saved preferences (cross-device), once.
  useEffect(() => {
    if (user && !hydratedFromUser.current) {
      hydratedFromUser.current = true;
      if (PALETTES.includes(user.colorPalette as Palette)) setPaletteState(user.colorPalette as Palette);
      if (typeof user.darkMode === 'boolean') setDarkModeState(user.darkMode);
    }
    if (!user) hydratedFromUser.current = false; // allow re-hydrate on next login
  }, [user]);

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
