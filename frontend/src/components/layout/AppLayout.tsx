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
      <main className={`mt-14 transition-[margin] duration-200 overflow-y-auto h-[calc(100vh-3.5rem)] ${collapsed ? 'md:ml-16' : 'md:ml-60'}`}>
        <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8 md:py-7">
          {children}
        </div>
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
