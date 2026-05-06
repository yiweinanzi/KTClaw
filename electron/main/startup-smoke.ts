export interface StartupSmokeControllerOptions {
  enabled: boolean;
  timeoutMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  onPass: (reason: string) => void;
  onFail: (reason: string) => void;
  logInfo?: (message: string) => void;
  logError?: (message: string) => void;
}

export interface StartupSmokeController {
  enabled: boolean;
  pass: (reason: string) => void;
  fail: (reason: string) => void;
  dispose: () => void;
}

const DEFAULT_TIMEOUT_MS = 45_000;

export function createStartupSmokeController(
  options: StartupSmokeControllerOptions,
): StartupSmokeController {
  if (!options.enabled) {
    return {
      enabled: false,
      pass: () => {},
      fail: () => {},
      dispose: () => {},
    };
  }

  const setTimeoutImpl = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutFn ?? clearTimeout;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeoutImpl(() => {
    settle('fail', `timeout after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  function clearTimer(): void {
    if (timer) {
      clearTimeoutImpl(timer);
      timer = null;
    }
  }

  function settle(kind: 'pass' | 'fail', reason: string): void {
    if (settled) {
      return;
    }
    settled = true;
    clearTimer();
    if (kind === 'pass') {
      options.logInfo?.(`Startup smoke passed (${reason})`);
      options.onPass(reason);
      return;
    }
    options.logError?.(`Startup smoke failed (${reason})`);
    options.onFail(reason);
  }

  return {
    enabled: true,
    pass: (reason: string) => settle('pass', reason),
    fail: (reason: string) => settle('fail', reason),
    dispose: () => {
      settled = true;
      clearTimer();
    },
  };
}
