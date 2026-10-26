import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { Button } from './Button';

/** Card that holds a .data-table; scrolls sideways on narrow screens. */
export function TableCard({ minWidth = 640, footer, children }: { minWidth?: number; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table" style={{ minWidth }}>{children}</table>
      </div>
      {footer}
    </div>
  );
}

/** Column header that sorts on click. */
export function SortableTh({ field, sortBy, sortOrder, onSort, className = '', children }: {
  field: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onSort: (field: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sortBy === field;
  const Arrow = !active ? ArrowUpDownIcon : sortOrder === 'ASC' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th className={className} aria-sort={active ? (sortOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <Arrow className={`w-3 h-3 ${active ? 'text-text' : 'opacity-50'}`} />
      </span>
    </th>
  );
}

/** Chevron in the last cell of a clickable row; appears on hover. */
export function RowChevron() {
  return <td className="w-8 !pl-0"><ChevronRightIcon className="w-4 h-4 row-chevron" /></td>;
}

/** Table-card footer: item count on the left, previous/next on the right. */
export function Pagination({ page, totalPages, total, pageSize, noun, onPage }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border text-sm text-text-muted">
      <span className="tabular-nums">{from}–{to} of {total} {noun}</span>
      {totalPages > 1 && (
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" icon={<ChevronLeftIcon />} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
          <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Next<ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
