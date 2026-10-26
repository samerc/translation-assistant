'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/lib/sidebar-context';
import { api } from '@/lib/api';
import { confirmLeave } from '@/lib/unsaved-changes';
import { useDebounce } from '@/lib/use-debounce';
import { useNow } from '@/lib/use-now';
import { formatTimeAgo } from '@/lib/format';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import {
  BellIcon, BriefcaseIcon, ClockIcon, FileTextIcon, KeyIcon, LogOutIcon, MenuIcon, MoonIcon, ReceiptIcon, SearchIcon, SunIcon,
  UserPlusIcon, UsersIcon,
} from '@/components/ui/icons';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface SearchResults {
  clients: { id: string; name: string; type: string }[];
  jobs: { id: string; jobNumber: string; title: string; status: string; clientName: string }[];
  templates: { id: string; name: string; type: string }[];
  invoices: { id: string; invoiceNumber: string; clientName: string; status: string }[];
  counts: { clients: number; jobs: number; templates: number; invoices: number };
}

const dropdownClass = 'absolute top-full mt-2 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50';

export default function Topbar() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const { collapsed, setMobileOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // User menu (avatar dropdown) + change-password modal
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    router.push('/login');
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [resultsQuery, setResultsQuery] = useState<string | null>(null); // query the current results belong to
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const searchActive = debouncedQuery.length >= 2;
  const searchLoading = searchActive && resultsQuery !== debouncedQuery;
  const visibleResults = searchActive ? searchResults : null;
  const now = useNow();

  // Close search on navigation
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults(null);
  }

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : '?';

  // Poll unread count every 30 seconds
  useEffect(() => {
    const fetchCount = () => {
      api.get<{ count: number }>('/notifications/unread-count')
        .then((res) => setUnreadCount(res.count))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Ctrl+K / Cmd+K focuses the global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Search
  // Loading/visibility are derived (searchLoading, visibleResults). `ignore`
  // drops responses for queries the user has already typed past.
  useEffect(() => {
    if (!searchActive) return;
    let ignore = false;
    api.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => { if (!ignore) { setSearchResults(res); setShowSearch(true); } })
      .catch(() => { if (!ignore) setSearchResults(null); })
      .finally(() => { if (!ignore) setResultsQuery(debouncedQuery); });
    return () => { ignore = true; };
  }, [debouncedQuery, searchActive]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleNotifications = () => {
    if (!showNotifications) {
      api.get<{ data: NotificationItem[] }>('/notifications?limit=10')
        .then((res) => setNotifications(res.data))
        .catch(() => {});
    }
    setShowNotifications(!showNotifications);
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowNotifications(false);
    if (n.link && (await confirmLeave())) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    await api.post('/notifications/mark-all-read').catch(() => {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const openResult = async (href: string) => {
    if (!(await confirmLeave())) return;
    router.push(href);
    setShowSearch(false);
    setSearchQuery('');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'job_status_change': return <BriefcaseIcon className="w-4 h-4 text-primary" />;
      case 'deadline_approaching': return <ClockIcon className="w-4 h-4 text-warning" />;
      case 'invoice_overdue': return <ReceiptIcon className="w-4 h-4 text-danger" />;
      case 'job_assigned': return <UserPlusIcon className="w-4 h-4 text-success" />;
      default: return <BellIcon className="w-4 h-4 text-text-muted" />;
    }
  };

  const totalResults = visibleResults
    ? visibleResults.counts.clients + visibleResults.counts.jobs + visibleResults.counts.templates + visibleResults.counts.invoices
    : 0;

  return (
    <header className={`fixed top-0 right-0 h-14 bg-surface/85 backdrop-blur border-b border-border flex items-center gap-2 px-3 md:px-6 z-20 transition-[left] duration-200 left-0 ${collapsed ? 'md:left-16' : 'md:left-60'}`}>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="btn btn-ghost btn-icon md:hidden" aria-label="Open menu">
        <MenuIcon className="w-5 h-5" />
      </button>

      {/* Global Search */}
      <div className="relative flex-1 min-w-0 max-w-md" ref={searchRef}>
        <label className="input input-group bg-bg shadow-none">
          <SearchIcon />
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Search clients, jobs, templates and invoices"
            placeholder="Search clients, jobs, invoices…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (visibleResults) setShowSearch(true); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); e.currentTarget.blur(); } }}
            className="text-sm"
          />
          <kbd className="hidden sm:inline-block font-mono text-[11px] leading-5 px-1.5 rounded border border-border bg-surface text-text-muted">Ctrl K</kbd>
        </label>

        {showSearch && visibleResults && (
          <div className={`${dropdownClass} left-0 right-0 max-h-[28rem] overflow-y-auto py-1`}>
            {searchLoading && <div className="px-4 py-3 text-sm text-text-muted">Searching…</div>}
            {!searchLoading && totalResults === 0 && (
              <div className="px-4 py-8 text-sm text-text-muted text-center">No results for &ldquo;{debouncedQuery}&rdquo;</div>
            )}

            <ResultGroup label="Clients" count={visibleResults.counts.clients}>
              {visibleResults.clients.map((c) => (
                <ResultRow key={c.id} icon={<UsersIcon />} title={c.name} subtitle={<span className="capitalize">{c.type}</span>}
                  onClick={() => openResult(`/clients/${c.id}`)} />
              ))}
            </ResultGroup>
            <ResultGroup label="Jobs" count={visibleResults.counts.jobs}>
              {visibleResults.jobs.map((j) => (
                <ResultRow key={j.id} icon={<BriefcaseIcon />} title={j.title}
                  subtitle={<><span className="font-mono">{j.jobNumber}</span>{j.clientName ? ` · ${j.clientName}` : ''}</>}
                  onClick={() => openResult(`/jobs/${j.id}`)} />
              ))}
            </ResultGroup>
            <ResultGroup label="Templates" count={visibleResults.counts.templates}>
              {visibleResults.templates.map((t) => (
                <ResultRow key={t.id} icon={<FileTextIcon />} title={t.name} subtitle={<span className="capitalize">{t.type}</span>}
                  onClick={() => openResult(`/templates/${t.id}`)} />
              ))}
            </ResultGroup>
            <ResultGroup label="Invoices" count={visibleResults.counts.invoices}>
              {visibleResults.invoices.map((inv) => (
                <ResultRow key={inv.id} icon={<ReceiptIcon />} title={<span className="font-mono">{inv.invoiceNumber}</span>}
                  subtitle={<>{inv.clientName} · <span className="capitalize">{inv.status}</span></>}
                  onClick={() => openResult(`/invoices/${inv.id}`)} />
              ))}
            </ResultGroup>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={toggleDarkMode} className="btn btn-ghost btn-icon" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Light mode' : 'Dark mode'}>
          {darkMode ? <SunIcon className="w-[18px] h-[18px]" /> : <MoonIcon className="w-[18px] h-[18px]" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button onClick={toggleNotifications} className="btn btn-ghost btn-icon relative" aria-label="Notifications">
            <BellIcon className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-danger text-white text-[10px] font-bold rounded-full grid place-items-center ring-2 ring-surface">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className={`${dropdownClass} -right-12 sm:right-0 w-[calc(100vw-1.5rem)] sm:w-96`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-text">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs font-medium text-primary-text hover:underline">Mark all read</button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-text-muted">You&apos;re all caught up.</div>
                ) : (
                  notifications.map((n) => (
                    <button key={n.id} onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-sunken border-b border-border last:border-0 flex gap-3 transition-colors ${!n.isRead ? 'bg-primary-light/40' : ''}`}>
                      <div className="flex-shrink-0 mt-0.5">{getTypeIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text">{n.title}</div>
                        <div className="text-xs text-text-secondary mt-0.5 truncate">{n.message}</div>
                        <div className="text-xs text-text-muted mt-1">{formatTimeAgo(n.createdAt, now)}</div>
                      </div>
                      {!n.isRead && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <button onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                  className="text-xs font-medium text-primary-text hover:underline w-full text-center">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* User avatar + menu */}
        <div className="relative ml-1" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="w-8 h-8 rounded-full bg-primary-light text-primary-text grid place-items-center text-xs font-semibold hover:ring-2 hover:ring-primary/30 transition"
            title={user ? `${user.firstName} ${user.lastName}` : ''}
            aria-label="Account menu"
          >
            {initials}
          </button>

          {showUserMenu && (
            <div className={`${dropdownClass} right-0 w-60 py-1`}>
              {user && (
                <div className="px-4 py-2.5 border-b border-border mb-1">
                  <div className="text-sm font-semibold text-text truncate">{user.firstName} {user.lastName}</div>
                  <div className="text-xs text-text-muted truncate">{user.email}</div>
                </div>
              )}
              <button
                onClick={() => { setShowUserMenu(false); setShowPasswordModal(true); }}
                className="w-[calc(100%-0.5rem)] mx-1 rounded-md text-left px-3 py-2 text-sm text-text hover:bg-sunken flex items-center gap-2.5"
              >
                <KeyIcon className="w-4 h-4 text-text-muted" />
                Change password
              </button>
              <button
                onClick={handleLogout}
                className="w-[calc(100%-0.5rem)] mx-1 rounded-md text-left px-3 py-2 text-sm text-danger hover:bg-danger-light flex items-center gap-2.5"
              >
                <LogOutIcon className="w-4 h-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </header>
  );
}

function ResultGroup({ label, count, children }: { label: string; count: number; children: ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label} <span className="font-normal normal-case tracking-normal">({count})</span>
      </div>
      {children}
    </div>
  );
}

function ResultRow({ icon, title, subtitle, onClick }: { icon: ReactNode; title: ReactNode; subtitle: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-[calc(100%-0.5rem)] mx-1 rounded-md text-left px-3 py-2 hover:bg-sunken flex items-center gap-3 transition-colors">
      <span className="w-7 h-7 rounded-md bg-sunken text-text-secondary grid place-items-center flex-none [&_svg]:w-4 [&_svg]:h-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-text truncate">{title}</span>
        <span className="block text-xs text-text-muted truncate">{subtitle}</span>
      </span>
    </button>
  );
}
