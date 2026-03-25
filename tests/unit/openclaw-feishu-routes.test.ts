// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const {
  sendJsonMock,
  serviceStatusMock,
  serviceInstallMock,
  serviceDoctorMock,
} = vi.hoisted(() => ({
  sendJsonMock: vi.fn(),
  serviceStatusMock: vi.fn(),
  serviceInstallMock: vi.fn(),
  serviceDoctorMock: vi.fn(),
}));

vi.mock('@electron/api/route-utils', () => ({
  sendJson: (...args: unknown[]) => sendJsonMock(...args),
  parseJsonBody: vi.fn().mockResolvedValue({}),
}));

vi.mock('@electron/services/feishu-integration', () => ({
  getFeishuIntegrationStatus: (...args: unknown[]) => serviceStatusMock(...args),
  installOrUpdateFeishuPlugin: (...args: unknown[]) => serviceInstallMock(...args),
  runFeishuIntegrationDoctor: (...args: unknown[]) => serviceDoctorMock(...args),
}));

function createRequest(method: string): IncomingMessage {
  return { method } as IncomingMessage;
}

describe('feishu routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns feishu integration status', async () => {
    serviceStatusMock.mockResolvedValueOnce({ nextAction: 'ready' });
    const { handleFeishuRoutes } = await import('@electron/api/routes/feishu');

    const handled = await handleFeishuRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/feishu/status'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, { nextAction: 'ready' });
  });

  it('installs or updates the feishu plugin through the host api', async () => {
    serviceInstallMock.mockResolvedValueOnce({ success: true, source: 'bundled' });
    const { handleFeishuRoutes } = await import('@electron/api/routes/feishu');

    const handled = await handleFeishuRoutes(
      createRequest('POST'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/feishu/install'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, { success: true, source: 'bundled' });
  });

  it('returns combined doctor payload for feishu integration', async () => {
    serviceDoctorMock.mockResolvedValueOnce({ doctor: { success: true }, validation: { valid: true } });
    const { handleFeishuRoutes } = await import('@electron/api/routes/feishu');

    const handled = await handleFeishuRoutes(
      createRequest('POST'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/feishu/doctor'),
      {} as never,
    );

    expect(handled).toBe(true);
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, {
      doctor: { success: true },
      validation: { valid: true },
    });
  });
});
