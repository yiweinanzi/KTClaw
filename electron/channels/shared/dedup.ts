export class MessageDeduplicator {
  private readonly cache = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(opts?: { ttlMs?: number; maxSize?: number }) {
    this.ttlMs = opts?.ttlMs ?? 60_000;
    this.maxSize = opts?.maxSize ?? 100;
  }

  isDuplicate(messageId: string): boolean {
    if (!messageId) return false;
    if (this.cache.has(messageId)) return true;
    this.cache.set(messageId, Date.now());
    if (this.cache.size > this.maxSize) this.cleanup();
    return false;
  }

  isExpired(timestamp: number, maxAgeMs = 30 * 60_000): boolean {
    return Date.now() - timestamp > maxAgeMs;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, ts] of this.cache) {
      if (ts < cutoff) this.cache.delete(id);
    }
  }
}
