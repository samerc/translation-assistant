import { createReadStream, unlink } from 'fs';
import { pipeline } from 'stream';
import type { Response } from 'express';

/**
 * Streams a temporary export file to the client, then deletes it. Uses
 * `pipeline` so the file is removed on success, stream error, *and* client
 * disconnect (a plain `stream.on('end')` never fires on an aborted download,
 * leaving the file on disk).
 */
export function streamThenDelete(filePath: string, res: Response): void {
  pipeline(createReadStream(filePath), res, () => {
    unlink(filePath, () => {
      /* already gone — nothing to do */
    });
  });
}
