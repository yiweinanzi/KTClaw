/**
 * Electron Main Process Entry
 * Manages window creation, system tray, and IPC handlers
 */
import { app, BrowserWindow, nativeImage, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { dirname, join } from 'path';
import { GatewayManager } from '../gateway/manager';
import { registerIpcHandlers } from './ipc-handlers';
import { createTray } from './tray';
import { createMenu } from './menu';

import { appUpdater, registerUpdateHandlers } from './updater';
import { logger } from '../utils/logger';
import { warmupNetworkOptimization } from '../utils/uv-env';
import { initTelemetry } from '../utils/telemetry';

import { ClawHubService } from '../gateway/clawhub';
import { ensureKTClawContext, repairKTClawOnlyBootstrapFiles } from '../utils/openclaw-workspace';
import { autoInstallCliIfNeeded, generateCompletionCache, installCompletionToProfile } from '../utils/openclaw-cli';
import { isQuitting, setQuitting } from './app-state';
import { applyProxySettings } from './proxy';
import { syncLaunchAtStartupSettingFromStore } from './launch-at-startup';
import {
  clearPendingSecondInstanceFocus,
  consumeMainWindowReady,
  createMainWindowFocusState,
  requestSecondInstanceFocus,
} from './main-window-focus';
import { getSetting } from '../utils/store';
import { ensureBuiltinSkillsInstalled, ensurePreinstalledSkillsInstalled } from '../utils/skill-config';
import { startHostApiServer } from '../api/server';
import { HostEventBus } from '../api/event-bus';
import { deviceOAuthManager } from '../utils/device-oauth';
import { browserOAuthManager } from '../utils/browser-oauth';
import { whatsAppLoginManager } from '../utils/whatsapp-login';
import { syncAllProviderAuthToRuntime } from '../services/providers/provider-runtime-sync';
import { McpRuntimeManager } from '../services/mcp/runtime-manager';
import { SessionRuntimeManager, type RuntimeSessionRecord } from '../services/session-runtime-manager';
import { loadMcpConfig } from '../api/routes/mcp';

const WINDOWS_APP_USER_MODEL_ID = 'app.clawx.desktop';

// Disable GPU hardware acceleration globally for maximum stability across
// all GPU configurations (no GPU, integrated, discrete).
//
// Rationale (following VS Code's philosophy):
// - Page/file loading is async data fetching — zero GPU dependency.
// - The original per-platform GPU branching was added to avoid CPU rendering
//   competing with sync I/O on Windows, but all file I/O is now async
//   (fs/promises), so that concern no longer applies.
// - Software rendering is deterministic across all hardware; GPU compositing
//   behaviour varies between vendors (Intel, AMD, NVIDIA, Apple Silicon) and
//   driver versions, making it the #1 source of rendering bugs in Electron.
//
// Users who want GPU acceleration can pass `--enable-gpu` on the CLI or
// set `"disable-hardware-acceleration": false` in the app config (future).
app.disableHardwareAcceleration();

// On Linux, set CHROME_DESKTOP so Chromium can find the correct .desktop file.
// On Wayland this maps the running window to clawx.desktop (→ icon + app grouping);
// on X11 it supplements the StartupWMClass matching.
// Must be called before app.whenReady() / before any window is created.
if (process.platform === 'linux') {
  (app as Electron.App & { setDesktopName?: (name: string) => void }).setDesktopName?.('clawx.desktop');
}

// Prevent multiple instances of the app from running simultaneously.
// Without this, two instances each spawn their own gateway process on the
// same port, then each treats the other's gateway as "orphaned" and kills
// it — creating an infinite kill/restart loop on Windows.
// The losing process must exit immediately so it never reaches Gateway startup.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
}

// Global references
let mainWindow: BrowserWindow | null = null;
let gatewayManager!: GatewayManager;
let clawHubService!: ClawHubService;
let hostEventBus!: HostEventBus;
let mcpRuntimeManager!: McpRuntimeManager;
let sessionRuntimeManager!: SessionRuntimeManager;
let hostApiServer: Server | null = null;
const hostApiSessionToken = randomBytes(24).toString('hex');
const mainWindowFocusState = createMainWindowFocusState();

/**
 * Resolve the icons directory path (works in both dev and packaged mode)
 */
function getIconsDir(): string {
  if (app.isPackaged) {
    // Packaged: icons are in extraResources → process.resourcesPath/resources/icons
    return join(process.resourcesPath, 'resources', 'icons');
  }
  // Development: relative to dist-electron/main/
  return join(__dirname, '../../resources/icons');
}

/**
 * Get the app icon for the current platform
 */
function getAppIcon(): Electron.NativeImage | undefined {
  if (process.platform === 'darwin') return undefined; // macOS uses the app bundle icon

  const iconsDir = getIconsDir();
  const iconPath =
    process.platform === 'win32'
      ? join(iconsDir, 'icon.ico')
      : join(iconsDir, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

/**
 * Create the main application window
 */
function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const useCustomTitleBar = isWindows;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: getAppIcon(),
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true, // Enable <webview> for embedding OpenClaw Control UI
      // Additional Linux-specific rendering fixes
      ...(process.platform === 'linux' && {
        enableRemoteModule: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      }),
    },
    // On macOS: hiddenInset (traffic-light buttons inset into the title bar)
    // On Windows: hidden (custom title bar drawn by the renderer)
    // On Linux: default (native window frame — required for Kylin V11 / cx4 GPU
    //   compatibility; frame:false triggers a frameless compositing path that
    //   the Jingjia Micro cx4 driver cannot render, causing a white screen)
    titleBarStyle: isMac ? 'hiddenInset' : useCustomTitleBar ? 'hidden' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    frame: isMac || !useCustomTitleBar,
  });

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Debug: Log rendering errors (especially for Linux)
  win.webContents.on('render-process-gone', (event, details) => {
    logger.error('Render process gone:', details);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'));
    // Auto-open DevTools on Linux for debugging white screen issues
    if (process.platform === 'linux' && process.env.CLAWX_DEBUG !== '0') {
      win.webContents.openDevTools();
    }
  }

  return win;
}

function focusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  win.focus();
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  clearPendingSecondInstanceFocus(mainWindowFocusState);
  focusWindow(mainWindow);
}

function createMainWindow(): BrowserWindow {
  const win = createWindow();

  win.once('ready-to-show', () => {
    if (mainWindow !== win) {
      return;
    }

    const action = consumeMainWindowReady(mainWindowFocusState);
    if (action === 'focus') {
      focusWindow(win);
      return;
    }

    win.show();
  });

  win.on('close', (event) => {
    if (!isQuitting()) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  return win;
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  // Initialize logger first
  logger.init();
  logger.info('=== KTClaw Application Starting ===');
  logger.debug(
    `Runtime: platform=${process.platform}/${process.arch}, electron=${process.versions.electron}, node=${process.versions.node}, packaged=${app.isPackaged}`
  );

  // Warm up network optimization (non-blocking)
  void warmupNetworkOptimization();

  // Initialize Telemetry early
  await initTelemetry();

  // Apply persisted proxy settings before creating windows or network requests.
  await applyProxySettings();
  await syncLaunchAtStartupSettingFromStore();

  // Set application menu
  createMenu();

  // Create the main window
  const window = createMainWindow();

  // Create system tray
  createTray(window);

  // Override security headers ONLY for the OpenClaw Gateway Control UI.
  // The URL filter ensures this callback only fires for gateway requests,
  // avoiding unnecessary overhead on every other HTTP response.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:18789/*', 'http://localhost:18789/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['X-Frame-Options'];
      delete headers['x-frame-options'];
      if (headers['Content-Security-Policy']) {
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      if (headers['content-security-policy']) {
        headers['content-security-policy'] = headers['content-security-policy'].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      callback({ responseHeaders: headers });
    },
  );

  // Register IPC handlers
  registerIpcHandlers(gatewayManager, clawHubService, window, hostApiSessionToken);

  hostApiServer = startHostApiServer({
    gatewayManager,
    clawHubService,
    mcpRuntimeManager,
    sessionRuntimeManager,
    eventBus: hostEventBus,
    mainWindow: window,
    hostApiSessionToken,
  });

  const enabledMcpServers = loadMcpConfig().servers.filter((server) => server.enabled);
  if (enabledMcpServers.length > 0) {
    void Promise.allSettled(enabledMcpServers.map(async (server) => {
      if (server.transport === 'stdio') {
        await mcpRuntimeManager.startServer(server);
        return;
      }
      await mcpRuntimeManager.connectServer(server);
    })).then((results) => {
      const rejected = results.filter((result) => result.status === 'rejected');
      if (rejected.length > 0) {
        logger.warn(`Failed to restore ${rejected.length} enabled MCP server(s) on startup`);
      }
    });
  }

  // Register update handlers
  registerUpdateHandlers(appUpdater, window);

  appUpdater.on('status-changed', (status) => {
    hostEventBus.emit('update:status', status);
  });

  appUpdater.on('auto-install-countdown', (payload) => {
    hostEventBus.emit('update:auto-install-countdown', payload);
  });

  // Note: Auto-check for updates is driven by the renderer (update store init)
  // so it respects the user's "Auto-check for updates" setting.

  // Repair any bootstrap files that only contain KTClaw markers (no OpenClaw
  // template content). This fixes a race condition where ensureKTClawContext()
  // previously created the file before the gateway could seed the full template.
  void repairKTClawOnlyBootstrapFiles().catch((error) => {
    logger.warn('Failed to repair bootstrap files:', error);
  });

  // Pre-deploy built-in skills (feishu-doc, feishu-drive, feishu-perm, feishu-wiki)
  // to ~/.openclaw/skills/ so they are immediately available without manual install.
  void ensureBuiltinSkillsInstalled().catch((error) => {
    logger.warn('Failed to install built-in skills:', error);
  });

  // Pre-deploy bundled third-party skills from resources/preinstalled-skills.
  // This installs full skill directories (not only SKILL.md) in an idempotent,
  // non-destructive way and never blocks startup.
  void ensurePreinstalledSkillsInstalled().catch((error) => {
    logger.warn('Failed to install preinstalled skills:', error);
  });

  // Bridge gateway and host-side events before any auto-start logic runs, so
  // renderer subscribers observe the full startup lifecycle.
  gatewayManager.on('status', (status: { state: string }) => {
    hostEventBus.emit('gateway:status', status);
    if (status.state === 'running') {
      void ensureKTClawContext().catch((error) => {
        logger.warn('Failed to re-merge KTClaw context after gateway reconnect:', error);
      });
    }
  });

  gatewayManager.on('error', (error) => {
    hostEventBus.emit('gateway:error', { message: error.message });
  });

  gatewayManager.on('notification', (notification) => {
    hostEventBus.emit('gateway:notification', notification);
  });

  gatewayManager.on('chat:message', (data) => {
    hostEventBus.emit('gateway:chat-message', data);
  });

  gatewayManager.on('channel:status', (data) => {
    hostEventBus.emit('gateway:channel-status', data);
  });

  gatewayManager.on('exit', (code) => {
    hostEventBus.emit('gateway:exit', { code });
  });

  deviceOAuthManager.on('oauth:code', (payload) => {
    hostEventBus.emit('oauth:code', payload);
  });

  deviceOAuthManager.on('oauth:start', (payload) => {
    hostEventBus.emit('oauth:start', payload);
  });

  deviceOAuthManager.on('oauth:success', (payload) => {
    hostEventBus.emit('oauth:success', { ...payload, success: true });
  });

  deviceOAuthManager.on('oauth:error', (error) => {
    hostEventBus.emit('oauth:error', error);
  });

  browserOAuthManager.on('oauth:start', (payload) => {
    hostEventBus.emit('oauth:start', payload);
  });

  browserOAuthManager.on('oauth:code', (payload) => {
    hostEventBus.emit('oauth:code', payload);
  });

  browserOAuthManager.on('oauth:success', (payload) => {
    hostEventBus.emit('oauth:success', { ...payload, success: true });
  });

  browserOAuthManager.on('oauth:error', (error) => {
    hostEventBus.emit('oauth:error', error);
  });

  whatsAppLoginManager.on('qr', (data) => {
    hostEventBus.emit('channel:whatsapp-qr', data);
  });

  whatsAppLoginManager.on('success', (data) => {
    hostEventBus.emit('channel:whatsapp-success', data);
  });

  whatsAppLoginManager.on('error', (error) => {
    hostEventBus.emit('channel:whatsapp-error', error);
  });

  // Start Gateway automatically (this seeds missing bootstrap files with full templates)
  const gatewayAutoStart = await getSetting('gatewayAutoStart');
  if (gatewayAutoStart) {
    try {
      await syncAllProviderAuthToRuntime();
      logger.debug('Auto-starting Gateway...');
      await gatewayManager.start();
      logger.info('Gateway auto-start succeeded');
    } catch (error) {
      logger.error('Gateway auto-start failed:', error);
      mainWindow?.webContents.send('gateway:error', String(error));
    }
  } else {
    logger.info('Gateway auto-start disabled in settings');
  }

  // Merge KTClaw context snippets into the workspace bootstrap files.
  // The gateway seeds workspace files asynchronously after its HTTP server
  // is ready, so ensureKTClawContext will retry until the target files appear.
  void ensureKTClawContext().catch((error) => {
    logger.warn('Failed to merge KTClaw context into workspace:', error);
  });

  // Auto-install openclaw CLI and shell completions (non-blocking).
  void autoInstallCliIfNeeded((installedPath) => {
    mainWindow?.webContents.send('openclaw:cli-installed', installedPath);
  }).then(() => {
    generateCompletionCache();
    installCompletionToProfile();
  }).catch((error) => {
    logger.warn('CLI auto-install failed:', error);
  });
}

if (gotTheLock) {
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  gatewayManager = new GatewayManager();
  clawHubService = new ClawHubService();
  hostEventBus = new HostEventBus();
  mcpRuntimeManager = new McpRuntimeManager();
  const getRuntimeSessionsFilePath = (): string => join(app.getPath('userData'), 'runtime-sessions.json');
  sessionRuntimeManager = new SessionRuntimeManager(gatewayManager, {
    listMcpTools: () => {
      const configs = loadMcpConfig().servers;
      return mcpRuntimeManager
        .listServers(configs)
        .filter((server) => server.connected)
        .flatMap((server) => mcpRuntimeManager.listTools(server.name).map((tool) => ({
          server: tool.server,
          name: tool.name,
        })));
    },
  }, {
    load: async () => {
      const filePath = getRuntimeSessionsFilePath();
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as RuntimeSessionRecord[];
        }
        if (typeof parsed === 'object' && parsed != null && Array.isArray((parsed as { sessions?: unknown }).sessions)) {
          return (parsed as { sessions: RuntimeSessionRecord[] }).sessions;
        }
        return [];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('Failed to load persisted runtime sessions:', error);
        }
        return [];
      }
    },
    save: async (records) => {
      const filePath = getRuntimeSessionsFilePath();
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify({ version: 1, sessions: records }, null, 2), 'utf8');
      } catch (error) {
        logger.warn('Failed to persist runtime sessions:', error);
      }
    },
  });

  // When a second instance is launched, focus the existing window instead.
  app.on('second-instance', () => {
    logger.info('Second KTClaw instance detected; redirecting to the existing window');

    const focusRequest = requestSecondInstanceFocus(
      mainWindowFocusState,
      Boolean(mainWindow && !mainWindow.isDestroyed()),
    );

    if (focusRequest === 'focus-now') {
      focusMainWindow();
      return;
    }

    logger.debug('Main window is not ready yet; deferring second-instance focus until ready-to-show');
  });

  // Application lifecycle
  app.whenReady().then(() => {
    void initialize().catch((error) => {
      logger.error('Application initialization failed:', error);
    });

    // Register activate handler AFTER app is ready to prevent
    // "Cannot create BrowserWindow before app is ready" on macOS.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    setQuitting();
    hostEventBus.closeAll();
    hostApiServer?.close();
    // Fire-and-forget: do not await gatewayManager.stop() here.
    // Awaiting inside before-quit can stall Electron's quit sequence.
    void gatewayManager.stop().catch((err) => {
      logger.warn('gatewayManager.stop() error during quit:', err);
    });
    void mcpRuntimeManager.shutdown().catch((err) => {
      logger.warn('mcpRuntimeManager.shutdown() error during quit:', err);
    });
  });
}

// Export for testing
export { mainWindow, gatewayManager };
