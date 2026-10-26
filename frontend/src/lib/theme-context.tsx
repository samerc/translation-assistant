'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth-context';

// Keep in sync with globals.css ([data-palette]) and the backend's UpdateUserDto @IsIn list.
export const PALETTE_OPTIONS = [
  { id: 'indigo', name: 'Indigo Minimal', color: '#4F46E5', accent: '#818CF8' },
  { id: 'ocean', name: 'Ocean Blue', color: '#1D4ED8', accent: '#3B82F6' },
  { id: 'teal', name: 'Teal Focus', color: '#0D9488', accent: '#2DD4BF' },
  { id: 'slate', name: 'Slate & Amber', color: '#334155', accent: '#F59E0B' },
  { id: 'violet', name: 'Violet', color: '#7C3AED', accent: '#A78BFA' },
  { id: 'orchid', name: 'Orchid', color: '#A21CAF', accent: '#E879F9' },
  { id: 'copper', name: 'Copper', color: '#C2410C', accent: '#FB923C' },
  { id: 'forest', name: 'Forest', color: '#15803D', accent: '#4ADE80' },
] as const;

export type Palette = (typeof PALETTE_OPTIONS)[number]['id'];
const PALETTES: readonly string[] = PALETTE_OPTIONS.map((p) => p.id);
const isPalette = (v: unknown): v is Palette => typeof v === 'string' && PALETTES.includes(v);

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
    const savedPalette = localStorage.getItem('palette');
    const savedDark = localStorage.getItem('darkMode');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isPalette(savedPalette)) setPaletteState(savedPalette);
    if (savedDark) setDarkModeState(savedDark === 'true');
  }, []);

  // On login, adopt the user's saved preferences (cross-device), once per login.
  if ((user?.id ?? null) !== hydratedUserId) {
    setHydratedUserId(user?.id ?? null);
    if (user) {
      if (isPalette(user.colorPalette)) setPaletteState(user.colorPalette);
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
