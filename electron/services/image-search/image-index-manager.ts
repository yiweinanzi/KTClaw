/**
 * ImageIndexManager
 *
 * Singleton that owns the Worker Thread lifecycle for background image indexing.
 * Implements exponential backoff crash recovery and dimension mismatch detection.
 *
 * Design decisions (D-09, D-10, D-15, SC-3):
 * - D-09: Worker never touches DB directly — manager receives batches and writes via vectorStore
 * - D-10: ImageVectorStore is lazy-open, always-open singleton
 * - D-15: Exponential backoff crash recovery (1s, 2s, 4s, 8s, cap 60s)
 * - SC-3: 3 crashes in 30s window → 'unavailable' state (no infinite loop)
 */
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { ImageVectorStore } from './image-vector-store';
import {
  getImageSearchModelCacheDir,
  getImageSearchModelSources,
  getImageSearchLocalModelPath,
  MOBILECLIP_MODEL_ID,
} from './model-cache';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

/** MobileCLIP-S0 output embedding dimension. Must match the sqlite-vec schema. */
const CURRENT_EMBEDDING_DIM = 512;

/** Maximum crashes in a time window before marking as unavailable */
const MAX_CRASHES_IN_WINDOW = 3;

/** Time window (ms) for tracking rapid crashes */
const CRASH_WINDOW_MS = 30_000;

/** Maximum backoff delay between restarts */
const MAX_RESTART_DELAY_MS = 60_000;

/** Batch size for worker */
const INDEXING_BATCH_SIZE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

type IndexState = 'idle' | 'indexing' | 'error' | 'unavailable';

interface IndexProgress {
  indexed: number;
  total: number;
  errors: number;
  skipped: number;
  currentFile?: string;
}

interface IndexStatus {
  state: IndexState;
  progress: IndexProgress;
  lastIndexedAt: Date | null;
  roots: string[];
  totalIndexed: number;
}

// Worker message types (must match image-index-worker.ts definitions)
type WorkerMessage =
  | {
      type: 'batch';
      items: Array<{
        path: string;
        embedding: Float32Array;
        fileTime: number;
        size: number;
        root: string;
        width?: number;
        height?: number;
        lat?: number;
        lon?: number;
      }>;
    }
  | { type: 'progress'; indexed: number; total: number; errors: number; currentFile?: string }
  | { type: 'complete'; indexed: number; errors: number; skipped: number }
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

// ─── ImageIndexManager ────────────────────────────────────────────────────────

export class ImageIndexManager {
  /** Active worker thread reference, null when not indexing */
  private worker: Worker | null = null;

  /** Current state machine state */
  private state: IndexState = 'idle';

  /** Current indexing progress */
  private progress: IndexProgress = { indexed: 0, total: 0, errors: 0, skipped: 0 };

  /** The vector store for reading/writing embeddings */
  private readonly vectorStore: ImageVectorStore;

  /** Currently configured root directories */
  private roots: string[] = [];

  /** Timestamp of the last completed full index run */
  private lastIndexedAt: Date | null = null;

  /** Timestamps of recent crashes for backoff tracking */
  private crashTimestamps: number[] = [];

  /** Base restart delay (1s), doubles on each crash */
  private restartDelay = 1000;

  /** Pending restart timer */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(vectorStore?: ImageVectorStore) {
    this.vectorStore = vectorStore ?? new ImageVectorStore();
  }

  /**
   * Starts background indexing of the given root directories.
   *
   * - Rejects concurrent requests (already indexing)
   * - Rejects if state is 'unavailable' (too many crashes)
   * - Checks embedding_dim in DB metadata and triggers full re-index if mismatched
   * - Gets existing entries for incremental skip map
   * - Spawns Worker Thread with all required workerData
   */
  startIndexing(roots: string[]): void {
    // Reject concurrent indexing
    if (this.worker !== null || this.state === 'indexing') {
      logger.warn('ImageIndexManager: startIndexing() called while already indexing, ignoring');
      return;
    }

    // Reject if permanently unavailable
    if (this.state === 'unavailable') {
      logger.warn('ImageIndexManager: state is unavailable (too many crashes), ignoring startIndexing()');
      return;
    }

    this.roots = roots;
    this.progress = { indexed: 0, total: 0, errors: 0, skipped: 0 };
    this.state = 'indexing';

    // ── Dimension mismatch detection (Pitfall 6 / Blocker 1 fix) ──────────
    this.vectorStore.open();
    const storedDim = this.vectorStore.getMeta('embedding_dim');
    if (storedDim !== null && parseInt(storedDim, 10) !== CURRENT_EMBEDDING_DIM) {
      logger.warn(
        `ImageIndexManager: Embedding dimension changed: stored=${storedDim}, current=${CURRENT_EMBEDDING_DIM}. Re-indexing all roots.`,
      );
      const existingRoots = this.vectorStore.getIndexedRoots();
      for (const root of existingRoots) {
        this.vectorStore.deleteByRoot(root);
      }
      // Update meta so next startup recognizes the correct dim
      this.vectorStore.setMeta('embedding_dim', String(CURRENT_EMBEDDING_DIM));
    }

    // ── Get existing entries for incremental skip map ──────────────────────
    // getAllEntries() returns all path+fileTime pairs — worker uses these to
    // skip files whose mtime hasn't changed since last index.
    const existingEntries = this.vectorStore.getAllEntries();

    // ── Resolve worker path ────────────────────────────────────────────────
    // Worker must be a compiled .js file, not .ts source.
    // At runtime, __dirname points to dist-electron/services/image-search/
    const workerPath = join(__dirname, 'image-index-worker.js');

    logger.info(`ImageIndexManager: Starting indexer worker, ${roots.length} root(s), ${existingEntries.length} existing entries`);

    // ── Spawn Worker Thread ────────────────────────────────────────────────
    this.worker = new Worker(workerPath, {
      workerData: {
        roots,
        modelCacheDir: getImageSearchModelCacheDir(),
        modelSources: getImageSearchModelSources(),
        localModelPath: getImageSearchLocalModelPath(),
        existingEntries,
        batchSize: INDEXING_BATCH_SIZE,
      },
    });

    // Attach message/error/exit handlers
    this.worker.on('message', (msg: WorkerMessage) => this.handleWorkerMessage(msg));
    this.worker.on('error', (err: Error) => {
      logger.error(`ImageIndexManager: Worker error: ${err.message}`);
      // Worker error events are followed by exit event — let handleWorkerExit handle recovery
    });
    this.worker.on('exit', (code: number) => this.handleWorkerExit(code));
  }

  /**
   * Handles messages received from the Worker Thread.
   *
   * - 'batch': Write embeddings to DB via vectorStore.upsertBatch()
   *   NOTE: Worker already sends Float32Array (Warning 5 fix in worker) — no conversion needed
   * - 'progress': Update current progress counters
   * - 'complete': Transition to idle, record timestamp, store model metadata
   * - 'error': If fatal, transition to error state
   * - 'log': Forward to logger
   */
  private handleWorkerMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'batch':
        // Worker sends Float32Array embeddings — pass directly to vectorStore (no conversion)
        this.vectorStore.upsertBatch(msg.items);
        break;

      case 'progress':
        this.progress = {
          indexed: msg.indexed,
          total: msg.total,
          errors: msg.errors,
          skipped: this.progress.skipped,
          currentFile: msg.currentFile,
        };
        break;

      case 'complete':
        this.state = 'idle';
        this.lastIndexedAt = new Date();
        this.progress = {
          indexed: msg.indexed,
          total: msg.indexed + msg.skipped,
          errors: msg.errors,
          skipped: msg.skipped,
        };
        this.worker = null;

        // Persist model metadata to DB for future mismatch detection
        this.vectorStore.setMeta('model_id', MOBILECLIP_MODEL_ID);
        this.vectorStore.setMeta('embedding_dim', String(CURRENT_EMBEDDING_DIM));

        logger.info(`ImageIndexManager: Indexing complete — ${msg.indexed} indexed, ${msg.skipped} skipped, ${msg.errors} errors`);
        break;

      case 'error':
        if (msg.fatal) {
          this.state = 'error';
          this.worker = null;
          logger.error(`ImageIndexManager: Fatal worker error: ${msg.message}`);
        } else {
          logger.warn(`ImageIndexManager: Worker non-fatal error: ${msg.message}`);
        }
        break;

      case 'log':
        logger[msg.level](`[ImageIndexWorker] ${msg.message}`);
        break;

      default:
        // Unknown message type — ignore
        break;
    }
  }

  /**
   * Handles worker exit events with exponential backoff crash recovery.
   *
   * - Code 0 = normal exit, do nothing
   * - Non-zero = crash, apply backoff and restart (if under threshold)
   * - 3 crashes in 30s = permanently unavailable
   *
   * Backoff formula: min(1000 * 2^(crashCount-1), 60000)
   * Results in: 1s, 2s, 4s, 8s, ... up to 60s cap
   */
  private handleWorkerExit(code: number): void {
    this.worker = null;

    if (code === 0) {
      // Normal exit — handled by 'complete' message
      return;
    }

    logger.warn(`ImageIndexManager: Worker exited with code ${code}`);

    const now = Date.now();

    // Record this crash timestamp
    this.crashTimestamps.push(now);

    // Clean up timestamps outside the 30s window
    this.crashTimestamps = this.crashTimestamps.filter(
      (t) => now - t <= CRASH_WINDOW_MS,
    );

    const recentCrashCount = this.crashTimestamps.length;

    // Check if we've exceeded the crash threshold
    if (recentCrashCount >= MAX_CRASHES_IN_WINDOW) {
      this.state = 'unavailable';
      logger.error(
        `ImageIndexManager: ${recentCrashCount} crashes in ${CRASH_WINDOW_MS}ms — marking as unavailable. Semantic indexing disabled.`,
      );
      return;
    }

    // Calculate exponential backoff delay
    // crash 1 → 1s, crash 2 → 2s, crash 3 would be 4s but stops at unavailable
    const delay = Math.min(
      this.restartDelay * Math.pow(2, recentCrashCount - 1),
      MAX_RESTART_DELAY_MS,
    );

    logger.warn(
      `ImageIndexManager: Scheduling restart in ${delay}ms (crash ${recentCrashCount}/${MAX_CRASHES_IN_WINDOW - 1})`,
    );

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      logger.info('ImageIndexManager: Restarting worker after backoff');
      // Reset state to idle so startIndexing() accepts the restart
      this.state = 'idle';
      this.startIndexing(this.roots);
    }, delay);
  }

  /**
   * Returns the current indexing status.
   */
  getStatus(): IndexStatus {
    return {
      state: this.state,
      progress: { ...this.progress },
      lastIndexedAt: this.lastIndexedAt,
      roots: [...this.roots],
      totalIndexed: this.vectorStore.getIndexedCount(),
    };
  }

  /**
   * Terminates the worker, cancels pending restart, and closes the vector store.
   * Safe to call from app.before-quit event handler.
   */
  shutdown(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.worker !== null) {
      this.worker.terminate().catch(() => {
        // Ignore termination errors during shutdown
      });
      this.worker = null;
    }
    this.vectorStore.close();
    this.state = 'idle';
    logger.info('ImageIndexManager: Shutdown complete');
  }

  /**
   * Returns the underlying ImageVectorStore instance.
   * Used by the search service to perform KNN queries.
   */
  getVectorStore(): ImageVectorStore {
    return this.vectorStore;
  }

  /**
   * Returns true if the index is ready for queries (idle + has indexed content).
   */
  isIndexReady(): boolean {
    return this.state !== 'indexing' && this.vectorStore.getIndexedCount() > 0;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let managerInstance: ImageIndexManager | null = null;

/**
 * Returns the singleton ImageIndexManager instance.
 * Lazily constructs the manager on first access.
 */
export function getImageIndexManager(): ImageIndexManager {
  managerInstance ??= new ImageIndexManager();
  return managerInstance;
}
