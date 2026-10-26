/**
 * Placeholder grammar for Word templates (docxtemplater, `{` `}` delimiters):
 *   {field_key}            a value
 *   {#group_key} … {/group_key}   repeat the enclosed content once per entry of a
 *                          repeatable group (fields sharing that groupKey); works
 *                          around paragraphs and table rows
 * Groups don't nest — documents only have one level of repeatable entries.
 */

const NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface PlaceholderScan {
  /** Unique field keys, in order of first appearance. */
  fields: string[];
  /** Field key → the group loop it appears inside (absent when outside any loop). */
  groupOf: Record<string, string>;
  /** Group loop names, in order of appearance. */
  groups: string[];
  malformed: { text: string; reason: string }[];
}

function reasonFor(inner: string): string {
  if (!inner.trim()) return 'Empty placeholder';
  if (/\s/.test(inner))
    return `Contains spaces — use underscores instead (e.g., {${inner.trim().replace(/\s+/g, '_')}})`;
  if (/^[0-9]/.test(inner)) return 'Cannot start with a number';
  return 'Contains invalid characters — use only letters, numbers, and underscores';
}

/** Scan the plain text of a Word document for placeholders and group loops. */
export function scanWordPlaceholders(text: string): PlaceholderScan {
  const scan: PlaceholderScan = {
    fields: [],
    groupOf: {},
    groups: [],
    malformed: [],
  };
  let open: string | null = null;
  const tagRegex = /\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const raw = match[0];
    const inner = match[1];
    const kind = inner[0] === '#' || inner[0] === '/' ? inner[0] : '';
    const name = kind ? inner.slice(1) : inner;

    if (!NAME.test(name)) {
      scan.malformed.push({ text: raw, reason: reasonFor(name) });
      continue;
    }

    if (kind === '#') {
      if (open) {
        scan.malformed.push({
          text: raw,
          reason: `Groups cannot be nested — close {/${open}} first`,
        });
        continue;
      }
      open = name;
      if (!scan.groups.includes(name)) scan.groups.push(name);
    } else if (kind === '/') {
      if (open !== name) {
        scan.malformed.push({
          text: raw,
          reason: open
            ? `Closes a group that isn't open — expected {/${open}}`
            : 'Closes a group that was never opened',
        });
        continue;
      }
      open = null;
    } else {
      if (!scan.fields.includes(name)) scan.fields.push(name);
      if (open && !scan.groupOf[name]) scan.groupOf[name] = open;
    }
  }

  if (open) {
    scan.malformed.push({
      text: `{#${open}}`,
      reason: `Group is never closed — add {/${open}}`,
    });
  }

  const opens = (text.match(/\{/g) || []).length;
  const closes = (text.match(/\}/g) || []).length;
  if (opens !== closes) {
    scan.malformed.push({
      text: '{...}',
      reason: `Mismatched braces: ${opens} opening and ${closes} closing braces found`,
    });
  }

  return scan;
}
