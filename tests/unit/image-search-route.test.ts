import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseJsonBody: vi.fn(),
  sendJson: vi.fn(),
  searchImages: vi.fn(),
}));

vi.mock('@electron/api/route-utils', () => ({
  parseJsonBody: (...args: unknown[]) => mocks.parseJsonBody(...args),
  sendJson: (...args: unknown[]) => mocks.sendJson(...args),
}));

vi.mock('@electron/services/image-search/image-search-service', () => ({
  searchImages: (...args: unknown[]) => mocks.searchImages(...args),
}));

describe('image search route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('runs an image search through the host API route', async () => {
    mocks.parseJsonBody.mockResolvedValue({
      query: '昨天创建的猫的图片',
      roots: ['C:\\Pictures'],
      limit: 10,
      now: '2026-04-27T10:30:00+08:00',
      semantic: true,
    });
    mocks.searchImages.mockResolvedValue({
      parsed: { contentTerms: ['猫'] },
      roots: ['C:\\Pictures'],
      totalScanned: 2,
      totalMatched: 1,
      results: [{ path: 'C:\\Pictures\\cat.jpg' }],
    });

    const { handleImageSearchRoutes } = await import('@electron/api/routes/image-search');

    const handled = await handleImageSearchRoutes(
      { method: 'POST' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/image-search/query'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(mocks.searchImages).toHaveBeenCalledWith({
      query: '昨天创建的猫的图片',
      roots: ['C:\\Pictures'],
      limit: 10,
      now: new Date('2026-04-27T10:30:00+08:00'),
      semantic: true,
    });
    expect(mocks.sendJson).toHaveBeenCalledWith(expect.anything(), 200, {
      parsed: { contentTerms: ['猫'] },
      roots: ['C:\\Pictures'],
      totalScanned: 2,
      totalMatched: 1,
      results: [{ path: 'C:\\Pictures\\cat.jpg' }],
    });
  });

  it('always enables semantic search (semantic is always-on)', async () => {
    mocks.parseJsonBody.mockResolvedValue({
      query: 'cat',
      roots: ['C:\\Pictures'],
    });
    mocks.searchImages.mockResolvedValue({
      parsed: { contentTerms: ['cat'] },
      roots: ['C:\\Pictures'],
      totalScanned: 1,
      totalMatched: 0,
      results: [],
    });

    const { handleImageSearchRoutes } = await import('@electron/api/routes/image-search');

    await handleImageSearchRoutes(
      { method: 'POST' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/image-search/query'),
      {} as never,
    );

    // Semantic is always true regardless of request body (always-on per D-04)
    expect(mocks.searchImages).toHaveBeenCalledWith({
      query: 'cat',
      roots: ['C:\\Pictures'],
      limit: undefined,
      now: undefined,
      semantic: true,
      similarTo: undefined,
    });
  });

  it('rejects missing query or roots', async () => {
    mocks.parseJsonBody.mockResolvedValue({ query: '', roots: [] });

    const { handleImageSearchRoutes } = await import('@electron/api/routes/image-search');

    const handled = await handleImageSearchRoutes(
      { method: 'POST' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/image-search/query'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(mocks.searchImages).not.toHaveBeenCalled();
    expect(mocks.sendJson).toHaveBeenCalledWith(expect.anything(), 400, {
      success: false,
      error: 'QUERY_AND_ROOTS_REQUIRED',
    });
  });
});
