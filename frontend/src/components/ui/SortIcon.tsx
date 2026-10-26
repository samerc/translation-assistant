export function SortIcon({ field, sortBy, sortOrder }: { field: string; sortBy: string; sortOrder: 'ASC' | 'DESC' | string }) {
  if (sortBy !== field) return <span className="text-text-muted ml-1">↕</span>;
  return <span className="text-primary ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>;
}
