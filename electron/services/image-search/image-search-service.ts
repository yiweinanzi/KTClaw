import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { getMobileClipSemanticProvider } from './mobileclip-provider';
import { MOBILECLIP_MODEL_ID } from './model-cache';
import { parseImageSearchQuery, type ParsedImageSearchQuery } from './query-parser';
import { getImageIndexManager } from './image-index-manager';

export interface ImageSearchRequest {
  query: string;
  roots: string[];
  now?: Date;
  limit?: number;
  semantic?: boolean;
  semanticProvider?: ImageSemanticProvider;
  similarTo?: string;  // image path for similarity search (以图搜图)
}

export interface ImageSemanticProvider {
  embedText(text: string): Promise<number[]>;
  embedImage(filePath: string): Promise<number[]>;
}

export interface ImageSearchResultEntry {
  path: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  createdAt: string;
  modifiedAt: string;
  fileTime: string;
  match: {
    score: number;
    matchedTerms: string[];
    reasons: string[];
  };
}

export interface ImageSearchResult {
  parsed: ParsedImageSearchQuery;
  roots: string[];
  totalScanned: number;
  totalMatched: number;
  semantic?: {
    requested: boolean;
    enabled: boolean;
    model: string | null;
    error?: string;
    indexStatus?: string;
  };
  results: ImageSearchResultEntry[];
}

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SEMANTIC_MIN_SIMILARITY = 0.2;

const TERM_SYNONYMS: Record<string, string[]> = {
  猫: ['cat', 'kitty', 'kitten'],
  企鹅: ['penguin', 'penguins'],
  海边: ['beach', 'sea', 'ocean', 'coast', 'shore', 'seaside'],
  会议: ['meeting', 'conference', 'sync', 'standup'],
  截图: ['screenshot', 'screen shot', 'screen-shot', 'screen_capture', 'snapshot'],
  // Extended synonyms for new dictionary terms (most likely to appear in filenames)
  旅游: ['travel', 'trip', 'journey', 'vacation', 'tour'],
  旅行: ['travel', 'trip', 'journey', 'vacation'],
  婚礼: ['wedding', 'marriage', 'bride', 'groom'],
  生日: ['birthday', 'bday', 'birth_day'],
  毕业: ['graduation', 'graduate', 'commencement'],
  风景: ['landscape', 'scenery', 'scenic', 'nature'],
  自拍: ['selfie', 'self-portrait', 'self_portrait'],
  全家福: ['family', 'family_photo', 'family-photo'],
  夜景: ['night', 'nightscape', 'night_view', 'nighttime'],
  狗: ['dog', 'puppy', 'canine'],
};

const SEMANTIC_SCORE_SCALE = 10;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit as number)));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ');
}

function getExpandedTerms(terms: string[], imageKind: ParsedImageSearchQuery['imageKind']): string[] {
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    for (const synonym of TERM_SYNONYMS[term] ?? []) {
      expanded.add(synonym);
    }
  }
  if (imageKind === 'screenshot') {
    expanded.add('截图');
    for (const synonym of TERM_SYNONYMS.截图) {
      expanded.add(synonym);
    }
  }
  return [...expanded];
}

function scorePath(path: string, parsed: ParsedImageSearchQuery, root?: string): ImageSearchResultEntry['match'] {
  const terms = getExpandedTerms(parsed.contentTerms, parsed.imageKind);
  if (terms.length === 0) {
    return {
      score: 1,
      matchedTerms: [],
      reasons: ['time'],
    };
  }

  const searchPath = root ? relative(root, path) || basename(path) : path;
  const text = normalizeSearchText(searchPath);
  const matchedOriginalTerms = new Set<string>();
  let score = 0;
  const reasons: string[] = [];

  for (const originalTerm of parsed.contentTerms) {
    const candidates = [originalTerm, ...(TERM_SYNONYMS[originalTerm] ?? [])];
    if (candidates.some((candidate) => text.includes(normalizeSearchText(candidate)))) {
      matchedOriginalTerms.add(originalTerm);
      score += 10;
      reasons.push(`content:${originalTerm}`);
    }
  }

  if (parsed.imageKind === 'screenshot') {
    const screenshotTerms = ['截图', ...TERM_SYNONYMS.截图];
    if (screenshotTerms.some((candidate) => text.includes(normalizeSearchText(candidate)))) {
      score += 4;
      reasons.push('kind:screenshot');
    }
  }

  return {
    score,
    matchedTerms: [...matchedOriginalTerms],
    reasons,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const av = a[index];
    const bv = b[index];
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm <= 0 || bNorm <= 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function mergeSemanticMatch(
  base: ImageSearchResultEntry['match'],
  parsed: ParsedImageSearchQuery,
  similarity: number,
): ImageSearchResultEntry['match'] {
  if (similarity < SEMANTIC_MIN_SIMILARITY) return base;
  const matchedTerms = new Set(base.matchedTerms);
  for (const term of parsed.contentTerms) matchedTerms.add(term);
  return {
    score: base.score + similarity * SEMANTIC_SCORE_SCALE,
    matchedTerms: [...matchedTerms],
    reasons: [...base.reasons, `semantic:${parsed.contentQuery || parsed.normalizedQuery}`],
  };
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedPath = resolve(path);
  const normalizedRoot = resolve(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`) || normalizedPath.startsWith(`${normalizedRoot}/`);
}

async function* walkImages(root: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkImages(path);
      continue;
    }
    if (!entry.isFile()) continue;
    if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield path;
    }
  }
}

function isInTimeRange(fileTimeMs: number, parsed: ParsedImageSearchQuery): boolean {
  if (!parsed.timeRange) return true;
  const start = Date.parse(parsed.timeRange.start);
  const end = Date.parse(parsed.timeRange.end);
  return fileTimeMs >= start && fileTimeMs < end;
}

export async function searchImages(request: ImageSearchRequest): Promise<ImageSearchResult> {
  const parsed = parseImageSearchQuery(request.query, { now: request.now });
  const roots = [...new Set((request.roots ?? []).map((root) => resolve(root)).filter(Boolean))];
  const limit = normalizeLimit(request.limit);
  const results: ImageSearchResultEntry[] = [];
  let semanticError: string | undefined;
  let totalScanned = 0;
  let totalMatched = 0;

  // ── Index-first strategy (D-07) ───────────────────────────────────────────
  const indexManager = getImageIndexManager();
  const vectorStore = indexManager.getVectorStore();
  const indexedRoots = vectorStore.getIndexedRoots();
  const indexedRootsSet = new Set(indexedRoots);
  const rootsWithIndex = roots.filter((r) => indexedRootsSet.has(r));
  const rootsWithoutIndex = roots.filter((r) => !indexedRootsSet.has(r));

  // ── Image-similarity search (以图搜图) ────────────────────────────────────
  if (request.similarTo) {
    const storedEmbedding = vectorStore.getEmbeddingByPath(request.similarTo);
    if (storedEmbedding) {
      const knnResults = vectorStore.knnQuery(storedEmbedding, {
        limit: (limit + 1) * 2,  // +1 to account for the query image itself
        roots: rootsWithIndex.length > 0 ? rootsWithIndex : undefined,
      });
      for (const knnResult of knnResults) {
        if (knnResult.path === request.similarTo) continue;  // exclude query image itself
        const similarity = 1 - knnResult.distance;
        if (similarity < SEMANTIC_MIN_SIMILARITY) continue;
        const pathRoot = rootsWithIndex.find((r) => knnResult.path.startsWith(r));
        const pathMatch = scorePath(knnResult.path, parsed, pathRoot);
        const match = mergeSemanticMatch(pathMatch, parsed, similarity);
        results.push({
          path: knnResult.path,
          fileName: basename(knnResult.path),
          extension: extname(knnResult.path).toLowerCase(),
          sizeBytes: knnResult.size,
          createdAt: new Date(knnResult.fileTime).toISOString(),
          modifiedAt: new Date(knnResult.fileTime).toISOString(),
          fileTime: new Date(knnResult.fileTime).toISOString(),
          match,
        });
        totalMatched += 1;
      }
      totalScanned += vectorStore.getIndexedCount();
    }
  } else {
    // ── Text query: KNN for indexed roots ────────────────────────────────────
    if (rootsWithIndex.length > 0 && parsed.contentQuery) {
      const semanticProvider = request.semanticProvider
        ?? await getMobileClipSemanticProvider().catch((error) => {
          semanticError = error instanceof Error ? error.message : String(error);
          return null;
        });

      if (semanticProvider) {
        const textEmbedding = await semanticProvider.embedText(parsed.contentQuery);
        const embeddingF32 = new Float32Array(textEmbedding);
        const knnResults = vectorStore.knnQuery(embeddingF32, {
          limit: limit * 2,  // fetch extra for post-filtering
          timeStart: parsed.timeRange ? Date.parse(parsed.timeRange.start) : undefined,
          timeEnd: parsed.timeRange ? Date.parse(parsed.timeRange.end) : undefined,
          roots: rootsWithIndex,
        });
        for (const knnResult of knnResults) {
          const similarity = 1 - knnResult.distance;  // cosine distance to similarity
          if (similarity < SEMANTIC_MIN_SIMILARITY) continue;
          const pathRoot = rootsWithIndex.find((r) => knnResult.path.startsWith(r));
          const pathMatch = scorePath(knnResult.path, parsed, pathRoot);
          const match = mergeSemanticMatch(pathMatch, parsed, similarity);
          results.push({
            path: knnResult.path,
            fileName: basename(knnResult.path),
            extension: extname(knnResult.path).toLowerCase(),
            sizeBytes: knnResult.size,
            createdAt: new Date(knnResult.fileTime).toISOString(),
            modifiedAt: new Date(knnResult.fileTime).toISOString(),
            fileTime: new Date(knnResult.fileTime).toISOString(),
            match,
          });
          totalMatched += 1;
        }
        totalScanned += vectorStore.getIndexedCount();
      }
    }

    // ── Filesystem walk for unindexed roots (fallback) ────────────────────────
    const fallbackRoots = rootsWithoutIndex.length > 0 ? rootsWithoutIndex : (rootsWithIndex.length === 0 ? roots : []);
    const useSemantic = request.semantic !== false && parsed.contentQuery;
    let semanticTextEmbedding: number[] | null = null;

    if (fallbackRoots.length > 0 && useSemantic && !semanticError) {
      const semanticProvider = request.semanticProvider
        ?? await getMobileClipSemanticProvider().catch((error) => {
          semanticError = error instanceof Error ? error.message : String(error);
          return null;
        });
      if (semanticProvider && parsed.contentQuery) {
        semanticTextEmbedding = await semanticProvider.embedText(parsed.contentQuery).catch((err) => {
          semanticError = err instanceof Error ? err.message : String(err);
          return null;
        });
      }
    }

    for (const root of fallbackRoots) {
      for await (const filePath of walkImages(root)) {
        if (!isInsideRoot(filePath, root)) continue;
        totalScanned += 1;

        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat?.isFile()) continue;

        const fileTimeMs = fileStat.mtimeMs;
        if (!isInTimeRange(fileTimeMs, parsed)) continue;

        let match = scorePath(filePath, parsed, root);
        if (semanticTextEmbedding) {
          const walkProvider = request.semanticProvider
            ?? await getMobileClipSemanticProvider().catch(() => null);
          if (walkProvider) {
            const imageEmbedding = await walkProvider.embedImage(filePath);
            match = mergeSemanticMatch(
              match,
              parsed,
              cosineSimilarity(semanticTextEmbedding, imageEmbedding),
            );
          }
        }
        if (parsed.contentTerms.length > 0 && match.score <= 0) continue;

        totalMatched += 1;
        results.push({
          path: filePath,
          fileName: basename(filePath),
          extension: extname(filePath).toLowerCase(),
          sizeBytes: fileStat.size,
          createdAt: fileStat.birthtime.toISOString(),
          modifiedAt: fileStat.mtime.toISOString(),
          fileTime: fileStat.mtime.toISOString(),
          match,
        });
      }
    }
  }

  results.sort((a, b) => {
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    return Date.parse(b.fileTime) - Date.parse(a.fileTime);
  });

  return {
    parsed,
    roots,
    totalScanned,
    totalMatched,
    semantic: {
      requested: true,
      enabled: true,
      model: MOBILECLIP_MODEL_ID,
      indexStatus: indexManager.getStatus().state,
      ...(semanticError ? { error: semanticError } : {}),
    },
    results: results.slice(0, limit),
  };
}
