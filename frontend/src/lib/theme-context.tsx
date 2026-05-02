'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Palette = 'indigo' | 'ocean' | 'teal' | 'slate';

interface ThemeContextType {
  palette: Palette;
  darkMode: boolean;
  setPalette: (palette: Palette) => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<Palette>('indigo');
  const [darkMode, setDarkModeState] = useState(false);

  useEffect(() => {
    const savedPalette = localStorage.getItem('palette') as Palette | null;
    const savedDark = localStorage.getItem('darkMode');
    if (savedPalette) setPaletteState(savedPalette);
    if (savedDark) setDarkModeState(savedDark === 'true');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    localStorage.setItem('palette', palette);
  }, [palette]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const setPalette = (p: Palette) => setPaletteState(p);
  const setDarkMode = (d: boolean) => setDarkModeState(d);
  const toggleDarkMode = () => setDarkModeState((prev) => !prev);

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
