'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface CalendarEvent {
  id: string;
  type: 'job_deadline' | 'invoice_due';
  title: string;
  date: string;
  status: string;
  color: string;
  link: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.get<CalendarEvent[]>(`/calendar/events?month=${month}&year=${year}`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [month, year]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();

    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthLast = new Date(year, month - 1, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      days.push({ day: prevMonthLast - i, month: month - 1 || 12, year: month === 1 ? year - 1 : year, isCurrentMonth: false });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, month, year, isCurrentMonth: true });
    }

    // Next month padding (fill to 42 = 6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, month: month + 1 > 12 ? 1 : month + 1, year: month === 12 ? year + 1 : year, isCurrentMonth: false });
    }

    return days;
  }, [month, year]);

  const goToToday = () => {
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const getDateKey = (d: { day: number; month: number; year: number }) =>
    `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  const colorMap: Record<string, string> = {
    primary: 'bg-primary',
    warning: 'bg-warning',
    danger: 'bg-danger',
    success: 'bg-success',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={goToToday} className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary hover:bg-border/50">
            Today
          </button>
          <button onClick={prevMonth} className="p-2 rounded-lg text-text-secondary hover:bg-bg">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
          </button>
          <h2 className="text-lg font-semibold text-text min-w-[180px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button onClick={nextMonth} className="p-2 rounded-lg text-text-secondary hover:bg-bg">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendar grid */}
        <div className="flex-1">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {DAY_NAMES.map((d) => (
                <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-text-secondary bg-bg">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {calendarDays.map((d, i) => {
                const key = getDateKey(d);
                const dayEvents = eventsByDate.get(key) || [];
                const isToday = key === todayStr;
                const isSelected = key === selectedDate;

                return (
                  <button key={i}
                    onClick={() => setSelectedDate(key === selectedDate ? null : key)}
                    className={`min-h-[60px] md:min-h-[90px] p-1 md:p-1.5 border-b border-r border-border text-left transition-colors
                      ${!d.isCurrentMonth ? 'bg-bg/50' : 'bg-surface hover:bg-bg/30'}
                      ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                    `}>
                    <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full
                      ${isToday ? 'bg-primary text-white' : d.isCurrentMonth ? 'text-text' : 'text-text-muted'}
                    `}>
                      {d.day}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div key={ev.id} className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorMap[ev.color] || 'bg-primary'}`} />
                          <span className="text-xs text-text-secondary truncate">{ev.title.split(' — ')[0]}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-xs text-text-muted">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Event detail panel */}
        <div className="w-full lg:w-80 lg:flex-shrink-0">
          <div className="bg-surface border border-border rounded-xl p-5 sticky top-20">
            <h3 className="text-sm font-semibold text-text-secondary mb-3">
              {selectedDate
                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                : 'Select a day'}
            </h3>
            {!selectedDate ? (
              <p className="text-sm text-text-muted">Click on a day to see events</p>
            ) : selectedEvents.length === 0 ? (
              <p className="text-sm text-text-muted">No events on this day</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <button key={ev.id} onClick={() => router.push(ev.link)}
                    className="w-full text-left p-3 rounded-lg bg-bg hover:bg-border/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${colorMap[ev.color] || 'bg-primary'}`} />
                      <span className="text-xs font-medium text-text-muted uppercase">
                        {ev.type === 'job_deadline' ? 'Job Deadline' : 'Invoice Due'}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-text">{ev.title}</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold
                      ${ev.status === 'overdue' ? 'bg-danger-light text-danger' : ev.type === 'job_deadline' ? 'bg-primary-light text-primary' : 'bg-warning-light text-warning'}
                    `}>{ev.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
