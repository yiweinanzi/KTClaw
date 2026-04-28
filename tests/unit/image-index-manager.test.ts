/**
 * Unit tests for ImageIndexManager
 *
 * Tests the manager state machine, Worker lifecycle, crash recovery, and
 * dimension mismatch detection.
 *
 * Approach:
 * - Mock `node:worker_threads` Worker to avoid actual thread spawning
 * - Mock ImageVectorStore to avoid DB dependencies
 * - Use vi.useFakeTimers() for backoff timing tests
 * - Mock 'electron' module so logger doesn't fail without Electron runtime
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock electron runtime (logger uses app.getPath)
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/ktclaw-test'),
    getAppPath: vi.fn(() => '/tmp/ktclaw-test'),
    isPackaged: false,
  },
}));

// Mock logger to avoid file I/O during tests
vi.mock('../../electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Worker Mock ──────────────────────────────────────────────────────────────
// We create a mock Worker class that simulates the Worker Thread API
// without actually spawning a thread.

class MockWorker extends EventEmitter {
  terminate = vi.fn().mockResolvedValue(0);
  postMessage = vi.fn();

  // Helper to simulate the worker sending a message to main process
  simulateMessage(msg: unknown) {
    this.emit('message', msg);
  }

  // Helper to simulate worker exit
  simulateExit(code: number) {
    this.emit('exit', code);
  }

  // Helper to simulate worker error
  simulateError(err: Error) {
    this.emit('error', err);
  }
}

let mockWorkerInstance: MockWorker;
const MockWorkerConstructor = vi.fn().mockImplementation(() => {
  mockWorkerInstance = new MockWorker();
  return mockWorkerInstance;
});

vi.mock('node:worker_threads', () => {
  return {
    Worker: MockWorkerConstructor,
    workerData: null,
    parentPort: null,
  };
});

// ─── VectorStore Mock ─────────────────────────────────────────────────────────

// Create mock vector store factory (allows per-test customization)
let mockVectorStore: {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  upsertBatch: ReturnType<typeof vi.fn>;
  getAllEntries: ReturnType<typeof vi.fn>;
  getMeta: ReturnType<typeof vi.fn>;
  setMeta: ReturnType<typeof vi.fn>;
  getIndexedCount: ReturnType<typeof vi.fn>;
  getIndexedRoots: ReturnType<typeof vi.fn>;
  deleteByRoot: ReturnType<typeof vi.fn>;
};

vi.mock('../../electron/services/image-search/image-vector-store', () => ({
  ImageVectorStore: vi.fn().mockImplementation(() => mockVectorStore),
  getImageIndexDbPath: vi.fn(() => '/tmp/test-index.db'),
}));

vi.mock('../../electron/services/image-search/model-cache', () => ({
  MOBILECLIP_MODEL_ID: 'Xenova/mobileclip_s0',
  getImageSearchModelCacheDir: vi.fn(() => '/tmp/model-cache'),
  getImageSearchModelSources: vi.fn(() => []),
  getImageSearchLocalModelPath: vi.fn(() => null),
}));

// Import the module under test AFTER mocks are set up
import { ImageIndexManager, getImageIndexManager } from '../../electron/services/image-search/image-index-manager';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImageIndexManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWorkerConstructor.mockClear();

    // Reset mock vector store for each test
    mockVectorStore = {
      open: vi.fn(),
      close: vi.fn(),
      upsertBatch: vi.fn(),
      getAllEntries: vi.fn().mockReturnValue([]),
      getMeta: vi.fn().mockReturnValue(null), // default: no stored dim
      setMeta: vi.fn(),
      getIndexedCount: vi.fn().mockReturnValue(0),
      getIndexedRoots: vi.fn().mockReturnValue([]),
      deleteByRoot: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─── State machine ────────────────────────────────────────────────────────

  it('startIndexing() transitions state from idle to indexing', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    expect(manager.getStatus().state).toBe('idle');

    manager.startIndexing(['/photos']);

    expect(manager.getStatus().state).toBe('indexing');
  });

  it('startIndexing() while already indexing is rejected (no-op)', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);

    manager.startIndexing(['/photos']);
    const firstCallCount = MockWorkerConstructor.mock.calls.length;

    // Call startIndexing again while already indexing
    manager.startIndexing(['/photos2']);

    // Worker should not be created again
    expect(MockWorkerConstructor.mock.calls.length).toBe(firstCallCount);
    expect(manager.getStatus().state).toBe('indexing');
  });

  it("handleWorkerMessage 'batch' calls vectorStore.upsertBatch with Float32Array embeddings", () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    const embedding = new Float32Array(512).fill(0.5);
    mockWorkerInstance.simulateMessage({
      type: 'batch',
      items: [
        { path: '/photos/a.jpg', embedding, fileTime: 1000, size: 2048, root: '/photos' },
      ],
    });

    expect(mockVectorStore.upsertBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        path: '/photos/a.jpg',
        embedding: expect.any(Float32Array),
      }),
    ]);
  });

  it("handleWorkerMessage 'complete' transitions state to idle", () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    mockWorkerInstance.simulateMessage({
      type: 'complete',
      indexed: 5,
      errors: 0,
      skipped: 2,
    });

    const status = manager.getStatus();
    expect(status.state).toBe('idle');
    expect(status.lastIndexedAt).not.toBeNull();
  });

  it("handleWorkerMessage 'error' with fatal=true transitions state to error", () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    mockWorkerInstance.simulateMessage({
      type: 'error',
      message: 'Model load failed',
      fatal: true,
    });

    expect(manager.getStatus().state).toBe('error');
  });

  // ─── Crash recovery ────────────────────────────────────────────────────────

  it('worker exit with non-zero code triggers restart with exponential backoff (1s, 2s, 4s)', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    const initialCallCount = MockWorkerConstructor.mock.calls.length;

    // Simulate first worker crash
    mockWorkerInstance.simulateExit(1);

    // Should not restart immediately
    expect(MockWorkerConstructor.mock.calls.length).toBe(initialCallCount);

    // Advance time by 1s (first backoff delay)
    vi.advanceTimersByTime(1000);

    // Worker should be restarted after 1s
    expect(MockWorkerConstructor.mock.calls.length).toBe(initialCallCount + 1);

    // Simulate second crash (should backoff 2s)
    mockWorkerInstance.simulateExit(1);
    vi.advanceTimersByTime(1999);
    expect(MockWorkerConstructor.mock.calls.length).toBe(initialCallCount + 1); // not yet

    vi.advanceTimersByTime(1);
    expect(MockWorkerConstructor.mock.calls.length).toBe(initialCallCount + 2); // now
  });

  it('3 crashes within 30s marks state as unavailable, stops restarting', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    // Crash 1 — after 1s, restart
    mockWorkerInstance.simulateExit(1);
    vi.advanceTimersByTime(1000);

    // Crash 2 — after 2s, restart
    mockWorkerInstance.simulateExit(1);
    vi.advanceTimersByTime(2000);

    // Crash 3 — should trigger unavailable state, no restart
    const callsBeforeThirdCrash = MockWorkerConstructor.mock.calls.length;
    mockWorkerInstance.simulateExit(1);

    vi.advanceTimersByTime(60000); // advance well past any backoff delay

    // State should be unavailable after 3rd crash
    expect(manager.getStatus().state).toBe('unavailable');
    // No new worker should be created after the 3rd crash
    expect(MockWorkerConstructor.mock.calls.length).toBe(callsBeforeThirdCrash);
  });

  it('getStatus() returns current state, progress, and indexed count', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    mockVectorStore.getIndexedCount.mockReturnValue(42);

    const status = manager.getStatus();

    expect(status).toMatchObject({
      state: 'idle',
      progress: expect.objectContaining({
        indexed: 0,
        total: 0,
        errors: 0,
      }),
      lastIndexedAt: null,
      roots: [],
      totalIndexed: 42,
    });
  });

  it('shutdown() terminates worker and closes vector store', () => {
    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    manager.shutdown();

    expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    expect(mockVectorStore.close).toHaveBeenCalled();
    expect(manager.getStatus().state).toBe('idle');
  });

  // ─── Dimension mismatch detection ─────────────────────────────────────────

  it('startIndexing() detects embedding_dim mismatch and calls deleteByRoot for all roots', () => {
    // Mock stored dim = 256 (mismatch with current 512)
    mockVectorStore.getMeta.mockReturnValue('256');
    mockVectorStore.getIndexedRoots.mockReturnValue(['/photos', '/downloads']);

    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    // Should delete existing data for all indexed roots
    expect(mockVectorStore.deleteByRoot).toHaveBeenCalledWith('/photos');
    expect(mockVectorStore.deleteByRoot).toHaveBeenCalledWith('/downloads');
    // Should set the new embedding_dim
    expect(mockVectorStore.setMeta).toHaveBeenCalledWith('embedding_dim', '512');
  });

  it('startIndexing() with matching embedding_dim does NOT delete existing entries', () => {
    // Mock stored dim = 512 (matches current)
    mockVectorStore.getMeta.mockReturnValue('512');
    mockVectorStore.getIndexedRoots.mockReturnValue(['/photos']);

    const manager = new ImageIndexManager(mockVectorStore as any);
    manager.startIndexing(['/photos']);

    // Should NOT delete any roots
    expect(mockVectorStore.deleteByRoot).not.toHaveBeenCalled();
  });
});

describe('getImageIndexManager singleton', () => {
  it('returns the same instance on multiple calls', () => {
    const manager1 = getImageIndexManager();
    const manager2 = getImageIndexManager();
    expect(manager1).toBe(manager2);
  });
});
