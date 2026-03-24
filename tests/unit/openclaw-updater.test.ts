import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAutoUpdater,
  mockAppGetVersion,
  mockGetSetting,
  mockSetSetting,
} = vi.hoisted(() => ({
  mockAutoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    channel: '',
    logger: undefined as unknown,
    on: vi.fn(),
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
  mockAppGetVersion: vi.fn(() => '1.0.0'),
  mockGetSetting: vi.fn(),
  mockSetSetting: vi.fn(),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock('electron', () => ({
  app: {
    getVersion: mockAppGetVersion,
  },
  BrowserWindow: class {},
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
  normalizeUpdateChannel: (channel: unknown) => {
    if (typeof channel !== 'string') return 'stable';
    const normalized = channel.trim().toLowerCase();
    if (normalized === 'latest') return 'stable';
    if (normalized === 'beta') return 'beta';
    if (normalized === 'dev' || normalized === 'alpha') return 'dev';
    return 'stable';
  },
}));

vi.mock('@electron/main/app-state', () => ({
  setQuitting: vi.fn(),
}));

describe('updater channel semantics and persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockAppGetVersion.mockReturnValue('1.0.0');
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'updateChannelExplicit') return Promise.resolve(true);
      return Promise.resolve('stable');
    });
    mockSetSetting.mockResolvedValue(undefined);
  });

  it('maps stable to latest for updater feeds on startup', async () => {
    const { AppUpdater } = await import('@electron/main/updater');
    mockAutoUpdater.setFeedURL.mockClear();

    new AppUpdater();

    expect(mockAutoUpdater.channel).toBe('latest');
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://oss.intelli-spectrum.com/latest' }),
    );
  });

  it('replays persisted channel from settings using feed mapping', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'updateChannelExplicit') return Promise.resolve(true);
      if (key === 'updateChannel') return Promise.resolve('dev');
      return Promise.resolve(undefined);
    });
    const { AppUpdater } = await import('@electron/main/updater');
    mockAutoUpdater.setFeedURL.mockClear();

    new AppUpdater();

    await vi.waitFor(() => {
      expect(mockGetSetting).toHaveBeenCalledWith('updateChannel');
    });
    await vi.waitFor(() => {
      expect(mockAutoUpdater.channel).toBe('alpha');
    });
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://oss.intelli-spectrum.com/alpha' }),
    );
  });

  it('keeps prerelease-derived channel when no explicit setting exists', async () => {
    mockAppGetVersion.mockReturnValue('1.2.3-beta.1');
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'updateChannelExplicit') return Promise.resolve(false);
      if (key === 'updateChannel') return Promise.resolve('stable');
      return Promise.resolve(undefined);
    });
    const { AppUpdater } = await import('@electron/main/updater');
    mockAutoUpdater.setFeedURL.mockClear();

    new AppUpdater();

    await vi.waitFor(() => {
      expect(mockGetSetting).toHaveBeenCalledWith('updateChannelExplicit');
    });
    expect(mockGetSetting).not.toHaveBeenCalledWith('updateChannel');
    await vi.waitFor(() => {
      expect(mockAutoUpdater.channel).toBe('beta');
    });
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://oss.intelli-spectrum.com/beta' }),
    );
  });

  it('setChannel recalculates feed URL and persists canonical channel', async () => {
    const { AppUpdater } = await import('@electron/main/updater');
    const updater = new AppUpdater();
    mockAutoUpdater.setFeedURL.mockClear();
    mockSetSetting.mockClear();

    updater.setChannel('beta');

    expect(mockAutoUpdater.channel).toBe('beta');
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://oss.intelli-spectrum.com/beta' }),
    );
    await vi.waitFor(() => {
      expect(mockSetSetting).toHaveBeenCalledWith('updateChannel', 'beta');
    });
  });
});
