import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseImageSearchQuery, type ParsedImageSearchQuery } from './query-parser';

export interface ImageSearchRequest {
  query: string;
  roots: string[];
  now?: Date;
  limit?: number;
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

const TERM_SYNONYMS: Record<string, string[]> = {
  猫: ['cat', 'kitty', 'kitten'],
  海边: ['beach', 'sea', 'ocean', 'coast', 'shore', 'seaside'],
  会议: ['meeting', 'conference', 'sync', 'standup'],
  截图: ['screenshot', 'screen shot', 'screen-shot', 'screen_capture', 'snapshot'],
};

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

function scorePath(path: string, parsed: ParsedImageSearchQuery): ImageSearchResultEntry['match'] {
  const terms = getExpandedTerms(parsed.contentTerms, parsed.imageKind);
  if (terms.length === 0) {
    return {
      score: 1,
      matchedTerms: [],
      reasons: ['time'],
    };
  }

  const text = normalizeSearchText(path);
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
  let totalScanned = 0;
  let totalMatched = 0;

  for (const root of roots) {
    for await (const filePath of walkImages(root)) {
      if (!isInsideRoot(filePath, root)) continue;
      totalScanned += 1;

      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) continue;

      const fileTimeMs = fileStat.mtimeMs;
      if (!isInTimeRange(fileTimeMs, parsed)) continue;

      const match = scorePath(filePath, parsed);
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

  results.sort((a, b) => {
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    return Date.parse(b.fileTime) - Date.parse(a.fileTime);
  });

  return {
    parsed,
    roots,
    totalScanned,
    totalMatched,
    results: results.slice(0, limit),
  };
}
