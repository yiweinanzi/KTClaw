/**
 * Unit tests for ImageVectorStore
 *
 * Tests sqlite-vec DB operations:
 * - Schema initialization
 * - upsertBatch / knnQuery / deleteByPath
 * - getMeta / setMeta
 * - getIndexedCount / getIndexedRoots / getAllEntries
 * - getEmbeddingByPath
 * - close / open lifecycle
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock electron paths module so tests can run without Electron runtime
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => join(tmpdir(), 'ktclaw-test')),
    getAppPath: vi.fn(() => join(tmpdir(), 'ktclaw-test')),
    isPackaged: false,
  },
}));

import { ImageVectorStore, getImageIndexDbPath } from '../../electron/services/image-search/image-vector-store';

const DIM = 512;

function makeEmbedding(seed: number): Float32Array {
  const arr = new Float32Array(DIM);
  // Normalize the vector for cosine similarity
  let sum = 0;
  for (let i = 0; i < DIM; i++) {
    arr[i] = Math.sin((i + seed) * 0.1);
    sum += arr[i] * arr[i];
  }
  const norm = Math.sqrt(sum);
  for (let i = 0; i < DIM; i++) {
    arr[i] /= norm;
  }
  return arr;
}

describe('ImageVectorStore', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: ImageVectorStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ivs-test-'));
    dbPath = join(tmpDir, 'test.db');
    store = new ImageVectorStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('open() creates DB file and sets WAL mode', () => {
    const db = store.open();
    expect(existsSync(dbPath)).toBe(true);
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');
  });

  it('open() creates schema tables', () => {
    const db = store.open();
    // Verify image_files table exists
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='image_files'"
    ).all();
    expect(tables.length).toBe(1);
    // Verify image_search_meta table exists
    const metaTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='image_search_meta'"
    ).all();
    expect(metaTables.length).toBe(1);
  });

  it('open() creates image_embeddings virtual table', () => {
    const db = store.open();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='image_embeddings'"
    ).all();
    expect(tables.length).toBe(1);
  });

  it('open() is idempotent - returns same db instance', () => {
    const db1 = store.open();
    const db2 = store.open();
    expect(db1).toBe(db2);
  });

  it('isOpen() reflects open/close state', () => {
    expect(store.isOpen()).toBe(false);
    store.open();
    expect(store.isOpen()).toBe(true);
    store.close();
    expect(store.isOpen()).toBe(false);
  });

  it('upsertBatch() inserts embeddings and can be retrieved by path', () => {
    store.open();
    const embedding = makeEmbedding(1);
    store.upsertBatch([
      {
        path: '/photos/test.jpg',
        embedding,
        fileTime: 1700000000,
        size: 1024,
        root: '/photos',
      },
    ]);
    const count = store.getIndexedCount();
    expect(count).toBe(1);
  });

  it('upsertBatch() with existing path updates the embedding (upsert)', () => {
    store.open();
    const embedding1 = makeEmbedding(1);
    const embedding2 = makeEmbedding(2);

    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: embedding1, fileTime: 1700000000, size: 1024, root: '/photos' },
    ]);
    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: embedding2, fileTime: 1700000001, size: 2048, root: '/photos' },
    ]);

    // Should still be just one entry
    expect(store.getIndexedCount()).toBe(1);

    // The stored embedding should be the updated one
    const retrieved = store.getEmbeddingByPath('/photos/a.jpg');
    expect(retrieved).not.toBeNull();
    // Compare first few values to verify it's embedding2
    expect(retrieved![0]).toBeCloseTo(embedding2[0], 5);
  });

  it('knnQuery() returns results sorted by cosine distance', () => {
    store.open();
    const emb1 = makeEmbedding(1); // query vector is same as emb1, so it should be closest
    const emb2 = makeEmbedding(50); // very different

    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: emb1, fileTime: 1700000000, size: 1024, root: '/photos' },
      { path: '/photos/b.jpg', embedding: emb2, fileTime: 1700000001, size: 1024, root: '/photos' },
    ]);

    const results = store.knnQuery(emb1, { limit: 10 });
    expect(results.length).toBe(2);
    // The most similar should be first (lowest distance)
    expect(results[0].path).toBe('/photos/a.jpg');
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });

  it('knnQuery() respects limit', () => {
    store.open();
    for (let i = 0; i < 5; i++) {
      store.upsertBatch([
        {
          path: `/photos/img${i}.jpg`,
          embedding: makeEmbedding(i),
          fileTime: 1700000000 + i,
          size: 1024,
          root: '/photos',
        },
      ]);
    }

    const results = store.knnQuery(makeEmbedding(0), { limit: 3 });
    expect(results.length).toBe(3);
  });

  it('knnQuery() with timeRange filters results by file_time', () => {
    store.open();
    store.upsertBatch([
      { path: '/photos/old.jpg', embedding: makeEmbedding(1), fileTime: 1000000000, size: 1024, root: '/photos' },
      { path: '/photos/new.jpg', embedding: makeEmbedding(2), fileTime: 1700000000, size: 1024, root: '/photos' },
    ]);

    const results = store.knnQuery(makeEmbedding(1), {
      limit: 10,
      timeStart: 1600000000,
      timeEnd: 1800000000,
    });
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('/photos/new.jpg');
  });

  it('knnQuery() with roots filter restricts results to specific root directories', () => {
    store.open();
    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: makeEmbedding(1), fileTime: 1700000000, size: 1024, root: '/photos' },
      { path: '/docs/b.jpg', embedding: makeEmbedding(2), fileTime: 1700000001, size: 1024, root: '/docs' },
    ]);

    const results = store.knnQuery(makeEmbedding(1), { limit: 10, roots: ['/photos'] });
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('/photos/a.jpg');
  });

  it('deleteByPath() removes the entry', () => {
    store.open();
    store.upsertBatch([
      { path: '/photos/del.jpg', embedding: makeEmbedding(1), fileTime: 1700000000, size: 1024, root: '/photos' },
    ]);
    expect(store.getIndexedCount()).toBe(1);

    store.deleteByPath('/photos/del.jpg');
    expect(store.getIndexedCount()).toBe(0);
  });

  it('getIndexedCount() returns correct count', () => {
    store.open();
    expect(store.getIndexedCount()).toBe(0);

    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: makeEmbedding(1), fileTime: 1700000000, size: 1024, root: '/photos' },
      { path: '/photos/b.jpg', embedding: makeEmbedding(2), fileTime: 1700000001, size: 1024, root: '/photos' },
    ]);
    expect(store.getIndexedCount()).toBe(2);
  });

  it('getMeta() returns null for non-existent key', () => {
    store.open();
    const val = store.getMeta('nonexistent_key');
    expect(val).toBeNull();
  });

  it('setMeta()/getMeta() stores and retrieves model_id and embedding_dim', () => {
    store.open();
    store.setMeta('model_id', 'Xenova/mobileclip_s0');
    store.setMeta('embedding_dim', '512');

    expect(store.getMeta('model_id')).toBe('Xenova/mobileclip_s0');
    expect(store.getMeta('embedding_dim')).toBe('512');
  });

  it('setMeta() updates existing value (upsert)', () => {
    store.open();
    store.setMeta('model_id', 'old-model');
    store.setMeta('model_id', 'new-model');
    expect(store.getMeta('model_id')).toBe('new-model');
  });

  it('close() closes the database cleanly', () => {
    store.open();
    expect(store.isOpen()).toBe(true);
    store.close();
    expect(store.isOpen()).toBe(false);
  });

  it('dimension mismatch detection - getMeta returns different dim than current model', () => {
    store.open();
    store.setMeta('embedding_dim', '256');
    const dim = parseInt(store.getMeta('embedding_dim') ?? '0', 10);
    expect(dim).not.toBe(512);
    // Caller can detect mismatch and handle re-indexing
  });

  it('getAllEntries() returns all entries as {path, fileTime}[] array', () => {
    store.open();
    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: makeEmbedding(1), fileTime: 1700000000, size: 1024, root: '/photos' },
      { path: '/photos/b.jpg', embedding: makeEmbedding(2), fileTime: 1700000001, size: 1024, root: '/photos' },
      { path: '/docs/c.jpg', embedding: makeEmbedding(3), fileTime: 1700000002, size: 1024, root: '/docs' },
    ]);

    const entries = store.getAllEntries();
    expect(entries.length).toBe(3);
    expect(entries[0]).toHaveProperty('path');
    expect(entries[0]).toHaveProperty('fileTime');
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('/photos/a.jpg');
    expect(paths).toContain('/photos/b.jpg');
    expect(paths).toContain('/docs/c.jpg');
  });

  it('getAllEntries(root) filters entries by root directory', () => {
    store.open();
    store.upsertBatch([
      { path: '/photos/a.jpg', embedding: makeEmbedding(1), fileTime: 1700000000, size: 1024, root: '/photos' },
      { path: '/docs/b.jpg', embedding: makeEmbedding(2), fileTime: 1700000001, size: 1024, root: '/docs' },
    ]);

    const entries = store.getAllEntries('/photos');
    expect(entries.length).toBe(1);
    expect(entries[0].path).toBe('/photos/a.jpg');
  });

  it('getEmbeddingByPath() returns Float32Array for existing path', () => {
    store.open();
    const embedding = makeEmbedding(42);
    store.upsertBatch([
      { path: '/photos/embed.jpg', embedding, fileTime: 1700000000, size: 1024, root: '/photos' },
    ]);

    const retrieved = store.getEmbeddingByPath('/photos/embed.jpg');
    expect(retrieved).not.toBeNull();
    expect(retrieved).toBeInstanceOf(Float32Array);
    expect(retrieved!.length).toBe(DIM);
    // Verify values match
    for (let i = 0; i < 10; i++) {
      expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
    }
  });

  it('getEmbeddingByPath() returns null for non-existent path', () => {
    store.open();
    const result = store.getEmbeddingByPath('/nonexistent/path.jpg');
    expect(result).toBeNull();
  });
});

describe('getImageIndexDbPath', () => {
  it('returns a string path ending with index.db', () => {
    const path = getImageIndexDbPath();
    expect(typeof path).toBe('string');
    expect(path.endsWith('index.db')).toBe(true);
  });
});
