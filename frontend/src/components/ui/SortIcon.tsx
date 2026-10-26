import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from './icons';

// For tables not yet on <SortableTh> (components/ui/DataTable.tsx).
export function SortIcon({ field, sortBy, sortOrder }: { field: string; sortBy: string; sortOrder: 'ASC' | 'DESC' | string }) {
  if (sortBy !== field) return <ArrowUpDownIcon className="inline w-3 h-3 ml-1 opacity-50" />;
  const Arrow = sortOrder === 'ASC' ? ArrowUpIcon : ArrowDownIcon;
  return <Arrow className="inline w-3 h-3 ml-1 text-text" />;
}
