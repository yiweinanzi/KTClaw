import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const getSettingMock = vi.fn();
const parseJsonBodyMock = vi.fn();
const sendJsonMock = vi.fn();
const buildOpenClawControlUiUrlMock = vi.fn(() => 'http://127.0.0.1:18789/#token=secret-token');

vi.mock('@electron/utils/store', () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
}));

vi.mock('@electron/api/route-utils', () => ({
  parseJsonBody: (...args: unknown[]) => parseJsonBodyMock(...args),
  sendJson: (...args: unknown[]) => sendJsonMock(...args),
}));

vi.mock('@electron/utils/openclaw-control-ui', () => ({
  buildOpenClawControlUiUrl: (...args: unknown[]) => buildOpenClawControlUiUrlMock(...args),
}));

describe('gateway routes security', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSettingMock.mockResolvedValue('secret-token');
  });

  it('does not expose the gateway token from gateway-info', async () => {
    const { handleGatewayRoutes } = await import('@electron/api/routes/gateway');

    const handled = await handleGatewayRoutes(
      { method: 'GET' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/app/gateway-info'),
      {
        gatewayManager: {
          getStatus: () => ({ state: 'running', port: 18789 }),
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, {
      wsUrl: 'ws://127.0.0.1:18789/ws',
      port: 18789,
    });
  });

  it('does not return a tokenized control-ui URL payload', async () => {
    const { handleGatewayRoutes } = await import('@electron/api/routes/gateway');

    const handled = await handleGatewayRoutes(
      { method: 'GET' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/gateway/control-ui'),
      {
        gatewayManager: {
          getStatus: () => ({ state: 'running', port: 18789 }),
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, {
      success: true,
      url: 'http://127.0.0.1:18789/',
      port: 18789,
    });
  });

  it('rejects non-staged media paths for send-with-media', async () => {
    const { handleGatewayRoutes } = await import('@electron/api/routes/gateway');
    const rpcMock = vi.fn();
    const filePath = join(homedir(), 'not-staged.png');
    parseJsonBodyMock.mockResolvedValue({
      sessionKey: 'session-1',
      message: 'hello',
      idempotencyKey: 'idem-1',
      media: [
        {
          filePath,
          mimeType: 'image/png',
          fileName: 'not-staged.png',
        },
      ],
    });

    const handled = await handleGatewayRoutes(
      { method: 'POST' } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/chat/send-with-media'),
      {
        gatewayManager: {
          rpc: rpcMock,
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 400, {
      success: false,
      error: 'MEDIA_PATH_NOT_STAGED',
      filePath,
    });
  });
});
