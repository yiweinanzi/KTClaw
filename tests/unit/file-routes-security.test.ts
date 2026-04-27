import type { IncomingMessage, ServerResponse } from 'http';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendJson: vi.fn(),
  parseJsonBody: vi.fn(async (req: IncomingMessage & { __body?: unknown }) => req.__body ?? {}),
}));

vi.mock('@electron/api/route-utils', () => ({
  parseJsonBody: mocks.parseJsonBody,
  sendJson: mocks.sendJson,
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\tmp'),
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => ({ toPNG: () => Buffer.from('') }),
    })),
  },
}));

function createRequest(
  method: string,
  url: string,
  body?: unknown,
): IncomingMessage & { __body?: unknown } {
  return {
    method,
    __body: body,
  } as IncomingMessage & { __body?: unknown };
}

describe('file route security', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not read thumbnails from non-staged file paths', async () => {
    const { handleFileRoutes } = await import('@electron/api/routes/files');
    const filePath = join(process.cwd(), 'package.json');

    const handled = await handleFileRoutes(
      createRequest('POST', '/api/files/thumbnails', {
        paths: [{ filePath, mimeType: 'image/png' }],
      }),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/files/thumbnails'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(mocks.sendJson).toHaveBeenCalledWith(expect.anything(), 200, {
      [filePath]: {
        preview: null,
        fileSize: 0,
      },
    });
  });
});
