'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  mobileOpen: false,
  toggle: () => {},
  setMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{
      collapsed,
      mobileOpen,
      toggle: () => setCollapsed((c) => !c),
      setMobileOpen,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
