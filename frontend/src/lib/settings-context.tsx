'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

interface AppSettings {
  baseCurrency: string;
  companyName: string;
  invoiceFooter: string | null;
}

interface SettingsContextValue {
  baseCurrency: string;
  companyName: string;
  /** Default notes for new invoices (Settings > General). */
  invoiceFooter: string;
  loaded: boolean;
  /** Re-read after the organization's settings change. */
  reload: () => void;
}

const DEFAULTS = { baseCurrency: 'USD', companyName: '', invoiceFooter: '', loaded: false };

const SettingsContext = createContext<SettingsContextValue>({ ...DEFAULTS, reload: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Omit<SettingsContextValue, 'reload'>>(DEFAULTS);

  const reload = useCallback(() => {
    api.get<AppSettings>('/settings')
      .then((s) =>
        setValue({
          baseCurrency: s.baseCurrency || 'USD',
          companyName: s.companyName || '',
          invoiceFooter: s.invoiceFooter || '',
          loaded: true,
        }),
      )
      .catch(() => setValue((v) => ({ ...v, loaded: true })));
  }, []);

  useEffect(reload, [reload]);

  return <SettingsContext.Provider value={{ ...value, reload }}>{children}</SettingsContext.Provider>;
}

/** App-wide settings (base currency, company name, invoice notes). Falls back to USD before load. */
export function useSettings() {
  return useContext(SettingsContext);
}
