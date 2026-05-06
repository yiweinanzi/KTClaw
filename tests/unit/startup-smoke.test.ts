// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStartupSmokeController } from '@electron/main/startup-smoke';

describe('startup smoke controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes once and clears the timeout', () => {
    const onPass = vi.fn();
    const onFail = vi.fn();
    const controller = createStartupSmokeController({
      enabled: true,
      timeoutMs: 1_000,
      onPass,
      onFail,
    });

    controller.pass('did-finish-load');
    vi.advanceTimersByTime(2_000);

    expect(onPass).toHaveBeenCalledWith('did-finish-load');
    expect(onFail).not.toHaveBeenCalled();
  });

  it('fails on timeout', () => {
    const onPass = vi.fn();
    const onFail = vi.fn();
    createStartupSmokeController({
      enabled: true,
      timeoutMs: 1_000,
      onPass,
      onFail,
    });

    vi.advanceTimersByTime(1_000);

    expect(onFail).toHaveBeenCalledWith('timeout after 1000ms');
    expect(onPass).not.toHaveBeenCalled();
  });

  it('becomes a no-op when disabled', () => {
    const onPass = vi.fn();
    const onFail = vi.fn();
    const controller = createStartupSmokeController({
      enabled: false,
      onPass,
      onFail,
    });

    controller.pass('noop');
    controller.fail('noop');
    vi.runAllTimers();

    expect(onPass).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });
});
