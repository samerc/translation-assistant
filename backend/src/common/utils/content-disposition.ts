/**
 * Content-Disposition header value that keeps the real (possibly non-ASCII)
 * file name via RFC 5987 `filename*`, with an ASCII-only `filename` fallback.
 * Path separators, quotes and control characters are stripped either way.
 */
export function contentDisposition(
  fileName: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const clean =
    fileName
      .replace(/[/\\]/g, '_')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f"]/g, '')
      .trim() || 'download';
  const ascii = clean.replace(/[^\w.-]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
