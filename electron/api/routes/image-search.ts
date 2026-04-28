import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { searchImages } from '../../services/image-search/image-search-service';
import { getImageIndexManager } from '../../services/image-search/image-index-manager';
import { getDefaultImageDirectories } from '../../services/image-search/image-directories';

export { getDefaultImageDirectories };

interface ImageSearchQueryBody {
  query?: string;
  roots?: unknown;
  limit?: number;
  now?: string;
  semantic?: boolean;
  similarTo?: string;
}

function normalizeRoots(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeNow(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function handleImageSearchRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // POST /api/image-search/query — main search endpoint
  if (url.pathname === '/api/image-search/query' && req.method === 'POST') {
    const body = await parseJsonBody<ImageSearchQueryBody>(req);
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const roots = normalizeRoots(body.roots);

    if (!query || roots.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'QUERY_AND_ROOTS_REQUIRED',
      });
      return true;
    }

    const similarTo = typeof body.similarTo === 'string' ? body.similarTo.trim() : undefined;
    const result = await searchImages({
      query,
      roots,
      limit: body.limit,
      now: normalizeNow(body.now),
      semantic: true,
      similarTo,
    });
    sendJson(res, 200, result);
    return true;
  }

  // GET /api/image-search/index/status — index status
  if (url.pathname === '/api/image-search/index/status' && req.method === 'GET') {
    const manager = getImageIndexManager();
    const status = manager.getStatus();
    sendJson(res, 200, {
      state: status.state,
      progress: status.progress,
      lastIndexedAt: status.lastIndexedAt?.toISOString() ?? null,
      roots: status.roots,
      totalIndexed: status.totalIndexed,
    });
    return true;
  }

  // POST /api/image-search/index/start — start indexing
  if (url.pathname === '/api/image-search/index/start' && req.method === 'POST') {
    const body = await parseJsonBody<{ roots?: unknown }>(req);
    const roots = normalizeRoots(body.roots);
    if (roots.length === 0) {
      sendJson(res, 400, { success: false, error: 'ROOTS_REQUIRED' });
      return true;
    }
    const manager = getImageIndexManager();
    manager.startIndexing(roots);
    sendJson(res, 200, { success: true, state: manager.getStatus().state });
    return true;
  }

  // GET /api/image-search/index/directories — auto-detected system image directories
  if (url.pathname === '/api/image-search/index/directories' && req.method === 'GET') {
    const dirs = getDefaultImageDirectories();
    sendJson(res, 200, { directories: dirs });
    return true;
  }

  return false;
}
