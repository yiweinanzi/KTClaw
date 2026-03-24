/**
 * MCP Server Management Routes
 * Stores MCP server configs in ~/.openclaw/mcp-servers.json
 * Format follows the standard MCP server config schema.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

// ── Types ────────────────────────────────────────────────────────

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  transport: 'stdio' | 'sse' | 'http';
  url?: string; // for sse/http transport
  addedAt: string;
}

interface McpConfig {
  servers: McpServer[];
}

type LegacyMcpServerEntry = Partial<{
  command: string;
  args: unknown;
  env: Record<string, string>;
  enabled: boolean;
  transport: McpServer['transport'];
  url: string;
  addedAt: string;
}>;

// ── Storage ──────────────────────────────────────────────────────

function configPath(): string {
  return join(homedir(), '.openclaw', 'mcp-servers.json');
}

function loadConfig(): McpConfig {
  const p = configPath();
  if (!existsSync(p)) return { servers: [] };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    if (Array.isArray(raw?.servers)) return raw as McpConfig;
    // Legacy: if it's a flat object (name→config)
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const entries = Object.entries(raw) as Array<[string, LegacyMcpServerEntry]>;
      const servers: McpServer[] = entries.map(([name, entry]) => {
        const args = Array.isArray(entry.args)
          ? entry.args.filter((item): item is string => typeof item === 'string')
          : [];
        const env = entry.env && typeof entry.env === 'object'
          ? entry.env
          : {};
        return {
          name,
          command: entry.command ?? '',
          args,
          env,
          enabled: entry.enabled !== false,
          transport: entry.transport ?? 'stdio',
          url: entry.url,
          addedAt: entry.addedAt ?? new Date().toISOString(),
        };
      });
      return { servers };
    }
    return { servers: [] };
  } catch {
    return { servers: [] };
  }
}

function saveConfig(config: McpConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
}

// ── Body parser ──────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Route handler ────────────────────────────────────────────────

export async function handleMcpRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? 'GET';

  // GET /api/mcp — list all servers
  if (method === 'GET' && pathname === '/api/mcp') {
    const config = loadConfig();
    sendJson(res, 200, { servers: config.servers });
    return true;
  }

  // POST /api/mcp — add or update a server
  if (method === 'POST' && pathname === '/api/mcp') {
    const body = (await readBody(req)) as Partial<McpServer>;
    const name = (body.name ?? '').trim();
    if (!name) {
      sendJson(res, 400, { error: 'name is required' });
      return true;
    }
    const config = loadConfig();
    const existing = config.servers.findIndex((s) => s.name === name);
    const server: McpServer = {
      name,
      command: body.command ?? '',
      args: Array.isArray(body.args) ? body.args : [],
      env: body.env && typeof body.env === 'object' ? body.env as Record<string, string> : {},
      enabled: body.enabled !== false,
      transport: body.transport ?? 'stdio',
      url: body.url,
      addedAt: existing >= 0 ? (config.servers[existing].addedAt ?? new Date().toISOString()) : new Date().toISOString(),
    };
    if (existing >= 0) {
      config.servers[existing] = server;
    } else {
      config.servers.push(server);
    }
    saveConfig(config);
    sendJson(res, 200, { success: true, server });
    return true;
  }

  // PATCH /api/mcp/:name/toggle — enable/disable
  const toggleMatch = pathname.match(/^\/api\/mcp\/([^/]+)\/toggle$/);
  if (method === 'PATCH' && toggleMatch) {
    const name = decodeURIComponent(toggleMatch[1]);
    const config = loadConfig();
    const idx = config.servers.findIndex((s) => s.name === name);
    if (idx < 0) {
      sendJson(res, 404, { error: 'Server not found' });
      return true;
    }
    config.servers[idx].enabled = !config.servers[idx].enabled;
    saveConfig(config);
    sendJson(res, 200, { success: true, enabled: config.servers[idx].enabled });
    return true;
  }

  // DELETE /api/mcp/:name
  const deleteMatch = pathname.match(/^\/api\/mcp\/([^/]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    const name = decodeURIComponent(deleteMatch[1]);
    const config = loadConfig();
    const before = config.servers.length;
    config.servers = config.servers.filter((s) => s.name !== name);
    if (config.servers.length === before) {
      sendJson(res, 404, { error: 'Server not found' });
      return true;
    }
    saveConfig(config);
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}
