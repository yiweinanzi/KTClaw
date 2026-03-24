import { existsSync, mkdtempSync, rmSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSendJson, mockHomedir, mockExecFile, mockExecSync } = vi.hoisted(() => ({
  mockSendJson: vi.fn(),
  mockHomedir: vi.fn(),
  mockExecFile: vi.fn(),
  mockExecSync: vi.fn(),
}));

vi.mock('@electron/api/route-utils', () => ({
  sendJson: (...args: unknown[]) => mockSendJson(...args),
  parseJsonBody: vi.fn(),
}));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => mockHomedir(),
  };
});

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

describe('GET /api/memory and POST /api/memory/reindex', () => {
  let homeDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    homeDir = mkdtempSync(join(tmpdir(), 'clawx-memory-status-'));
    workspaceDir = join(homeDir, '.openclaw', 'agents', 'main', 'workspace');
    await mkdir(workspaceDir, { recursive: true });
    mockHomedir.mockReturnValue(homeDir);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('uses async execFile for memory status and returns parsed JSON', async () => {
    mockExecFile.mockImplementation((file, args, options, callback) => {
      const payload = JSON.stringify({
        indexed: true,
        lastIndexed: '2026-03-22T00:00:00Z',
        totalEntries: 12,
        vectorAvailable: true,
        embeddingProvider: 'openai',
      });
      callback(null, payload, '');
      return {} as never;
    });

    const { handleMemoryRoutes } = await import('@electron/api/routes/memory');
    const handled = await handleMemoryRoutes(
      { method: 'GET' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/memory'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(mockSendJson).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [file, args, options] = mockExecFile.mock.calls[0] as [string, string[], { timeout?: number }];
    expect(file).toBe('openclaw');
    expect(args).toEqual(['memory', 'status', '--deep']);
    expect(options.timeout).toBe(8000);

    const [, statusCode, payload] = mockSendJson.mock.calls[0] as [unknown, number, { status: { indexed: boolean } }];
    expect(statusCode).toBe(200);
    expect(payload.status.indexed).toBe(true);
  });

  it('uses async execFile for reindex and returns ok on success', async () => {
    mockExecFile.mockImplementation((file, args, options, callback) => {
      callback(null, 'done', '');
      return {} as never;
    });

    const { handleMemoryRoutes } = await import('@electron/api/routes/memory');
    const handled = await handleMemoryRoutes(
      { method: 'POST' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/memory/reindex'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(mockSendJson).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [file, args, options] = mockExecFile.mock.calls[0] as [string, string[], { timeout?: number }];
    expect(file).toBe('openclaw');
    expect(args).toEqual(['memory', 'reindex']);
    expect(options.timeout).toBe(30000);

    const [, statusCode, payload] = mockSendJson.mock.calls[0] as [unknown, number, { ok?: boolean }];
    expect(statusCode).toBe(200);
    expect(payload.ok).toBe(true);
  });
});
