import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  electronAppMock,
  startPingMock,
  markAliveMock,
  clearMonitorMock,
  terminateOwnedGatewayProcessMock,
} = vi.hoisted(() => ({
  electronAppMock: {
    getPath: () => '/tmp',
    isPackaged: false,
  },
  startPingMock: vi.fn(),
  markAliveMock: vi.fn(),
  clearMonitorMock: vi.fn(),
  terminateOwnedGatewayProcessMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: electronAppMock,
  utilityProcess: {
    fork: vi.fn(),
  },
}));

vi.mock('@electron/gateway/connection-monitor', () => ({
  GatewayConnectionMonitor: class MockGatewayConnectionMonitor {
    startPing(...args: unknown[]) {
      startPingMock(...args);
    }

    markAlive(...args: unknown[]) {
      markAliveMock(...args);
    }

    clear() {
      clearMonitorMock();
    }

    handlePong() {
      markAliveMock('pong');
    }

    getConsecutiveMisses() {
      return 0;
    }

    startHealthCheck() {
      // no-op
    }
  },
}));

vi.mock('@electron/gateway/supervisor', async () => {
  const actual = await vi.importActual<typeof import('@electron/gateway/supervisor')>(
    '@electron/gateway/supervisor',
  );
  return {
    ...actual,
    terminateOwnedGatewayProcess: (...args: unknown[]) => terminateOwnedGatewayProcessMock(...args),
  };
});

vi.mock('@electron/gateway/reload-policy', async () => {
  const actual = await vi.importActual<typeof import('@electron/gateway/reload-policy')>(
    '@electron/gateway/reload-policy',
  );
  return {
    ...actual,
    loadGatewayReloadPolicy: vi.fn().mockResolvedValue({ mode: 'hybrid', debounceMs: 2000 }),
  };
});

describe('GatewayManager heartbeat integration', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    electronAppMock.isPackaged = false;
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    terminateOwnedGatewayProcessMock.mockResolvedValue(undefined);
  });

  it('marks heartbeat alive on inbound websocket messages', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const handleMessage = (manager as unknown as { handleMessage: (message: unknown) => void }).handleMessage.bind(manager);

    handleMessage({ type: 'event', event: 'system.ready', payload: {} });

    expect(markAliveMock).toHaveBeenCalledWith('message');
  });

  it('starts ping monitor with heartbeat timeout hooks', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const ping = vi.fn();
    (manager as unknown as { ws: { readyState: number; ping: () => void } }).ws = {
      readyState: 1,
      ping,
    };

    const startPing = (manager as unknown as { startPing: () => void }).startPing.bind(manager);
    startPing();

    expect(startPingMock).toHaveBeenCalledTimes(1);
    const firstArg = startPingMock.mock.calls[0]?.[0];
    expect(firstArg).toEqual(
      expect.objectContaining({
        sendPing: expect.any(Function),
        onHeartbeatTimeout: expect.any(Function),
      }),
    );

    (firstArg as { sendPing: () => void }).sendPing();
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('disables active websocket heartbeat for packaged Linux builds', async () => {
    electronAppMock.isPackaged = true;
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const shouldUseActiveHeartbeat = (manager as unknown as {
      shouldUseActiveWebSocketHeartbeat: () => boolean;
    }).shouldUseActiveWebSocketHeartbeat.bind(manager);

    expect(shouldUseActiveHeartbeat()).toBe(false);
  });

  it('keeps active websocket heartbeat in non-Windows dev builds', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const shouldUseActiveHeartbeat = (manager as unknown as {
      shouldUseActiveWebSocketHeartbeat: () => boolean;
    }).shouldUseActiveWebSocketHeartbeat.bind(manager);

    expect(shouldUseActiveHeartbeat()).toBe(true);
  });

  it('exposes best-effort force termination for quit timeout paths', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const ownedChild = {
      pid: 8899,
    } as Electron.UtilityProcess;
    (manager as unknown as { process: Electron.UtilityProcess | null }).process = ownedChild;
    (manager as unknown as { ownsProcess: boolean }).ownsProcess = true;

    const terminate = (manager as unknown as { forceTerminateOwnedProcessForQuit: () => Promise<boolean> })
      .forceTerminateOwnedProcessForQuit.bind(manager);
    const result = await terminate();

    expect(result).toBe(true);
    expect(terminateOwnedGatewayProcessMock).toHaveBeenCalledWith(ownedChild);
    expect((manager as unknown as { process: Electron.UtilityProcess | null }).process).toBeNull();
  });
});
