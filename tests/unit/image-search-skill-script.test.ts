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
      'yesterday cat image',
      '--now',
      '2026-04-27T10:30:00+08:00',
      '--json',
    ]);

    const parsed = JSON.parse(stdout) as { results: Array<{ path: string }> };
    expect(parsed.results.map((entry) => entry.path)).toEqual([expected]);
  });

  it('understands conversational penguin searches', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-skill-${Date.now()}-penguin`);
    const expected = await createImage(root, 'antarctica-penguin.jpg', '2026-04-26T04:00:00.000Z');
    await createImage(root, 'antarctica-seal.jpg', '2026-04-26T04:00:00.000Z');

    const { stdout } = await execFileAsync('node', [
      scriptPath,
      '--root',
      root,
      '--query',
      'penguin image',
      '--now',
      '2026-04-27T10:30:00+08:00',
      '--json',
    ]);

    const parsed = JSON.parse(stdout) as {
      parsed: { contentTerms: string[] };
      results: Array<{ path: string; match: { matchedTerms: string[] } }>;
    };
    expect(parsed.parsed.contentTerms).toEqual(['penguin']);
    expect(parsed.results.map((entry) => entry.path)).toEqual([expected]);
    expect(parsed.results[0].match.matchedTerms).toEqual(['penguin']);
  });

  it('does not download semantic model files unless remote model loading is explicitly enabled', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-skill-${Date.now()}-semantic-disabled`);
    await createImage(root, 'img-001.jpg', '2026-04-26T04:00:00.000Z');

    const { stdout } = await execFileAsync('node', [
      scriptPath,
      '--root',
      root,
      '--query',
      'penguin',
      '--now',
      '2026-04-27T10:30:00+08:00',
      '--semantic',
      '--json',
    ], {
      env: {
        ...process.env,
        KTCLAW_IMAGE_SEARCH_MODEL_CACHE: join(root, 'empty-cache'),
        KTCLAW_IMAGE_SEARCH_ALLOW_REMOTE_MODELS: '',
        KTCLAW_IMAGE_SEARCH_LOCAL_MODEL_PATH: '',
      },
    });

    const parsed = JSON.parse(stdout) as {
      semantic: { requested: boolean; enabled: boolean; model: string | null; error?: string };
      results: Array<{ path: string }>;
    };
    expect(parsed.semantic).toMatchObject({
      requested: true,
      enabled: false,
      model: null,
    });
    expect(parsed.semantic.error).toContain('MobileCLIP model is not installed');
    expect(parsed.results).toEqual([]);
  });
});
