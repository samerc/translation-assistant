'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/lib/sidebar-context';
import { useAuth } from '@/lib/auth-context';
import {
  BellIcon, BriefcaseIcon, CalendarIcon, ChartIcon, FileTextIcon, HomeIcon, PanelLeftIcon, ReceiptIcon, SettingsIcon, UsersIcon, XIcon,
} from '@/components/ui/icons';

interface NavItem {
  label: string;
  href: string;
  icon: typeof HomeIcon;
  permission?: string;
}

const navGroups: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: HomeIcon },
      { label: 'Jobs', href: '/jobs', icon: BriefcaseIcon },
      { label: 'Calendar', href: '/calendar', icon: CalendarIcon, permission: 'calendar:read' },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Clients', href: '/clients', icon: UsersIcon },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIcon, permission: 'invoices:read' },
      { label: 'Reports', href: '/reports', icon: ChartIcon, permission: 'reports:read' },
    ],
  },
  {
    label: 'Library',
    items: [
      { label: 'Templates', href: '/templates', icon: FileTextIcon },
    ],
  },
];

const bottomItems: NavItem[] = [
  { label: 'Notifications', href: '/notifications', icon: BellIcon },
  { label: 'Settings', href: '/settings', icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();
  const { hasPermission } = useAuth();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 h-9 rounded-lg text-sm transition-colors ${collapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'} ${
          active
            ? 'bg-primary-light text-primary-text font-semibold'
            : 'text-text-secondary font-medium hover:bg-sunken hover:text-text'
        }`}
      >
        <item.icon className="w-[18px] h-[18px]" />
        <span className={collapsed ? 'md:sr-only' : ''}>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed left-0 top-0 h-screen bg-surface border-r border-border flex flex-col z-40 transition-[width,transform] duration-200
          w-64 ${collapsed ? 'md:w-16' : 'md:w-60'}
          ${mobileOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full'}
          md:translate-x-0 md:shadow-none
        `}
      >
        {/* Brand */}
        <div className={`flex items-center h-14 gap-2.5 ${collapsed ? 'md:justify-center md:px-0 px-4' : 'px-4'}`}>
          <div className="w-7 h-7 rounded-lg bg-primary text-white grid place-items-center text-xs font-bold flex-none">TA</div>
          <span className={`font-bold text-sm tracking-tight text-text truncate ${collapsed ? 'md:hidden' : ''}`}>Translation Assistant</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto btn btn-ghost btn-icon btn-sm md:hidden"
            aria-label="Close menu"
          >
            <XIcon />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-3 flex flex-col gap-5" aria-label="Main">
          {navGroups.map((group, i) => {
            const items = group.items.filter((item) => !item.permission || hasPermission(item.permission));
            if (items.length === 0) return null;
            return (
              <div key={group.label ?? i} className="flex flex-col gap-0.5">
                {group.label && (
                  <div className={`px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted ${collapsed ? 'md:hidden' : ''}`}>
                    {group.label}
                  </div>
                )}
                {items.map(renderItem)}
              </div>
            );
          })}
        </nav>

        {/* Bottom items */}
        <div className="border-t border-border px-3 py-3 flex flex-col gap-0.5">
          {bottomItems.map(renderItem)}
          <button
            onClick={toggle}
            className={`hidden md:flex items-center gap-2.5 h-9 rounded-lg text-sm font-medium text-text-muted hover:bg-sunken hover:text-text transition-colors ${collapsed ? 'justify-center' : 'px-2.5'}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            <PanelLeftIcon className="w-[18px] h-[18px]" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
