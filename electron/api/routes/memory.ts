import type { IncomingMessage, ServerResponse } from 'http';
import { readFile, readdir, writeFile, stat, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

// ── Types ────────────────────────────────────────────────────────

type MemoryFileCategory = 'evergreen' | 'daily' | 'other';
type HealthSeverity = 'critical' | 'warning' | 'info' | 'ok';

interface MemoryFileInfo {
  label: string;
  path: string;
  relativePath: string;
  content: string;
  lastModified: string;
  sizeBytes: number;
  category: MemoryFileCategory;
}

interface MemoryConfig {
  memorySearch: {
    enabled: boolean;
    provider: string | null;
    model: string | null;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
      temporalDecay: { enabled: boolean; halfLifeDays: number };
      mmr: { enabled: boolean; lambda: number };
    };
    cache: { enabled: boolean; maxEntries: number };
    extraPaths: string[];
  };
  memoryFlush: { enabled: boolean; softThresholdTokens: number };
  configFound: boolean;
}

interface MemoryStatus {
  indexed: boolean;
  lastIndexed: string | null;
  totalEntries: number | null;
  vectorAvailable: boolean | null;
  embeddingProvider: string | null;
  raw: string;
}

interface MemoryStats {
  totalFiles: number;
  totalSizeBytes: number;
  dailyLogCount: number;
  evergreenCount: number;
  oldestDaily: string | null;
  newestDaily: string | null;
  dailyTimeline: Array<{ date: string; sizeBytes: number } | null>;
}

interface MemoryHealthCheck {
  id: string;
  severity: HealthSeverity;
  title: string;
  description: string;
  affectedFiles: string[] | null;
  action: string | null;
}

interface StaleDailyLogInfo {
  relativePath: string;
  label: string;
  date: string;
  ageDays: number;
  sizeBytes: number;
}

interface MemoryHealthSummary {
  score: number;
  checks: MemoryHealthCheck[];
  staleDailyLogs: StaleDailyLogInfo[];
}

// ── Workspace path ───────────────────────────────────────────────

function getWorkspaceDir(): string {
  // Try current layout first, then legacy
  const current = join(homedir(), '.openclaw', 'agents', 'main', 'workspace');
  if (existsSync(current)) return current;
  return join(homedir(), '.openclaw', 'workspace');
}

// ── Daily log helpers ────────────────────────────────────────────

const DAILY_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

function isDaily(filename: string): boolean {
  return DAILY_PATTERN.test(filename);
}

function humanizeFilename(filename: string): string {
  const name = filename.replace(/\.(md|json)$/, '');
  return name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function labelForFile(filename: string, fullPath: string, workspacePath: string): string {
  if (fullPath === join(workspacePath, 'MEMORY.md')) return 'Long-Term Memory';
  if (isDaily(filename)) {
    const dateStr = filename.replace('.md', '');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Daily Log (Today)';
    if (dateStr === yesterday) return 'Daily Log (Yesterday)';
    return `Daily Log (${dateStr})`;
  }
  return humanizeFilename(filename);
}

// ── File listing ─────────────────────────────────────────────────

async function getMemoryFiles(workspacePath: string): Promise<MemoryFileInfo[]> {
  const files: MemoryFileInfo[] = [];
  const memoryDir = join(workspacePath, 'memory');

  // 1. Root MEMORY.md
  const rootMemory = join(workspacePath, 'MEMORY.md');
  if (existsSync(rootMemory)) {
    try {
      const content = await readFile(rootMemory, 'utf-8');
      const s = await stat(rootMemory);
      files.push({
        label: 'Long-Term Memory',
        path: rootMemory,
        relativePath: 'MEMORY.md',
        content,
        lastModified: s.mtime.toISOString(),
        sizeBytes: s.size,
        category: 'evergreen',
      });
    } catch { /* skip */ }
  }

  // 2. memory/ directory
  if (existsSync(memoryDir)) {
    try {
      const entries = await readdir(memoryDir);
      for (const entry of entries) {
        if (!/\.(md|json)$/.test(entry)) continue;
        const fullPath = join(memoryDir, entry);
        try {
          const s = await stat(fullPath);
          if (!s.isFile()) continue;
          const content = await readFile(fullPath, 'utf-8');
          const category: MemoryFileCategory = isDaily(entry) ? 'daily' : 'evergreen';
          files.push({
            label: labelForFile(entry, fullPath, workspacePath),
            path: fullPath,
            relativePath: `memory/${entry}`,
            content,
            lastModified: s.mtime.toISOString(),
            sizeBytes: s.size,
            category,
          });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Sort: evergreen first, then by date descending
  files.sort((a, b) => {
    if (a.category !== b.category) {
      if (a.category === 'evergreen') return -1;
      if (b.category === 'evergreen') return 1;
    }
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });

  return files;
}

// ── Config ───────────────────────────────────────────────────────

const SEARCH_DEFAULTS: MemoryConfig['memorySearch'] = {
  enabled: false,
  provider: null,
  model: null,
  hybrid: {
    enabled: true,
    vectorWeight: 0.7,
    textWeight: 0.3,
    temporalDecay: { enabled: true, halfLifeDays: 30 },
    mmr: { enabled: true, lambda: 0.7 },
  },
  cache: { enabled: true, maxEntries: 256 },
  extraPaths: [],
};

function getMemoryConfig(workspacePath: string): MemoryConfig {
  const configPath = join(dirname(workspacePath), 'openclaw.json');
  if (!existsSync(configPath)) {
    return { memorySearch: SEARCH_DEFAULTS, memoryFlush: { enabled: false, softThresholdTokens: 80000 }, configFound: false };
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const ad = raw?.agents?.defaults ?? {};
    const ms = ad.memorySearch ?? {};
    const hybrid = ms.hybrid ?? {};
    const decay = hybrid.temporalDecay ?? {};
    const mmr = hybrid.mmr ?? {};
    const cache = ms.cache ?? {};
    const flush = ad.compaction?.memoryFlush ?? {};
    return {
      memorySearch: {
        enabled: ms.enabled ?? false,
        provider: ms.provider ?? null,
        model: ms.model ?? null,
        hybrid: {
          enabled: hybrid.enabled ?? true,
          vectorWeight: hybrid.vectorWeight ?? 0.7,
          textWeight: hybrid.textWeight ?? 0.3,
          temporalDecay: { enabled: decay.enabled ?? true, halfLifeDays: decay.halfLifeDays ?? 30 },
          mmr: { enabled: mmr.enabled ?? true, lambda: mmr.lambda ?? 0.7 },
        },
        cache: { enabled: cache.enabled ?? true, maxEntries: cache.maxEntries ?? 256 },
        extraPaths: ms.extraPaths ?? [],
      },
      memoryFlush: { enabled: flush.enabled ?? false, softThresholdTokens: flush.softThresholdTokens ?? 80000 },
      configFound: 'memorySearch' in ad,
    };
  } catch {
    return { memorySearch: SEARCH_DEFAULTS, memoryFlush: { enabled: false, softThresholdTokens: 80000 }, configFound: false };
  }
}

// ── Status ───────────────────────────────────────────────────────

function getMemoryStatus(): MemoryStatus {
  const defaults: MemoryStatus = {
    indexed: false, lastIndexed: null, totalEntries: null,
    vectorAvailable: null, embeddingProvider: null, raw: 'Memory status unavailable',
  };
  try {
    const output = execSync('openclaw memory status --deep', {
      timeout: 8000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    try {
      const data = JSON.parse(output);
      return {
        indexed: data.indexed ?? false,
        lastIndexed: data.lastIndexed ?? null,
        totalEntries: data.totalEntries ?? null,
        vectorAvailable: data.vectorAvailable ?? null,
        embeddingProvider: data.embeddingProvider ?? null,
        raw: output,
      };
    } catch {
      return { ...defaults, raw: output };
    }
  } catch {
    return defaults;
  }
}

// ── Stats ────────────────────────────────────────────────────────

function computeStats(files: MemoryFileInfo[]): MemoryStats {
  const daily = files.filter((f) => f.category === 'daily');
  const evergreen = files.filter((f) => f.category === 'evergreen');
  const dailyDates = daily
    .map((f) => { const m = basename(f.path).match(/^(\d{4}-\d{2}-\d{2})\.md$/); return m ? m[1] : null; })
    .filter((d): d is string => d !== null)
    .sort();
  const timeline: MemoryStats['dailyTimeline'] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const file = daily.find((f) => basename(f.path) === `${dateStr}.md`);
    timeline.push(file ? { date: dateStr, sizeBytes: file.sizeBytes } : null);
  }
  return {
    totalFiles: files.length,
    totalSizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
    dailyLogCount: daily.length,
    evergreenCount: evergreen.length,
    oldestDaily: dailyDates[0] ?? null,
    newestDaily: dailyDates[dailyDates.length - 1] ?? null,
    dailyTimeline: timeline,
  };
}

// ── Health ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
const SEVERITY_DEDUCTIONS: Record<Exclude<HealthSeverity, 'ok'>, number> = { critical: 20, warning: 10, info: 3 };

function computeStaleDailyLogs(files: MemoryFileInfo[], now = Date.now()): StaleDailyLogInfo[] {
  const results: StaleDailyLogInfo[] = [];
  for (const file of files) {
    if (file.category !== 'daily') continue;
    const filename = file.relativePath.split('/').pop() ?? '';
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    const ageDays = Math.floor((now - new Date(match[1] + 'T00:00:00Z').getTime()) / 86400000);
    if (ageDays < 30) continue;
    results.push({ relativePath: file.relativePath, label: file.label, date: match[1], ageDays, sizeBytes: file.sizeBytes });
  }
  return results.sort((a, b) => b.ageDays - a.ageDays);
}

function computeHealth(files: MemoryFileInfo[], config: MemoryConfig, status: MemoryStatus, stats: MemoryStats): MemoryHealthSummary {
  const checks: MemoryHealthCheck[] = [];
  const now = Date.now();

  // MEMORY.md line count
  const memMd = files.find((f) => f.relativePath === 'MEMORY.md');
  if (memMd) {
    const lines = memMd.content.split('\n').length;
    if (lines > 200) checks.push({ id: 'memory-md-lines', severity: 'critical', title: 'MEMORY.md exceeds 200 lines', description: `MEMORY.md has ${lines} lines. Lines after 200 are truncated in agent context.`, affectedFiles: ['MEMORY.md'], action: 'Split MEMORY.md into topic files and link from MEMORY.md.' });
    else if (lines > 150) checks.push({ id: 'memory-md-lines', severity: 'warning', title: 'MEMORY.md approaching 200 line limit', description: `MEMORY.md has ${lines} lines. Consider splitting less-critical sections.`, affectedFiles: ['MEMORY.md'], action: 'Move detailed sections into separate topic files.' });
  }

  // File sizes
  const critical100 = files.filter((f) => f.sizeBytes > 100 * 1024).map((f) => f.relativePath);
  const warn50 = files.filter((f) => f.sizeBytes > 50 * 1024 && f.sizeBytes <= 100 * 1024).map((f) => f.relativePath);
  if (critical100.length > 0) checks.push({ id: 'file-size', severity: 'critical', title: `${critical100.length} file(s) over 100KB`, description: 'Large memory files dilute retrieval quality.', affectedFiles: critical100, action: 'Split large files into smaller, focused topic files.' });
  else if (warn50.length > 0) checks.push({ id: 'file-size', severity: 'warning', title: `${warn50.length} file(s) over 50KB`, description: 'Files approaching the 100KB threshold.', affectedFiles: warn50, action: 'Review large files and split if they cover multiple distinct topics.' });

  // Stale daily logs
  const stale = computeStaleDailyLogs(files, now);
  if (stale.length > 0) {
    const over60 = stale.filter((s) => s.ageDays > 60);
    checks.push({ id: 'stale-daily-logs', severity: over60.length > 0 ? 'warning' : 'info', title: `${stale.length} stale daily log(s)`, description: `${over60.length} log(s) over 60 days old. Old logs add noise to search results.`, affectedFiles: stale.map((s) => s.relativePath), action: 'Review old daily logs: promote useful patterns to evergreen files, then delete stale logs.' });
  }

  // Total size
  if (stats.totalSizeBytes > 1024 * 1024) checks.push({ id: 'total-size', severity: 'critical', title: 'Total memory exceeds 1MB', description: `Total: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(1)}MB. Large stores degrade search quality.`, affectedFiles: null, action: 'Prune old daily logs and split or trim oversized files.' });
  else if (stats.totalSizeBytes > 500 * 1024) checks.push({ id: 'total-size', severity: 'warning', title: 'Total memory approaching 1MB', description: `Total: ${(stats.totalSizeBytes / 1024).toFixed(0)}KB.`, affectedFiles: null, action: 'Review and prune low-value content to stay under 500KB.' });

  // Vector search
  if (!config.memorySearch.enabled) checks.push({ id: 'vector-search-disabled', severity: 'warning', title: 'Vector search is disabled', description: 'Agents can only read MEMORY.md directly. Enable vector search for semantic search across all files.', affectedFiles: null, action: 'Enable memorySearch in openclaw.json and run "openclaw memory reindex".' });
  else if (!status.indexed) checks.push({ id: 'unindexed-vector', severity: 'critical', title: 'Vector search enabled but not indexed', description: 'Memory search is enabled but no index exists.', affectedFiles: null, action: 'Run "openclaw memory reindex" to build the search index.' });
  else if (status.lastIndexed) {
    const lastMs = new Date(status.lastIndexed).getTime();
    const modifiedAfter = files.filter((f) => new Date(f.lastModified).getTime() > lastMs);
    const hoursSince = (now - lastMs) / 3600000;
    if (modifiedAfter.length > 0 && hoursSince >= 1) checks.push({ id: 'stale-index', severity: 'warning', title: 'Search index is stale', description: `${modifiedAfter.length} file(s) modified after last index (${Math.floor(hoursSince)}h ago).`, affectedFiles: modifiedAfter.map((f) => f.relativePath), action: 'Reindex memory so agents see your latest changes.' });
  }

  // Stale evergreen
  const ninetyDaysAgo = now - 90 * 86400000;
  const staleEvergreen = files.filter((f) => f.category === 'evergreen' && new Date(f.lastModified).getTime() < ninetyDaysAgo);
  if (staleEvergreen.length > 0) checks.push({ id: 'stale-evergreen', severity: 'info', title: `${staleEvergreen.length} evergreen file(s) not updated in 90+ days`, description: 'Evergreen files may contain outdated facts.', affectedFiles: staleEvergreen.map((f) => f.relativePath), action: 'Review evergreen files for outdated information.' });

  // Config
  if (!config.configFound) checks.push({ id: 'no-config', severity: 'info', title: 'No explicit memory configuration', description: 'Using OpenClaw defaults. Add memorySearch config in openclaw.json to tune search behavior.', affectedFiles: null, action: 'Add a memorySearch section to openclaw.json.' });
  if (config.memorySearch.enabled && !config.memorySearch.hybrid.temporalDecay.enabled) checks.push({ id: 'decay-disabled', severity: 'info', title: 'Temporal decay is disabled', description: 'Without temporal decay, old daily logs rank equally with recent ones.', affectedFiles: null, action: 'Enable temporalDecay in openclaw.json.' });

  checks.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  let score = 100;
  for (const c of checks) {
    if (c.severity !== 'ok') score -= SEVERITY_DEDUCTIONS[c.severity];
  }
  score = Math.max(0, Math.min(100, score));

  return { score, checks, staleDailyLogs: stale };
}

// ── HTTP helpers ─────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── Route handler ────────────────────────────────────────────────

export async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // GET /api/memory — full dashboard response
  if (url.pathname === '/api/memory' && req.method === 'GET') {
    const workspaceDir = getWorkspaceDir();
    const files = await getMemoryFiles(workspaceDir);
    const config = getMemoryConfig(workspaceDir);
    const status = getMemoryStatus();
    const stats = computeStats(files);
    const health = computeHealth(files, config, status, stats);
    sendJson(res, 200, { files, config, status, stats, health, workspaceDir });
    return true;
  }

  // GET /api/memory/file?name=FILENAME — read single file
  if (url.pathname === '/api/memory/file' && req.method === 'GET') {
    const name = url.searchParams.get('name');
    if (!name || name.includes('..')) {
      sendJson(res, 400, { error: 'Invalid file name' });
      return true;
    }
    const workspaceDir = getWorkspaceDir();
    // Support both root files and memory/ subdirectory
    const fullPath = name.includes('/') ? join(workspaceDir, name) : join(workspaceDir, name);
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
    let body: { relativePath?: string; name?: string; content?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return true;
    }
    const relPath = body.relativePath ?? body.name;
    const { content } = body;
    if (!relPath || relPath.includes('..') || typeof content !== 'string') {
      sendJson(res, 400, { error: 'Invalid request' });
      return true;
    }
    const workspaceDir = getWorkspaceDir();
    const fullPath = join(workspaceDir, relPath);
    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return true;
  }

  // POST /api/memory/reindex — trigger reindex
  if (url.pathname === '/api/memory/reindex' && req.method === 'POST') {
    try {
      execSync('openclaw memory reindex', { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return true;
  }

  return false;
}
