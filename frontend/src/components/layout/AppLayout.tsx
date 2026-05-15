'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar />
      <Topbar />
      <main className={`mt-14 p-6 transition-all duration-200 overflow-y-auto h-[calc(100vh-3.5rem)] ${collapsed ? 'ml-16' : 'ml-56'}`}>
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
