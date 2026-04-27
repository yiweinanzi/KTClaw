import { mkdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { searchImages } from '@electron/services/image-search/image-search-service';

async function createImage(root: string, relativePath: string, isoTime: string): Promise<string> {
  const filePath = join(root, relativePath);
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, Buffer.from('fake-image'));
  const date = new Date(isoTime);
  await utimes(filePath, date, date);
  return filePath;
}

describe('image search service', () => {
  it('filters by file modification time and content terms', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-${Date.now()}`);
    const cat = await createImage(root, '2026-04-26-cat.jpg', '2026-04-26T03:00:00.000Z');
    await createImage(root, '2026-04-26-dog.jpg', '2026-04-26T04:00:00.000Z');
    await createImage(root, '2026-04-25-cat.jpg', '2026-04-25T03:00:00.000Z');

    const result = await searchImages({
      query: '昨天创建的猫的图片',
      roots: [root],
      now: new Date('2026-04-27T10:30:00+08:00'),
    });

    expect(result.parsed.timeRange?.label).toBe('昨天');
    expect(result.results.map((entry) => entry.path)).toEqual([cat]);
    expect(result.results[0]).toMatchObject({
      fileName: '2026-04-26-cat.jpg',
      match: {
        matchedTerms: ['猫'],
      },
    });
  });

  it('supports combined previous-weekend photo searches', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-${Date.now()}-weekend`);
    const beach = await createImage(root, 'trip/beach-photo.png', '2026-04-25T06:00:00.000Z');
    await createImage(root, 'trip/beach-old.png', '2026-04-21T06:00:00.000Z');

    const result = await searchImages({
      query: '上周末在海边拍的照片',
      roots: [root],
      now: new Date('2026-04-27T10:30:00+08:00'),
    });

    expect(result.results.map((entry) => entry.path)).toEqual([beach]);
    expect(result.parsed.contentTerms).toEqual(['海边']);
  });

  it('matches Chinese penguin searches against English file names', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-${Date.now()}-penguin`);
    const penguin = await createImage(root, 'wildlife/antarctica-penguin.jpg', '2026-04-26T04:00:00.000Z');
    await createImage(root, 'wildlife/antarctica-seal.jpg', '2026-04-26T04:00:00.000Z');

    const result = await searchImages({
      query: '帮我搜索一张企鹅的图片',
      roots: [root],
      now: new Date('2026-04-27T10:30:00+08:00'),
    });

    expect(result.parsed.contentTerms).toEqual(['企鹅']);
    expect(result.results.map((entry) => entry.path)).toEqual([penguin]);
    expect(result.results[0].match).toMatchObject({
      matchedTerms: ['企鹅'],
      reasons: ['content:企鹅'],
    });
  });

  it('can rank images by semantic similarity when filenames do not match the query', async () => {
    const root = join(tmpdir(), `ktclaw-image-search-${Date.now()}-semantic`);
    const penguin = await createImage(root, 'wildlife/img-001.jpg', '2026-04-26T04:00:00.000Z');
    const seal = await createImage(root, 'wildlife/img-002.jpg', '2026-04-26T04:00:00.000Z');

    const result = await searchImages({
      query: '帮我搜索一张企鹅的图片',
      roots: [root],
      now: new Date('2026-04-27T10:30:00+08:00'),
      semantic: true,
      semanticProvider: {
        async embedText() {
          return [1, 0];
        },
        async embedImage(filePath: string) {
          return filePath === penguin ? [0.98, 0.02] : [0.1, 0.9];
        },
      },
    });

    expect(result.results.map((entry) => entry.path)).toEqual([penguin]);
    expect(result.results[0].match).toMatchObject({
      score: expect.any(Number),
      matchedTerms: ['企鹅'],
      reasons: ['semantic:企鹅'],
    });
  });
});
