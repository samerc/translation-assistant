'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const router = useRouter();

  const loadNotifications = () => {
    const params = new URLSearchParams();
    if (filter === 'unread') params.set('isRead', 'false');
    params.set('page', String(page));
    params.set('limit', '20');
    api.get<NotificationsResponse>(`/notifications?${params}`).then((res) => {
      setNotifications(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    });
  };

  useEffect(() => { loadNotifications(); }, [page, filter]);

  const handleClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    await api.post('/notifications/mark-all-read').catch(() => {});
    loadNotifications();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'job_status_change': return <span className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center"><JobIcon className="w-4 h-4 text-primary" /></span>;
      case 'deadline_approaching': return <span className="w-8 h-8 rounded-full bg-warning-light flex items-center justify-center"><ClockIcon className="w-4 h-4 text-warning" /></span>;
      case 'invoice_overdue': return <span className="w-8 h-8 rounded-full bg-danger-light flex items-center justify-center"><InvoiceIcon className="w-4 h-4 text-danger" /></span>;
      case 'job_assigned': return <span className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center"><UserPlusIcon className="w-4 h-4 text-success" /></span>;
      default: return <span className="w-8 h-8 rounded-full bg-bg flex items-center justify-center"><BellIcon className="w-4 h-4 text-text-muted" /></span>;
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
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Notifications</h1>
        <button onClick={handleMarkAllRead}
          className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50">
          Mark all as read
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-bg border border-border rounded-lg p-1 w-fit">
        <button onClick={() => { setFilter('all'); setPage(1); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'all' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>
          All
        </button>
        <button onClick={() => { setFilter('unread'); setPage(1); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'unread' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>
          Unread
        </button>
      </div>

      <span className="text-sm text-text-muted mb-4 block">{total} notification{total !== 1 ? 's' : ''}</span>

      {/* Notifications list */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {notifications.length === 0 ? (
          <div className="px-4 py-12 text-center text-text-muted text-sm">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </div>
        ) : (
          notifications.map((n) => (
            <button key={n.id} onClick={() => handleClick(n)}
              className={`w-full text-left px-5 py-4 hover:bg-bg/50 border-b border-border last:border-0 flex gap-4 items-start ${!n.isRead ? 'bg-primary-light/20' : ''}`}>
              {getTypeIcon(n.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{n.title}</span>
                  {!n.isRead && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />}
                </div>
                <p className="text-sm text-text-secondary mt-0.5">{n.message}</p>
                <span className="text-xs text-text-muted mt-1 block">{timeAgo(n.createdAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50">Previous</button>
          <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50">Next</button>
        </div>
      )}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>);
}
function JobIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5z" clipRule="evenodd" /></svg>);
}
function ClockIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>);
}
function InvoiceIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>);
}
function UserPlusIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>);
}
