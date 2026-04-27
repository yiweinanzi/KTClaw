import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { searchImages } from '../../services/image-search/image-search-service';

interface ImageSearchQueryBody {
  query?: string;
  roots?: unknown;
  limit?: number;
  now?: string;
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

    const result = await searchImages({
      query,
      roots,
      limit: body.limit,
      now: normalizeNow(body.now),
    });
    sendJson(res, 200, result);
    return true;
  }

  return false;
}
