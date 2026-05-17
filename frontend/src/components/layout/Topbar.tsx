'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/lib/sidebar-context';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';

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

export default function Topbar() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { user } = useAuth();
  const { collapsed, setMobileOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Close search on navigation
  useEffect(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults(null);
  }, [pathname]);

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

  // Search
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      setSearchLoading(true);
      api.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`)
        .then((res) => { setSearchResults(res); setShowSearch(true); })
        .catch(() => setSearchResults(null))
        .finally(() => setSearchLoading(false));
    } else {
      setSearchResults(null);
      setShowSearch(false);
    }
  }, [debouncedQuery]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
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
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    await api.post('/notifications/mark-all-read').catch(() => {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'job_status_change': return <JobIcon className="w-4 h-4 text-primary" />;
      case 'deadline_approaching': return <ClockIcon className="w-4 h-4 text-warning" />;
      case 'invoice_overdue': return <InvoiceIcon className="w-4 h-4 text-danger" />;
      case 'job_assigned': return <UserPlusIcon className="w-4 h-4 text-success" />;
      default: return <BellIcon className="w-4 h-4 text-text-muted" />;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <header className={`fixed top-0 right-0 h-14 bg-surface border-b border-border flex items-center justify-between px-3 md:px-6 z-10 transition-all duration-200 left-0 ${collapsed ? 'md:left-16' : 'md:left-56'}`}>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="p-2 rounded-lg text-text-secondary hover:bg-bg md:hidden mr-2"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>
      {/* Global Search */}
      <div className="relative flex-1 min-w-0 max-w-[180px] sm:max-w-xs md:max-w-md" ref={searchRef}>
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search clients, jobs, templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => { if (searchResults) setShowSearch(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); } }}
          className="w-full pl-10 pr-4 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        {showSearch && searchResults && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
            {searchLoading && (
              <div className="px-4 py-3 text-sm text-text-muted">Searching...</div>
            )}
            {!searchLoading && searchResults.counts.clients + searchResults.counts.jobs + searchResults.counts.templates + searchResults.counts.invoices === 0 && (
              <div className="px-4 py-6 text-sm text-text-muted text-center">No results found</div>
            )}

            {searchResults.clients.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-text-muted bg-bg border-b border-border">
                  Clients <span className="text-text-muted">({searchResults.counts.clients})</span>
                </div>
                {searchResults.clients.map((c) => (
                  <button key={c.id} onClick={() => { router.push(`/clients/${c.id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-bg/50 flex items-center gap-3 border-b border-border last:border-0">
                    <ClientIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div>
                      <div className="text-sm text-text">{c.name}</div>
                      <div className="text-xs text-text-muted capitalize">{c.type}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.jobs.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-text-muted bg-bg border-b border-border">
                  Jobs <span className="text-text-muted">({searchResults.counts.jobs})</span>
                </div>
                {searchResults.jobs.map((j) => (
                  <button key={j.id} onClick={() => { router.push(`/jobs/${j.id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-bg/50 flex items-center gap-3 border-b border-border last:border-0">
                    <JobIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div>
                      <div className="text-sm text-text">{j.title}</div>
                      <div className="text-xs text-text-muted">{j.jobNumber} {j.clientName ? `- ${j.clientName}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.templates.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-text-muted bg-bg border-b border-border">
                  Templates <span className="text-text-muted">({searchResults.counts.templates})</span>
                </div>
                {searchResults.templates.map((t) => (
                  <button key={t.id} onClick={() => { router.push(`/templates/${t.id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-bg/50 flex items-center gap-3 border-b border-border last:border-0">
                    <TemplateIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div>
                      <div className="text-sm text-text">{t.name}</div>
                      <div className="text-xs text-text-muted capitalize">{t.type}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.invoices.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-text-muted bg-bg border-b border-border">
                  Invoices <span className="text-text-muted">({searchResults.counts.invoices})</span>
                </div>
                {searchResults.invoices.map((inv) => (
                  <button key={inv.id} onClick={() => { router.push(`/invoices/${inv.id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-bg/50 flex items-center gap-3 border-b border-border last:border-0">
                    <InvoiceIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div>
                      <div className="text-sm text-text">{inv.invoiceNumber}</div>
                      <div className="text-xs text-text-muted">{inv.clientName} - {inv.status}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-4">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg text-text-secondary hover:bg-bg transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleNotifications}
            className="relative p-2 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            aria-label="Notifications"
          >
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-danger text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] md:w-96 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-text">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <button key={n.id} onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-bg/50 border-b border-border last:border-0 flex gap-3 ${!n.isRead ? 'bg-primary-light/30' : ''}`}>
                      <div className="flex-shrink-0 mt-0.5">{getTypeIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text">{n.title}</div>
                        <div className="text-xs text-text-secondary mt-0.5 truncate">{n.message}</div>
                        <div className="text-xs text-text-muted mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                      {!n.isRead && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <button onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                  className="text-xs text-primary hover:underline w-full text-center">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <button className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold" title={user ? `${user.firstName} ${user.lastName}` : ''}>
          {initials}
        </button>
      </div>
    </header>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  );
}

function JobIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5z" clipRule="evenodd" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}

function InvoiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
    </svg>
  );
}

function ClientIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  );
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}
