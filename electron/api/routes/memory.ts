import type { IncomingMessage, ServerResponse } from 'http';
import { readFile, readdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

function getWorkspaceDir(): string {
  return join(homedir(), '.openclaw', 'workspace');
}

async function listMemoryFiles(): Promise<{ name: string; path: string; size: number; mtime: number }[]> {
  const dir = getWorkspaceDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const mdFiles = entries.filter((f) => f.endsWith('.md'));
  const results = await Promise.all(
    mdFiles.map(async (name) => {
      const fullPath = join(dir, name);
      try {
        const s = await stat(fullPath);
        return { name, path: fullPath, size: s.size, mtime: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean) as { name: string; path: string; size: number; mtime: number }[];
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // GET /api/memory — list files
  if (url.pathname === '/api/memory' && req.method === 'GET') {
    const files = await listMemoryFiles();
    sendJson(res, 200, { files, workspaceDir: getWorkspaceDir() });
    return true;
  }

  // GET /api/memory/file?name=FILENAME — read file content
  if (url.pathname === '/api/memory/file' && req.method === 'GET') {
    const name = url.searchParams.get('name');
    if (!name || name.includes('..') || !name.endsWith('.md')) {
      sendJson(res, 400, { error: 'Invalid file name' });
      return true;
    }
    const fullPath = join(getWorkspaceDir(), name);
    try {
      const content = await readFile(fullPath, 'utf-8');
      sendJson(res, 200, { name, content });
    } catch {
      sendJson(res, 404, { error: 'File not found' });
    }
    return true;
  }

  // PUT /api/memory/file — write file content
  if (url.pathname === '/api/memory/file' && req.method === 'PUT') {
    let body: { name?: string; content?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return true;
    }
    const { name, content } = body;
    if (!name || name.includes('..') || !name.endsWith('.md') || typeof content !== 'string') {
      sendJson(res, 400, { error: 'Invalid request' });
      return true;
    }
    const fullPath = join(getWorkspaceDir(), name);
    try {
      await writeFile(fullPath, content, 'utf-8');
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return true;
  }

  return false;
}
