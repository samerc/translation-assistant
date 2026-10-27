'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useState } from 'react';
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context';
import { useAuth } from '@/lib/auth-context';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { Button } from '@/components/ui/Button';
import { AlertIcon } from '@/components/ui/icons';

/** Shown on every page until the seeded admin leaves the default password. */
function DefaultPasswordBanner() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user?.mustChangePassword) return null;
  return (
    <>
      <div role="alert" className="tone tone-warning rounded-lg px-3.5 py-3 mb-5 flex flex-wrap items-center gap-3 text-sm">
        <AlertIcon className="w-4 h-4 flex-none" />
        <span className="flex-1 min-w-[12rem]">
          <strong>You&apos;re still using the default admin password.</strong> Anyone who knows it can sign in — change it now.
        </span>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Change password</Button>
      </div>
      {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
    </>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar />
      <Topbar />
      <main className={`mt-14 transition-[margin] duration-200 overflow-y-auto h-[calc(100vh-3.5rem)] ${collapsed ? 'md:ml-16' : 'md:ml-60'}`}>
        <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8 md:py-7">
          <DefaultPasswordBanner />
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
