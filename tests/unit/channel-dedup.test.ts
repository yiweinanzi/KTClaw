import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageDeduplicator } from '@electron/channels/shared/dedup';

describe('MessageDeduplicator', () => {
  it('isDuplicate returns false on first call', () => {
    const dedup = new MessageDeduplicator();
    expect(dedup.isDuplicate('msg-1')).toBe(false);
  });

  it('isDuplicate returns true on second call with same messageId', () => {
    const dedup = new MessageDeduplicator();
    dedup.isDuplicate('msg-1');
    expect(dedup.isDuplicate('msg-1')).toBe(true);
  });

  it('isDuplicate returns false for empty string', () => {
    const dedup = new MessageDeduplicator();
    expect(dedup.isDuplicate('')).toBe(false);
    expect(dedup.isDuplicate('')).toBe(false);
  });

  it('isDuplicate returns false for different IDs', () => {
    const dedup = new MessageDeduplicator();
    expect(dedup.isDuplicate('msg-1')).toBe(false);
    expect(dedup.isDuplicate('msg-2')).toBe(false);
    expect(dedup.isDuplicate('msg-3')).toBe(false);
  });

  it('isDuplicate returns true for already-seen ID regardless of other IDs', () => {
    const dedup = new MessageDeduplicator();
    dedup.isDuplicate('msg-1');
    dedup.isDuplicate('msg-2');
    expect(dedup.isDuplicate('msg-1')).toBe(true);
    expect(dedup.isDuplicate('msg-2')).toBe(true);
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('after TTL expires, same ID returns false again', () => {
      const ttlMs = 5000;
      const dedup = new MessageDeduplicator({ ttlMs });
      dedup.isDuplicate('msg-1');
      expect(dedup.isDuplicate('msg-1')).toBe(true);

      // Advance time past TTL and trigger cleanup by adding more entries
      vi.advanceTimersByTime(ttlMs + 1);

      // Force cleanup by exceeding maxSize
      const smallDedup = new MessageDeduplicator({ ttlMs, maxSize: 2 });
      smallDedup.isDuplicate('msg-1');
      vi.advanceTimersByTime(ttlMs + 1);
      // Add entries to trigger cleanup
      smallDedup.isDuplicate('msg-2');
      smallDedup.isDuplicate('msg-3'); // triggers cleanup since size > maxSize=2
      // msg-1 should have been cleaned up (expired)
      expect(smallDedup.isDuplicate('msg-1')).toBe(false);
    });
  });

  describe('cleanup on maxSize exceeded', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cleanup removes entries older than TTL when cache exceeds maxSize', () => {
      const dedup = new MessageDeduplicator({ ttlMs: 1000, maxSize: 3 });
      dedup.isDuplicate('old-1');
      dedup.isDuplicate('old-2');
      dedup.isDuplicate('old-3');

      // Advance past TTL
      vi.advanceTimersByTime(2000);

      // Adding one more triggers cleanup (size would be 4 > maxSize 3)
      dedup.isDuplicate('new-1');

      // Old entries should be gone after cleanup
      expect(dedup.isDuplicate('old-1')).toBe(false);
      expect(dedup.isDuplicate('old-2')).toBe(false);
    });
  });

  describe('isExpired', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('isExpired returns false when age < maxAgeMs', () => {
      const dedup = new MessageDeduplicator();
      const now = Date.now();
      expect(dedup.isExpired(now - 1000, 5000)).toBe(false);
    });

    it('isExpired returns true when age > maxAgeMs', () => {
      const dedup = new MessageDeduplicator();
      const now = Date.now();
      expect(dedup.isExpired(now - 10000, 5000)).toBe(true);
    });

    it('isExpired uses default maxAgeMs of 30 minutes', () => {
      const dedup = new MessageDeduplicator();
      const now = Date.now();
      const thirtyOneMinutesAgo = now - 31 * 60 * 1000;
      expect(dedup.isExpired(thirtyOneMinutesAgo)).toBe(true);
      expect(dedup.isExpired(now - 29 * 60 * 1000)).toBe(false);
    });
  });
});
