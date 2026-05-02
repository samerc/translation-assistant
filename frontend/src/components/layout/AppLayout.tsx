'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Sidebar />
      <Topbar />
      <main className="ml-56 mt-14 p-6 transition-all overflow-y-auto h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  );
}
