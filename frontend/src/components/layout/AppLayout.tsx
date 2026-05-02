'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <Topbar />
      <main className="ml-56 mt-14 p-6 transition-all">
        {children}
      </main>
    </div>
  );
}
