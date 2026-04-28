/**
 * image-index-worker.ts
 *
 * Worker Thread script for background image indexing.
 * Runs in an isolated V8 context — must NOT import better-sqlite3 or ImageVectorStore.
 *
 * Responsibilities:
 * - Scans image directories with symlink cycle protection and depth limits
 * - Extracts EXIF metadata (DateTimeOriginal, GPS, dimensions) via exifreader
 * - Generates MobileCLIP embeddings via @xenova/transformers (dynamic import, per D-13)
 * - Converts embeddings to Float32Array before postMessage (Warning 5 fix)
 * - Sends embedding batches to main process via parentPort.postMessage
 *
 * Design decisions (D-09, D-12, D-13, D-15):
 * - D-09: Worker never touches DB directly — sends batches to main process
 * - D-12: Uses exifreader (not exifr)
 * - D-13: Dynamic import of transformers library (avoids blocking thread startup)
 * - D-15: Symlink cycle protection via Set<string> of visited real paths
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readdir, stat, realpath } from 'node:fs/promises';
import { join, extname } from 'node:path';
import ExifReader from 'exifreader';
import type { ImageSearchModelSource } from './model-cache';

// ─── Constants ───────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
]);

const BATCH_SIZE: number = (workerData as WorkerData).batchSize || 50;
const MAX_SCAN_DEPTH = 20;
const DIR_TIMEOUT_MS = 5000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkerData {
  roots: string[];
  modelCacheDir: string;
  modelSources: ImageSearchModelSource[];
  localModelPath: string | null;
  existingEntries: Array<{ path: string; fileTime: number }>;
  batchSize: number;
}

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

// ─── EXIF extraction ─────────────────────────────────────────────────────────

interface FileMetadata {
  fileTime: number;
  lat?: number;
  lon?: number;
  width?: number;
  height?: number;
}

async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  let fileTime: number | undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  try {
    // Use ExifReader.load with expanded mode to get all tag groups
    const tags = await ExifReader.load(filePath, { expanded: true });

    // Extract DateTimeOriginal from EXIF tags
    const exifTags = tags.exif;
    if (exifTags?.DateTimeOriginal?.description) {
      const dtStr = exifTags.DateTimeOriginal.description;
      // EXIF format: "YYYY:MM:DD HH:MM:SS" — normalize to ISO for Date parsing
      const normalized = dtStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsed = new Date(normalized);
      if (!isNaN(parsed.getTime())) {
        fileTime = parsed.getTime();
      }
    }

    // Extract GPS coordinates
    const gpsTags = tags.gps;
    if (gpsTags?.Latitude !== undefined && gpsTags?.Longitude !== undefined) {
      lat = gpsTags.Latitude;
      lon = gpsTags.Longitude;
    }

    // Extract image dimensions from file tags
    const fileTags = tags.file;
    if (fileTags?.['Image Width']?.value !== undefined) {
      width = Number(fileTags['Image Width'].value);
    }
    if (fileTags?.['Image Height']?.value !== undefined) {
      height = Number(fileTags['Image Height'].value);
    }
  } catch {
    // EXIF extraction failed — will fall back to mtime
  }

  // Fallback to filesystem mtime if DateTimeOriginal not found
  if (fileTime === undefined) {
    const fileStat = await stat(filePath);
    fileTime = fileStat.mtimeMs;
  }

  return { fileTime, lat, lon, width, height };
}

// ─── Directory Scanner ────────────────────────────────────────────────────────

async function* walkImages(
  root: string,
  visitedPaths: Set<string>,
  depth: number,
): AsyncGenerator<string> {
  // Circuit breaker: maximum scan depth
  if (depth > MAX_SCAN_DEPTH) {
    return;
  }

  // Resolve real path to detect symlink cycles
  let realPath: string;
  try {
    realPath = await realpath(root);
  } catch {
    // Path doesn't exist or permission denied — skip
    return;
  }

  // Skip if we've already visited this real path (symlink cycle protection)
  if (visitedPaths.has(realPath)) {
    return;
  }
  visitedPaths.add(realPath);

  // Read directory with timeout to avoid hanging on network drives
  let entries: import('node:fs').Dirent<string>[];
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Directory read timeout: ${root}`)), DIR_TIMEOUT_MS),
    );
    entries = await Promise.race([
      readdir(root, { withFileTypes: true, encoding: 'utf8' }),
      timeoutPromise,
    ]);
  } catch {
    // Directory read failed or timed out — skip
    return;
  }

  for (const entry of entries) {
    // Skip hidden files/directories (starting with '.')
    if (entry.name.startsWith('.')) continue;

    const entryPath = join(root, entry.name);

    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      // Recurse into subdirectories (but NOT symlinks to avoid cycles)
      yield* walkImages(entryPath, visitedPaths, depth + 1);
    } else if (entry.isFile()) {
      // Yield image files with supported extensions
      const ext = extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        yield entryPath;
      }
    }
  }
}

// ─── Main indexing loop ───────────────────────────────────────────────────────

async function runIndexing(): Promise<void> {
  const data = workerData as WorkerData;

  // Send log message
  const log = (level: 'info' | 'warn' | 'error', message: string) => {
    parentPort!.postMessage({ type: 'log', level, message } satisfies WorkerMessage);
  };

  log('info', `ImageIndexWorker starting: ${data.roots.length} root(s), batchSize=${BATCH_SIZE}`);

  // Build incremental skip map from existing entries
  const existingMap = new Map<string, number>();
  for (const entry of data.existingEntries) {
    existingMap.set(entry.path, entry.fileTime);
  }

  log('info', `Incremental mode: ${existingMap.size} existing entries to skip if unchanged`);

  // Dynamically import @xenova/transformers (per D-13: avoids blocking thread startup;
  // note: @xenova/transformers is the installed package — @huggingface/transformers
  // is the upstream rename but not yet adopted in this codebase)
  log('info', 'Loading transformers model...');

  const transformers = await import('@xenova/transformers');

  // Configure transformers environment using workerData
  transformers.env.cacheDir = data.modelCacheDir;
  transformers.env.allowLocalModels = true;

  // Configure model source (prefer local, then cache, then remote)
  const source = data.modelSources[0];
  if (!source) {
    // No model sources — fatal
    parentPort!.postMessage({
      type: 'error',
      message: 'No model sources available. Set KTCLAW_IMAGE_SEARCH_ENABLE_SEMANTIC=1 and provide a model.',
      fatal: true,
    } satisfies WorkerMessage);
    return;
  }

  if (source.name === 'local') {
    transformers.env.localModelPath = source.localModelPath;
    transformers.env.allowRemoteModels = false;
  } else if (source.name === 'cache') {
    transformers.env.allowRemoteModels = false;
  } else {
    transformers.env.allowRemoteModels = true;
    transformers.env.remoteHost = source.remoteHost;
    transformers.env.remotePathTemplate = source.remotePathTemplate;
  }

  // Load MobileCLIP models — same pattern as mobileclip-provider.ts
  const modelId = 'Xenova/mobileclip_s0';
  const loadOptions = source.name === 'local' || source.name === 'cache'
    ? {}
    : { revision: (source as { revision: string }).revision };

  log('info', `Loading MobileCLIP model: ${modelId}`);

  let processor: Awaited<ReturnType<typeof transformers.AutoProcessor.from_pretrained>>;
  let visionModel: Awaited<ReturnType<typeof transformers.CLIPVisionModelWithProjection.from_pretrained>>;

  try {
    [processor, visionModel] = await Promise.all([
      transformers.AutoProcessor.from_pretrained(modelId, loadOptions),
      transformers.CLIPVisionModelWithProjection.from_pretrained(modelId, { ...loadOptions, quantized: true }),
    ]);
  } catch (err) {
    parentPort!.postMessage({
      type: 'error',
      message: `Failed to load MobileCLIP model: ${err instanceof Error ? err.message : String(err)}`,
      fatal: true,
    } satisfies WorkerMessage);
    return;
  }

  log('info', 'MobileCLIP model loaded successfully');

  const { RawImage } = transformers;

  // Indexing state
  let indexed = 0;
  let errors = 0;
  let skipped = 0;
  let total = 0;

  // Current batch accumulator
  type BatchItem = {
    path: string;
    embedding: Float32Array;
    fileTime: number;
    size: number;
    root: string;
    width?: number;
    height?: number;
    lat?: number;
    lon?: number;
  };
  let currentBatch: BatchItem[] = [];

  const flushBatch = () => {
    if (currentBatch.length === 0) return;
    parentPort!.postMessage({ type: 'batch', items: currentBatch } satisfies WorkerMessage);
    currentBatch = [];
  };

  // Process each root directory
  for (const root of data.roots) {
    log('info', `Scanning root: ${root}`);
    const visitedPaths = new Set<string>();

    for await (const filePath of walkImages(root, visitedPaths, 0)) {
      total += 1;

      try {
        const fileStat = await stat(filePath);

        // Incremental skip: check if path+mtime matches existing entry
        const existingFileTime = existingMap.get(filePath);
        if (existingFileTime !== undefined && Math.abs(existingFileTime - fileStat.mtimeMs) < 1000) {
          // File unchanged — skip embedding
          skipped += 1;
          continue;
        }

        // Extract EXIF metadata
        const metadata = await getFileMetadata(filePath);

        // Generate image embedding via MobileCLIP vision model
        const image = await RawImage.read(filePath);
        const inputs = await processor(image);
        const output = await visionModel(inputs);

        // IMPORTANT: Convert model output to Float32Array before postMessage (Warning 5 fix).
        // The model returns number[] or a typed array; we always use Float32Array
        // for efficient structured clone transfer via postMessage (2KB vs 6KB JSON).
        const modelOutput = (output.image_embeds as { data: ArrayLike<number> }).data;
        const embeddingF32 = new Float32Array(modelOutput);

        // Add to current batch
        currentBatch.push({
          path: filePath,
          embedding: embeddingF32,
          fileTime: metadata.fileTime,
          size: fileStat.size,
          root,
          ...(metadata.width !== undefined ? { width: metadata.width } : {}),
          ...(metadata.height !== undefined ? { height: metadata.height } : {}),
          ...(metadata.lat !== undefined ? { lat: metadata.lat } : {}),
          ...(metadata.lon !== undefined ? { lon: metadata.lon } : {}),
        });

        indexed += 1;

        // Flush batch when it reaches BATCH_SIZE
        if (currentBatch.length >= BATCH_SIZE) {
          flushBatch();
          parentPort!.postMessage({
            type: 'progress',
            indexed,
            total,
            errors,
            currentFile: filePath,
          } satisfies WorkerMessage);
        }
      } catch (err) {
        errors += 1;
        log(
          'warn',
          `Failed to index ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Flush any remaining items in the final batch
  flushBatch();

  // Send completion message
  parentPort!.postMessage({
    type: 'complete',
    indexed,
    errors,
    skipped,
  } satisfies WorkerMessage);

  log('info', `Indexing complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors`);
}

// ─── Startup ─────────────────────────────────────────────────────────────────

if (parentPort) {
  runIndexing().catch((err) => {
    parentPort!.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      fatal: true,
    });
    process.exit(1);
  });
}
