import { app, utilityProcess } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { getOpenClawConfigDir, getOpenClawDir, getOpenClawEntryPath } from '../utils/paths';
import { getUvMirrorEnv } from '../utils/uv-env';
import { isPythonReady, setupManagedPython } from '../utils/uv-setup';
import { logger } from '../utils/logger';
import { prependPathEntry } from '../utils/env-path';
import { stripOpenClawSupervisorEnv } from '../utils/openclaw-supervisor-env';
import { probeGatewayReady } from './ws-client';

const SYSTEMD_GATEWAY_SERVICE_NAMES = [
  'openclaw-gateway',
  'clawdbot-gateway',
  'moltbot-gateway',
];

/**
 * Stop any openclaw gateway systemd user services on Linux to prevent
 * auto-respawn conflicts when KTClaw manages its own gateway process.
 * Equivalent to unloadLaunchctlGatewayService() on macOS.
 */
export async function stopSystemdGatewayService(): Promise<void> {
  if (process.platform !== 'linux') return;

  const cp = await import('child_process');

  const isActive = (unit: string): Promise<boolean> =>
    new Promise((resolve) => {
      cp.exec(`systemctl --user is-active ${unit}`, { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });

  const stopUnit = (unit: string): Promise<void> =>
    new Promise((resolve) => {
      cp.exec(`systemctl --user stop ${unit}`, { timeout: 10000 }, (err) => {
        if (err) {
          logger.warn(`Failed to stop systemd user service ${unit}: ${err.message}`);
        } else {
          logger.info(`Stopped systemd user service ${unit} to prevent auto-respawn`);
        }
        resolve();
      });
    });

  let stopped = false;
  for (const name of SYSTEMD_GATEWAY_SERVICE_NAMES) {
    const unit = `${name}.service`;
    if (await isActive(unit)) {
      await stopUnit(unit);
      stopped = true;
    }
  }

  if (stopped) {
    // Give systemd a moment to release the port before we bind it.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export function warmupManagedPythonReadiness(): void {
  void isPythonReady().then((pythonReady) => {
    if (!pythonReady) {
      logger.info('Python environment missing or incomplete, attempting background repair...');
      void setupManagedPython().catch((err) => {
        logger.error('Background Python repair failed:', err);
      });
    }
  }).catch((err) => {
    logger.error('Failed to check Python environment:', err);
  });
}

export async function terminateOwnedGatewayProcess(child: Electron.UtilityProcess): Promise<void> {
  const terminateWindowsProcessTree = async (pid: number): Promise<void> => {
    const cp = await import('child_process');
    await new Promise<void>((resolve) => {
      cp.exec(`taskkill /F /PID ${pid} /T`, { timeout: 5000, windowsHide: true }, () => resolve());
    });
  };

  await new Promise<void>((resolve) => {
    let exited = false;
    const pid = child.pid;
    let timeout: NodeJS.Timeout | null = null;

    // Register exit listener before any kill attempts to avoid race.
    child.once('exit', () => {
      exited = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    });

    logger.info(`Sending kill to Gateway process (pid=${pid ?? 'unknown'})`);

    if (process.platform === 'win32' && pid) {
      void terminateWindowsProcessTree(pid).catch((err) => {
        logger.warn(`Windows process-tree kill failed for Gateway pid=${pid}:`, err);
      });
    } else {
      try {
        child.kill();
      } catch {
        // ignore if already exited
      }
    }

    timeout = setTimeout(() => {
      if (!exited) {
        logger.warn(`Gateway did not exit in time, force-killing (pid=${pid ?? 'unknown'})`);
        if (pid) {
          if (process.platform === 'win32') {
            void terminateWindowsProcessTree(pid).catch((err) => {
              logger.warn(`Forced Windows process-tree kill failed for Gateway pid=${pid}:`, err);
            });
          } else {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              // ignore
            }
          }
        }
      }
      resolve();
    }, 5000);
  });
}

export async function unloadLaunchctlGatewayService(): Promise<void> {
  if (process.platform !== 'darwin') return;

  try {
    const uid = process.getuid?.();
    if (uid === undefined) return;

    const launchdLabel = 'ai.openclaw.gateway';
    const serviceTarget = `gui/${uid}/${launchdLabel}`;
    const cp = await import('child_process');
    const fsPromises = await import('fs/promises');
    const os = await import('os');

    const loaded = await new Promise<boolean>((resolve) => {
      cp.exec(`launchctl print ${serviceTarget}`, { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });

    if (!loaded) return;

    logger.info(`Unloading launchctl service ${serviceTarget} to prevent auto-respawn`);
    await new Promise<void>((resolve) => {
      cp.exec(`launchctl bootout ${serviceTarget}`, { timeout: 10000 }, (err) => {
        if (err) {
          logger.warn(`Failed to bootout launchctl service: ${err.message}`);
        } else {
          logger.info('Successfully unloaded launchctl gateway service');
        }
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${launchdLabel}.plist`);
      await fsPromises.access(plistPath);
      await fsPromises.unlink(plistPath);
      logger.info(`Removed legacy launchd plist to prevent reload on next login: ${plistPath}`);
    } catch {
      // File doesn't exist or can't be removed -- not fatal
    }
  } catch (err) {
    logger.warn('Error while unloading launchctl gateway service:', err);
  }
}

export async function waitForPortFree(port: number, timeoutMs = 30000): Promise<void> {
  const net = await import('net');
  const start = Date.now();
  const pollInterval = 500;
  let logged = false;

  while (Date.now() - start < timeoutMs) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });

    if (available) {
      const elapsed = Date.now() - start;
      if (elapsed > pollInterval) {
        logger.info(`Port ${port} became available after ${elapsed}ms`);
      }
      return;
    }

    if (!logged) {
      logger.info(`Waiting for port ${port} to become available...`);
      logged = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  logger.warn(`Port ${port} still occupied after ${timeoutMs}ms, proceeding anyway`);
}

async function getListeningProcessIds(port: number): Promise<string[]> {
  const cp = await import('child_process');

  const exec = (cmd: string): Promise<string> =>
    new Promise((resolve) => {
      cp.exec(cmd, { timeout: 5000, windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : stdout);
      });
    });

  if (process.platform === 'win32') {
    const stdout = await exec(`netstat -ano | findstr :${port}`);
    if (!stdout.trim()) return [];
    const pids: string[] = [];
    for (const line of stdout.trim().split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[3] === 'LISTENING') {
        pids.push(parts[4]);
      }
    }
    return [...new Set(pids)];
  }

  // Unix: try lsof first, fall back to ss (more widely available on Linux)
  let stdout = await exec(`lsof -i :${port} -sTCP:LISTEN -t`);
  if (!stdout.trim() && process.platform === 'linux') {
    // ss is available on virtually all modern Linux systems (iproute2)
    const ssOut = await exec(`ss -tlnp sport = :${port}`);
    if (ssOut.trim()) {
      // Extract PIDs from ss output: pid=12345
      const pids = [...ssOut.matchAll(/pid=(\d+)/g)].map((m) => m[1]);
      return [...new Set(pids)];
    }
  }

  if (!stdout.trim()) return [];
  return [...new Set(stdout.trim().split(/\r?\n/).map((v) => v.trim()).filter(Boolean))];
}

async function terminateOrphanedProcessIds(port: number, pids: string[]): Promise<void> {
  logger.info(`Found orphaned process listening on port ${port} (PIDs: ${pids.join(', ')}), attempting to kill...`);

  // Stop system-managed services BEFORE killing PIDs so the service manager
  // cannot respawn the process during the kill/wait window.
  if (process.platform === 'darwin') {
    await unloadLaunchctlGatewayService();
  } else if (process.platform === 'linux') {
    await stopSystemdGatewayService();
  }

  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        const cp = await import('child_process');
        await new Promise<void>((resolve) => {
          cp.exec(
            `taskkill /F /PID ${pid} /T`,
            { timeout: 5000, windowsHide: true },
            () => resolve(),
          );
        });
      } else {
        process.kill(parseInt(pid, 10), 'SIGTERM');
      }
    } catch {
      // Ignore processes that have already exited.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, process.platform === 'win32' ? 2000 : 3000));

  if (process.platform !== 'win32') {
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 0);
        process.kill(parseInt(pid, 10), 'SIGKILL');
      } catch {
        // Already exited.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function findExistingGatewayProcess(options: {
  port: number;
  ownedPid?: number;
}): Promise<{ port: number; externalToken?: string } | null> {
  const { port, ownedPid } = options;

  try {
    try {
      const pids = await getListeningProcessIds(port);
      if (pids.length > 0 && (!ownedPid || !pids.includes(String(ownedPid)))) {
        await terminateOrphanedProcessIds(port, pids);
        if (process.platform === 'win32' || process.platform === 'linux') {
          await waitForPortFree(port, 10000);
        }
        return null;
      }
    } catch (err) {
      logger.warn('Error checking for existing process on port:', err);
    }

    const ready = await probeGatewayReady(port, 2000);
    if (!ready) {
      return null;
    }
    return { port };
  } catch {
    return null;
  }
}

export async function runOpenClawDoctorRepair(): Promise<boolean> {
  const openclawDir = getOpenClawDir();
  const entryScript = getOpenClawEntryPath();
  if (!existsSync(entryScript)) {
    logger.error(`Cannot run OpenClaw doctor repair: entry script not found at ${entryScript}`);
    return false;
  }

  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(process.cwd(), 'resources', 'bin', target);
  const binPathExists = existsSync(binPath);
  const baseProcessEnv = process.env as Record<string, string | undefined>;
  const baseEnvPatched = binPathExists
    ? prependPathEntry(baseProcessEnv, binPath).env
    : baseProcessEnv;

  const uvEnv = await getUvMirrorEnv();
  const doctorArgs = ['doctor', '--fix', '--yes', '--non-interactive'];
  logger.info(
    `Running OpenClaw doctor repair (entry="${entryScript}", args="${doctorArgs.join(' ')}", cwd="${openclawDir}", bundledBin=${binPathExists ? 'yes' : 'no'})`,
  );

  return await new Promise<boolean>((resolve) => {
    const forkEnv = stripOpenClawSupervisorEnv({
      ...baseEnvPatched,
      ...uvEnv,
      OPENCLAW_STATE_DIR: getOpenClawConfigDir(),
      OPENCLAW_CONFIG_PATH: path.join(getOpenClawConfigDir(), 'openclaw.json'),
      OPENCLAW_NO_RESPAWN: '1',
    });

    const child = utilityProcess.fork(entryScript, doctorArgs, {
      cwd: openclawDir,
      stdio: 'pipe',
      env: forkEnv as NodeJS.ProcessEnv,
    });

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = setTimeout(() => {
      logger.error('OpenClaw doctor repair timed out after 120000ms');
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(false);
    }, 120000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      logger.error('Failed to spawn OpenClaw doctor repair process:', err);
      finish(false);
    });

    child.stdout?.on('data', (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.debug(`[Gateway doctor stdout] ${normalized}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.warn(`[Gateway doctor stderr] ${normalized}`);
      }
    });

    child.on('exit', (code: number) => {
      clearTimeout(timeout);
      if (code === 0) {
        logger.info('OpenClaw doctor repair completed successfully');
        finish(true);
        return;
      }
      logger.warn(`OpenClaw doctor repair exited (code=${code})`);
      finish(false);
    });
  });
}
