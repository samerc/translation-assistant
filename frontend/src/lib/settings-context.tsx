'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

interface AppSettings {
  baseCurrency: string;
  companyName: string;
}

interface SettingsContextValue {
  baseCurrency: string;
  companyName: string;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  baseCurrency: 'USD',
  companyName: '',
  loaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SettingsContextValue>({
    baseCurrency: 'USD',
    companyName: '',
    loaded: false,
  });

  useEffect(() => {
    api.get<AppSettings>('/settings')
      .then((s) =>
        setValue({
          baseCurrency: s.baseCurrency || 'USD',
          companyName: s.companyName || '',
          loaded: true,
        }),
      )
      .catch(() => setValue((v) => ({ ...v, loaded: true })));
  }, []);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** App-wide settings (base currency, company name). Falls back to USD before load. */
export function useSettings() {
  return useContext(SettingsContext);
}
