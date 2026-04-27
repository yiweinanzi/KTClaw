import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('image search semantic model prewarm', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not schedule semantic model prewarm by default', async () => {
    const setTimer = vi.fn();
    const prewarm = vi.fn().mockResolvedValue(undefined);

    const { scheduleImageSearchSemanticPrewarm, resetImageSearchSemanticPrewarmForTests } = await import(
      '@electron/services/image-search/prewarm'
    );
    resetImageSearchSemanticPrewarmForTests();

    scheduleImageSearchSemanticPrewarm({ env: {}, prewarm, setTimer });

    expect(setTimer).not.toHaveBeenCalled();
    expect(prewarm).not.toHaveBeenCalled();
  });

  it('schedules semantic model prewarm in the background only once when explicitly enabled', async () => {
    const scheduled: Array<() => void> = [];
    const setTimer = vi.fn((handler: () => void, _delayMs: number) => {
      scheduled.push(handler);
      return 1;
    });
    const prewarm = vi.fn().mockResolvedValue(undefined);
    const logWarn = vi.fn();

    const { scheduleImageSearchSemanticPrewarm, resetImageSearchSemanticPrewarmForTests } = await import(
      '@electron/services/image-search/prewarm'
    );
    resetImageSearchSemanticPrewarmForTests();

    const env = { KTCLAW_ENABLE_IMAGE_SEARCH_PREWARM: '1' };
    scheduleImageSearchSemanticPrewarm({ delayMs: 25, env, logWarn, prewarm, setTimer });
    scheduleImageSearchSemanticPrewarm({ delayMs: 25, env, logWarn, prewarm, setTimer });

    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 25);
    expect(prewarm).not.toHaveBeenCalled();

    scheduled[0]();
    await Promise.resolve();

    expect(prewarm).toHaveBeenCalledTimes(1);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('can disable background semantic model prewarm with an environment flag', async () => {
    const setTimer = vi.fn();
    const prewarm = vi.fn().mockResolvedValue(undefined);

    const { scheduleImageSearchSemanticPrewarm, resetImageSearchSemanticPrewarmForTests } = await import(
      '@electron/services/image-search/prewarm'
    );
    resetImageSearchSemanticPrewarmForTests();

    scheduleImageSearchSemanticPrewarm({
      env: { KTCLAW_DISABLE_IMAGE_SEARCH_PREWARM: '1' },
      prewarm,
      setTimer,
    });

    expect(setTimer).not.toHaveBeenCalled();
    expect(prewarm).not.toHaveBeenCalled();
  });

  it('logs prewarm failures instead of throwing from the timer', async () => {
    const scheduled: Array<() => void> = [];
    const setTimer = vi.fn((handler: () => void) => {
      scheduled.push(handler);
      return 1;
    });
    const prewarmError = new Error('offline');
    const prewarm = vi.fn().mockRejectedValue(prewarmError);
    const logWarn = vi.fn();

    const { scheduleImageSearchSemanticPrewarm, resetImageSearchSemanticPrewarmForTests } = await import(
      '@electron/services/image-search/prewarm'
    );
    resetImageSearchSemanticPrewarmForTests();

    scheduleImageSearchSemanticPrewarm({
      env: { KTCLAW_ENABLE_IMAGE_SEARCH_PREWARM: '1' },
      logWarn,
      prewarm,
      setTimer,
    });

    expect(() => scheduled[0]()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(logWarn).toHaveBeenCalledWith('Image semantic model prewarm failed:', prewarmError);
  });
});
