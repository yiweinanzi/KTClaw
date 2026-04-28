/**
 * Image directory auto-detection utility (D-01)
 *
 * Auto-detects system Pictures directories for each platform.
 * Extracted to a standalone module to avoid circular dependencies
 * when both electron/main/index.ts and electron/api/routes/image-search.ts need it.
 */
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Returns the list of default image directories for the current platform.
 * Only returns directories that actually exist on disk.
 * Per D-01: auto-detect system Pictures directories.
 */
export function getDefaultImageDirectories(): string[] {
  const home = homedir();
  const candidates: string[] = [];

  // Windows: Pictures + 照片 (Chinese locale alias)
  if (process.platform === 'win32') {
    candidates.push(join(home, 'Pictures'));
    candidates.push(join(home, '照片'));
  } else if (process.platform === 'darwin') {
    candidates.push(join(home, 'Pictures'));
  } else {
    // Linux and others
    candidates.push(join(home, 'Pictures'));
  }

  return candidates.filter((dir) => existsSync(dir));
}
