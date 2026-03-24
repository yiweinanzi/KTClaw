import type { IncomingMessage, ServerResponse } from 'http';

export const HOST_API_SESSION_HEADER = 'x-clawx-host-session';

export async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${HOST_API_SESSION_HEADER}`);
}

function readSessionHeader(req: IncomingMessage): string | null {
  const headerValue = req.headers[HOST_API_SESSION_HEADER];
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }
  return typeof headerValue === 'string' ? headerValue : null;
}

export function isAuthorizedHostApiRequest(req: IncomingMessage, sessionToken: string): boolean {
  if (!sessionToken) {
    return false;
  }

  return readSessionHeader(req) === sessionToken;
}

export function sendUnauthorized(res: ServerResponse): void {
  setCorsHeaders(res);
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res: ServerResponse): void {
  setCorsHeaders(res);
  res.statusCode = 204;
  res.end();
}

export function sendText(res: ServerResponse, statusCode: number, text: string): void {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}
