import { openSync, readSync, closeSync } from 'fs';

/**
 * Content-based file-type detection (magic bytes) so validation can't be fooled by
 * a spoofed extension or client-declared Content-Type. Works for both in-memory
 * uploads (multer memoryStorage → file.buffer) and disk uploads (diskStorage →
 * file.path).
 */

export function readHeaderBytes(source: { buffer?: Buffer; path?: string }, n = 16): Buffer | null {
  if (source.buffer) return source.buffer.subarray(0, n);
  if (source.path) {
    let fd: number | undefined;
    try {
      fd = openSync(source.path, 'r');
      const buf = Buffer.alloc(n);
      const read = readSync(fd, buf, 0, n, 0);
      return buf.subarray(0, read);
    } catch {
      return null;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  return null;
}

/** Identify a file from its leading bytes. Returns a canonical type or null. */
export function sniffType(header: Buffer): string | null {
  const h = header;
  if (h.length >= 8 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'png';
  if (h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpeg';
  if (h.length >= 4 && h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return 'pdf'; // %PDF
  if (h.length >= 4 && h[0] === 0x50 && h[1] === 0x4b && (h[2] === 0x03 || h[2] === 0x05 || h[2] === 0x07)) return 'zip'; // PK — docx/xlsx/pptx/zip
  if (h.length >= 6) {
    const sig = h.subarray(0, 6).toString('latin1');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'gif';
  }
  if (h.length >= 12 && h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Detect a PNG/JPEG image buffer; returns the safe MIME or null. */
export function sniffImageMime(buffer: Buffer): 'image/png' | 'image/jpeg' | null {
  const t = sniffType(buffer.subarray(0, 16));
  if (t === 'png') return 'image/png';
  if (t === 'jpeg') return 'image/jpeg';
  return null;
}

// Extensions whose real content we can positively verify — a mismatch is rejected.
export const VERIFIABLE_TYPES: Record<string, string> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.pdf': 'pdf',
  '.docx': 'zip',
  '.xlsx': 'zip',
  '.pptx': 'zip',
};

// Executable / script / markup types that are never accepted, regardless of the
// configurable allow-list (defense against stored active content).
export const ALWAYS_BLOCKED_EXTENSIONS = [
  '.exe', '.dll', '.com', '.msi', '.bat', '.cmd', '.sh', '.ps1',
  '.js', '.mjs', '.jse', '.vbs', '.wsf', '.jar',
  '.php', '.phtml', '.asp', '.aspx', '.jsp',
  '.html', '.htm', '.svg', '.xhtml', '.htaccess',
];
