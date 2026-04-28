/**
 * ImageVectorStore
 *
 * Persistent vector storage for semantic image search.
 * Uses better-sqlite3 + sqlite-vec for KNN cosine distance queries.
 *
 * Design decisions (from architecture research D-08, D-09, D-10):
 * - DB is always-open singleton (never open/close per query)
 * - WAL mode + synchronous=NORMAL for concurrent read safety
 * - sqlite-vec virtual table stores 512-dim float32 embeddings
 * - All writes come from main process only (Worker sends batches via postMessage)
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getDataDir } from '../../utils/paths';

/**
 * Returns the default path for the image search vector index database.
 * Located inside the user data directory under image-search/index.db.
 */
export function getImageIndexDbPath(): string {
  return join(getDataDir(), 'image-search', 'index.db');
}

export interface ImageFileEntry {
  path: string;
  fileTime: number;
  size: number;
  root: string;
  width?: number;
  height?: number;
  lat?: number;
  lon?: number;
}

export interface UpsertItem {
  path: string;
  embedding: Float32Array;
  fileTime: number;
  size: number;
  root: string;
  width?: number;
  height?: number;
  lat?: number;
  lon?: number;
}

export interface KnnQueryOptions {
  limit?: number;
  timeStart?: number;
  timeEnd?: number;
  roots?: string[];
}

export interface KnnResult {
  path: string;
  distance: number;
  fileTime: number;
  size: number;
  root: string;
}

export class ImageVectorStore {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? getImageIndexDbPath();
  }

  /**
   * Lazy-opens the database. Creates directory, loads sqlite-vec extension,
   * sets WAL mode, and initializes schema. Returns the open db instance.
   * Subsequent calls return the same instance.
   */
  open(): Database.Database {
    if (this.db) return this.db;

    mkdirSync(dirname(this.dbPath), { recursive: true });

    const db = new Database(this.dbPath);

    // Load sqlite-vec extension for vector operations
    sqliteVec.load(db);

    // WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');

    this.initSchema(db);

    this.db = db;
    return db;
  }

  /**
   * Creates all required tables and indexes if they don't exist.
   */
  private initSchema(db: Database.Database): void {
    // Main image metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS image_files (
        path TEXT PRIMARY KEY,
        file_time INTEGER NOT NULL,
        size INTEGER NOT NULL,
        root TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        lat REAL,
        lon REAL,
        indexed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_image_files_root ON image_files(root);
      CREATE INDEX IF NOT EXISTS idx_image_files_file_time ON image_files(file_time);

      CREATE TABLE IF NOT EXISTS image_search_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // sqlite-vec virtual table for 512-dim embeddings
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS image_embeddings
      USING vec0(path TEXT PRIMARY KEY, embedding float[512]);
    `);
  }

  /**
   * Inserts or replaces a batch of image embeddings.
   * Uses a single transaction for performance.
   */
  upsertBatch(items: UpsertItem[]): void {
    const db = this.open();
    const now = Date.now();

    const upsertFile = db.prepare(`
      INSERT OR REPLACE INTO image_files
        (path, file_time, size, root, width, height, lat, lon, indexed_at)
      VALUES
        (@path, @fileTime, @size, @root, @width, @height, @lat, @lon, @indexedAt)
    `);

    // sqlite-vec virtual tables don't support INSERT OR REPLACE for updates.
    // We must DELETE the existing row first, then INSERT the new one.
    const deleteEmbedding = db.prepare('DELETE FROM image_embeddings WHERE path = @path');
    const insertEmbedding = db.prepare(`
      INSERT INTO image_embeddings (path, embedding)
      VALUES (@path, @embedding)
    `);

    const runBatch = db.transaction((batchItems: UpsertItem[]) => {
      for (const item of batchItems) {
        upsertFile.run({
          path: item.path,
          fileTime: item.fileTime,
          size: item.size,
          root: item.root,
          width: item.width ?? null,
          height: item.height ?? null,
          lat: item.lat ?? null,
          lon: item.lon ?? null,
          indexedAt: now,
        });
        // Delete-then-insert to handle upsert for sqlite-vec virtual table
        deleteEmbedding.run({ path: item.path });
        insertEmbedding.run({
          path: item.path,
          embedding: Buffer.from(item.embedding.buffer, item.embedding.byteOffset, item.embedding.byteLength),
        });
      }
    });

    runBatch(items);
  }

  /**
   * Performs a KNN cosine distance query against stored embeddings.
   * Optionally filters by time range and root directories.
   */
  knnQuery(embedding: Float32Array, options: KnnQueryOptions = {}): KnnResult[] {
    const db = this.open();
    const { limit = 20, timeStart, timeEnd, roots } = options;

    const embeddingBuffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

    // Build WHERE clause for time range and roots filters
    const conditions: string[] = [];
    const params: Record<string, unknown> = { embedding: embeddingBuffer, limit };

    if (timeStart !== undefined) {
      conditions.push('f.file_time >= @timeStart');
      params.timeStart = timeStart;
    }
    if (timeEnd !== undefined) {
      conditions.push('f.file_time <= @timeEnd');
      params.timeEnd = timeEnd;
    }
    if (roots && roots.length > 0) {
      // sqlite3 doesn't support direct array binding; use manual placeholders
      const rootPlaceholders = roots.map((_, i) => `@root${i}`).join(', ');
      conditions.push(`f.root IN (${rootPlaceholders})`);
      for (let i = 0; i < roots.length; i++) {
        params[`root${i}`] = roots[i];
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        ie.path,
        vec_distance_cosine(ie.embedding, @embedding) AS distance,
        f.file_time AS fileTime,
        f.size AS size,
        f.root AS root
      FROM image_embeddings ie
      JOIN image_files f ON ie.path = f.path
      ${whereClause}
      ORDER BY distance ASC
      LIMIT @limit
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all(params) as Array<{
      path: string;
      distance: number;
      fileTime: number;
      size: number;
      root: string;
    }>;

    return rows.map((row) => ({
      path: row.path,
      distance: row.distance,
      fileTime: row.fileTime,
      size: row.size,
      root: row.root,
    }));
  }

  /**
   * Removes an image entry from both tables by path.
   */
  deleteByPath(path: string): void {
    const db = this.open();
    const deleteFile = db.prepare('DELETE FROM image_files WHERE path = ?');
    const deleteEmbedding = db.prepare('DELETE FROM image_embeddings WHERE path = ?');

    const runDelete = db.transaction(() => {
      deleteFile.run(path);
      deleteEmbedding.run(path);
    });
    runDelete();
  }

  /**
   * Removes all image entries belonging to a root directory.
   */
  deleteByRoot(root: string): void {
    const db = this.open();
    // First get all paths for this root
    const paths = db.prepare('SELECT path FROM image_files WHERE root = ?').all(root) as Array<{ path: string }>;

    const deleteFile = db.prepare('DELETE FROM image_files WHERE root = ?');
    const deleteEmbedding = db.prepare('DELETE FROM image_embeddings WHERE path = ?');

    const runDelete = db.transaction(() => {
      deleteFile.run(root);
      for (const { path } of paths) {
        deleteEmbedding.run(path);
      }
    });
    runDelete();
  }

  /**
   * Returns the number of indexed images, optionally filtered by root.
   */
  getIndexedCount(root?: string): number {
    const db = this.open();
    if (root !== undefined) {
      const row = db.prepare('SELECT COUNT(*) as count FROM image_files WHERE root = ?').get(root) as { count: number };
      return row.count;
    }
    const row = db.prepare('SELECT COUNT(*) as count FROM image_files').get() as { count: number };
    return row.count;
  }

  /**
   * Returns all distinct root directories that have indexed images.
   */
  getIndexedRoots(): string[] {
    const db = this.open();
    const rows = db.prepare('SELECT DISTINCT root FROM image_files').all() as Array<{ root: string }>;
    return rows.map((r) => r.root);
  }

  /**
   * Retrieves a metadata value by key from the image_search_meta table.
   * Returns null if the key does not exist.
   */
  getMeta(key: string): string | null {
    const db = this.open();
    const row = db.prepare('SELECT value FROM image_search_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  /**
   * Stores or updates a metadata value by key.
   */
  setMeta(key: string, value: string): void {
    const db = this.open();
    db.prepare('INSERT OR REPLACE INTO image_search_meta (key, value) VALUES (?, ?)').run(key, value);
  }

  /**
   * Looks up a file entry from the image_files table by path.
   */
  getFileEntry(path: string): { path: string; fileTime: number; size: number } | null {
    const db = this.open();
    const row = db
      .prepare('SELECT path, file_time AS fileTime, size FROM image_files WHERE path = ?')
      .get(path) as { path: string; fileTime: number; size: number } | undefined;
    return row ?? null;
  }

  /**
   * Returns all indexed entries as {path, fileTime}[] for incremental indexing.
   * Optionally filters by root directory.
   * Used by ImageIndexManager to build the incremental skip map for the worker.
   */
  getAllEntries(root?: string): Array<{ path: string; fileTime: number }> {
    const db = this.open();
    let rows: Array<{ path: string; fileTime: number }>;
    if (root !== undefined) {
      rows = db
        .prepare('SELECT path, file_time AS fileTime FROM image_files WHERE root = ?')
        .all(root) as Array<{ path: string; fileTime: number }>;
    } else {
      rows = db
        .prepare('SELECT path, file_time AS fileTime FROM image_files')
        .all() as Array<{ path: string; fileTime: number }>;
    }
    return rows;
  }

  /**
   * Returns the stored embedding as a Float32Array for a given path.
   * Returns null if the path is not indexed.
   * Used by image-similarity search (以图搜图) in Plan 17-04.
   */
  getEmbeddingByPath(path: string): Float32Array | null {
    const db = this.open();
    const row = db
      .prepare('SELECT embedding FROM image_embeddings WHERE path = ?')
      .get(path) as { embedding: Buffer } | undefined;

    if (!row) return null;

    // Convert Buffer/BLOB to Float32Array
    const buffer = row.embedding;
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  /**
   * Closes the database connection. Safe to call multiple times.
   */
  close(): void {
    this.db?.close();
    this.db = null;
  }

  /**
   * Returns true if the database is currently open.
   */
  isOpen(): boolean {
    return this.db !== null;
  }
}
