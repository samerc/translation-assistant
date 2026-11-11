/** `%term%` for a LIKE query, with the user's own `%`, `_` and `\` matched literally. */
export function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
