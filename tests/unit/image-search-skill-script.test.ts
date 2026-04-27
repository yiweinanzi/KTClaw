import { execFile } from 'node:child_process';
import { mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const scriptPath = resolve(process.cwd(), 'resources/preinstalled-skills/image-search/scripts/search-images.mjs');

async function createImage(root: string, relativePath: string, isoTime: string): Promise<string> {
  const filePath = join(root, relativePath);
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, Buffer.from('fake-image'));
  const date = new Date(isoTime);
  await utimes(filePath, date, date);
  return filePath;
}

describe('image-search bundled skill script', () => {
  it('returns JSON results for a combined time and content query', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-skill-${Date.now()}`);
    const expected = await createImage(root, 'cat.jpg', '2026-04-26T04:00:00.000Z');
    await createImage(root, 'dog.jpg', '2026-04-26T04:00:00.000Z');

    const { stdout } = await execFileAsync('node', [
      scriptPath,
      '--root',
      root,
      '--query',
      '昨天创建的猫的图片',
      '--now',
      '2026-04-27T10:30:00+08:00',
      '--json',
    ]);

    const parsed = JSON.parse(stdout) as { results: Array<{ path: string }> };
    expect(parsed.results.map((entry) => entry.path)).toEqual([expected]);
  });
});
