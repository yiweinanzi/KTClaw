import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GATEWAY_READY_INTERVAL_MS,
  DEFAULT_GATEWAY_READY_MAX_RETRIES,
  DEFAULT_GATEWAY_READY_PROBE_TIMEOUT_MS,
  DEFAULT_GATEWAY_READY_RETRIES,
} from '@electron/gateway/ws-client';

describe('Gateway ready wait budget', () => {
  it('keeps startup wait defaults bounded for faster failure feedback', () => {
    expect(DEFAULT_GATEWAY_READY_RETRIES).toBeLessThanOrEqual(120);
    expect(DEFAULT_GATEWAY_READY_MAX_RETRIES).toBeLessThanOrEqual(144);
    expect(DEFAULT_GATEWAY_READY_MAX_RETRIES).toBeGreaterThanOrEqual(DEFAULT_GATEWAY_READY_RETRIES);
    expect(DEFAULT_GATEWAY_READY_INTERVAL_MS).toBeLessThanOrEqual(500);
    expect(DEFAULT_GATEWAY_READY_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(1000);
  });
});
