/** Unique client-side ID, e.g. `uid('block')` → "block_3f2a…". randomUUID needs a secure context (HTTPS/localhost), so fall back elsewhere. */
export function uid(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${id}`;
}
