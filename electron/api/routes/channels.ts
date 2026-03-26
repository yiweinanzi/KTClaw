import type { IncomingMessage, ServerResponse } from 'http';
import { app } from 'electron';
import { existsSync, cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  deleteChannelConfig,
  deleteChannelAccountConfig,
  getChannelFormValues,
  listConfiguredChannels,
  saveChannelConfig,
  setChannelEnabled,
  validateChannelConfig,
  validateChannelCredentials,
} from '../../utils/channel-config';
import { assignChannelToAgent, clearAllBindingsForChannel, clearChannelBinding, listConfiguredAgentIds } from '../../utils/agent-config';
import { logger } from '../../utils/logger';
import { whatsAppLoginManager } from '../../utils/whatsapp-login';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';

const CHANNEL_RATE_LIMITS = {
  test: { max: 2, windowMs: 30_000 },
  send: { max: 8, windowMs: 10_000 },
};

type RateLimitRule = { max: number; windowMs: number };
type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const channelActionRateBuckets = new Map<string, number[]>();

function checkChannelRateLimit(
  key: string,
  rule: RateLimitRule,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - rule.windowMs;
  const existing = (channelActionRateBuckets.get(key) || []).filter((ts) => ts > windowStart);
  if (existing.length >= rule.max) {
    const retryAfterMs = Math.max(0, rule.windowMs - (now - existing[0]));
    channelActionRateBuckets.set(key, existing);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  existing.push(now);
  channelActionRateBuckets.set(key, existing);
  return { allowed: true };
}

function sendRateLimitError(res: ServerResponse, retryAfterSeconds: number): void {
  sendJson(res, 429, { success: false, error: 'Rate limit exceeded', retryAfterSeconds });
}

function scheduleGatewayChannelRestart(ctx: HostApiContext, reason: string): void {
  if (ctx.gatewayManager.getStatus().state === 'stopped') {
    return;
  }
  ctx.gatewayManager.debouncedRestart();
  void reason;
}

// Keep reload-first for feishu to avoid restart storms when channel auth/network is flaky.
// GatewayManager.reload() already falls back to restart when reload is unhealthy.
const FORCE_RESTART_CHANNELS = new Set(['dingtalk', 'wecom', 'whatsapp']);

function scheduleGatewayChannelSaveRefresh(
  ctx: HostApiContext,
  channelType: string,
  reason: string,
): void {
  if (ctx.gatewayManager.getStatus().state === 'stopped') {
    return;
  }
  if (FORCE_RESTART_CHANNELS.has(channelType)) {
    ctx.gatewayManager.debouncedRestart();
    void reason;
    return;
  }
  ctx.gatewayManager.debouncedReload();
  void reason;
}

// ── Generic plugin installer with version-aware upgrades ─────────

function readPluginVersion(pkgJsonPath: string): string | null {
  try {
    const raw = readFileSync(pkgJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function ensurePluginInstalled(
  pluginDirName: string,
  candidateSources: string[],
  pluginLabel: string,
): { installed: boolean; warning?: string } {
  const targetDir = join(homedir(), '.openclaw', 'extensions', pluginDirName);
  const targetManifest = join(targetDir, 'openclaw.plugin.json');
  const targetPkgJson = join(targetDir, 'package.json');

  const sourceDir = candidateSources.find((dir) => existsSync(join(dir, 'openclaw.plugin.json')));

  // If already installed, check whether an upgrade is available
  if (existsSync(targetManifest)) {
    if (!sourceDir) return { installed: true }; // no bundled source to compare, keep existing
    const installedVersion = readPluginVersion(targetPkgJson);
    const sourceVersion = readPluginVersion(join(sourceDir, 'package.json'));
    if (!sourceVersion || !installedVersion || sourceVersion === installedVersion) {
      return { installed: true }; // same version or unable to compare
    }
    // Version differs — fall through to overwrite install
    logger.info(
      `[plugin] Upgrading ${pluginLabel} plugin: ${installedVersion} → ${sourceVersion}`,
    );
  }

  // Fresh install or upgrade
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled ${pluginLabel} plugin mirror not found. Checked: ${candidateSources.join(' | ')}`,
    };
  }

  try {
    mkdirSync(join(homedir(), '.openclaw', 'extensions'), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(join(targetDir, 'openclaw.plugin.json'))) {
      return { installed: false, warning: `Failed to install ${pluginLabel} plugin mirror (manifest missing).` };
    }
    return { installed: true };
  } catch {
    return { installed: false, warning: `Failed to install bundled ${pluginLabel} plugin mirror` };
  }
}

// ── Per-channel plugin helpers (thin wrappers around ensurePluginInstalled) ──

function buildCandidateSources(pluginDirName: string): string[] {
  return app.isPackaged
    ? [
      join(process.resourcesPath, 'openclaw-plugins', pluginDirName),
      join(process.resourcesPath, 'app.asar.unpacked', 'build', 'openclaw-plugins', pluginDirName),
      join(process.resourcesPath, 'app.asar.unpacked', 'openclaw-plugins', pluginDirName),
    ]
    : [
      join(app.getAppPath(), 'build', 'openclaw-plugins', pluginDirName),
      join(process.cwd(), 'build', 'openclaw-plugins', pluginDirName),
      join(__dirname, '../../../build/openclaw-plugins', pluginDirName),
    ];
}

function ensureDingTalkPluginInstalled(): { installed: boolean; warning?: string } {
  return ensurePluginInstalled('dingtalk', buildCandidateSources('dingtalk'), 'DingTalk');
}

function ensureWeComPluginInstalled(): { installed: boolean; warning?: string } {
  return ensurePluginInstalled('wecom', buildCandidateSources('wecom'), 'WeCom');
}

function ensureFeishuPluginInstalled(): { installed: boolean; warning?: string } {
  return ensurePluginInstalled(
    'feishu-openclaw-plugin',
    buildCandidateSources('feishu-openclaw-plugin'),
    'Feishu',
  );
}

function ensureQQBotPluginInstalled(): { installed: boolean; warning?: string } {
  return ensurePluginInstalled('qqbot', buildCandidateSources('qqbot'), 'QQ Bot');
}

function toComparableConfig(input: Record<string, unknown>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      next[key] = value.trim();
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      next[key] = String(value);
    }
  }
  return next;
}

function isSameConfigValues(
  existing: Record<string, string> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!existing) return false;
  const next = toComparableConfig(incoming);
  const keys = new Set([...Object.keys(existing), ...Object.keys(next)]);
  if (keys.size === 0) return false;
  for (const key of keys) {
    if ((existing[key] ?? '') !== (next[key] ?? '')) {
      return false;
    }
  }
  return true;
}

function inferAgentIdFromAccountId(accountId: string): string {
  if (accountId === 'default') return 'main';
  return accountId;
}

async function ensureScopedChannelBinding(channelType: string, accountId?: string): Promise<void> {
  // Multi-agent safety: only bind when the caller explicitly scopes the account.
  // Global channel saves (no accountId) must not override routing to "main".
  if (!accountId) return;
  await assignChannelToAgent(inferAgentIdFromAccountId(accountId), channelType).catch(() => undefined);
}

async function ensureKnownScopedAccountId(accountId?: string): Promise<boolean> {
  if (!accountId || accountId === 'default') return true;
  const agentIds = await listConfiguredAgentIds().catch(() => []);
  return agentIds.includes(accountId);
}

type NormalizedChannelStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
type NormalizedChannelAction = 'connect' | 'disconnect' | 'test' | 'send' | 'configure';

type ChannelsStatusSnapshot = {
  channels?: Record<string, { running?: boolean; error?: string; lastError?: string; configured?: boolean }>;
  channelAccounts?: Record<string, Array<{
    accountId?: string;
    configured?: boolean;
    connected?: boolean;
    running?: boolean;
    linked?: boolean;
    lastError?: string;
  }>>;
  channelDefaultAccountId?: Record<string, string>;
};

type NormalizedChannelCapability = {
  channelId: string;
  channelType: string;
  accountId?: string;
  status: NormalizedChannelStatus;
  availableActions: NormalizedChannelAction[];
  capabilityFlags: {
    supportsConnect: boolean;
    supportsDisconnect: boolean;
    supportsTest: boolean;
    supportsSend: boolean;
    supportsSchemaSummary: boolean;
    supportsCredentialValidation: boolean;
  };
  configSchemaSummary: {
    totalFieldCount: number;
    requiredFieldCount: number;
    optionalFieldCount: number;
    sensitiveFieldCount: number;
    fieldKeys: string[];
  };
};

const CHANNEL_SCHEMA_SUMMARY_HINTS: Record<string, { required: string[]; optional: string[]; sensitive: string[] }> = {
  feishu: { required: ['appId', 'appSecret'], optional: [], sensitive: ['appSecret'] },
  dingtalk: {
    required: ['clientId', 'clientSecret'],
    optional: ['robotCode', 'corpId', 'agentId'],
    sensitive: ['clientSecret'],
  },
  wecom: { required: ['botId', 'secret'], optional: [], sensitive: ['secret'] },
  qqbot: { required: ['appId', 'clientSecret'], optional: [], sensitive: ['clientSecret'] },
};

const CREDENTIAL_VALIDATION_CHANNELS = new Set(['discord', 'telegram']);

function summarizeSchema(channelType: string): NormalizedChannelCapability['configSchemaSummary'] {
  const hint = CHANNEL_SCHEMA_SUMMARY_HINTS[channelType];
  if (!hint) {
    return {
      totalFieldCount: 0,
      requiredFieldCount: 0,
      optionalFieldCount: 0,
      sensitiveFieldCount: 0,
      fieldKeys: [],
    };
  }
  const fieldKeys = [...hint.required, ...hint.optional];
  return {
    totalFieldCount: fieldKeys.length,
    requiredFieldCount: hint.required.length,
    optionalFieldCount: hint.optional.length,
    sensitiveFieldCount: hint.sensitive.length,
    fieldKeys,
  };
}

function resolveNormalizedStatus(
  summary: { running?: boolean; error?: string; lastError?: string } | undefined,
  account:
    | {
      connected?: boolean;
      linked?: boolean;
      running?: boolean;
      lastError?: string;
    }
    | undefined,
): NormalizedChannelStatus {
  if (account?.connected === true || account?.linked === true) {
    return 'connected';
  }
  if (
    (typeof account?.lastError === 'string' && account.lastError.trim())
    || (typeof summary?.error === 'string' && summary.error.trim())
    || (typeof summary?.lastError === 'string' && summary.lastError.trim())
  ) {
    return 'error';
  }
  if (account?.running === true || summary?.running === true) {
    return 'connecting';
  }
  return 'disconnected';
}

function getAvailableActions(status: NormalizedChannelStatus): NormalizedChannelAction[] {
  if (status === 'connected') {
    return ['disconnect', 'test', 'send', 'configure'];
  }
  return ['connect', 'test', 'send', 'configure'];
}

function buildCapability(
  channelType: string,
  accountId: string | undefined,
  status: NormalizedChannelStatus,
): NormalizedChannelCapability {
  const availableActions = getAvailableActions(status);
  return {
    channelId: `${channelType}-${accountId || 'default'}`,
    channelType,
    accountId,
    status,
    availableActions,
    capabilityFlags: {
      supportsConnect: true,
      supportsDisconnect: true,
      supportsTest: true,
      supportsSend: true,
      supportsSchemaSummary: true,
      supportsCredentialValidation: CREDENTIAL_VALIDATION_CHANNELS.has(channelType),
    },
    configSchemaSummary: summarizeSchema(channelType),
  };
}

function resolveRequestedCapability(
  capabilities: NormalizedChannelCapability[],
  requestedChannelId: string,
): 
  | { ok: true; capability: NormalizedChannelCapability }
  | { ok: false; statusCode: 404 | 409; error: string } {
  const exactMatch = capabilities.find((capability) => capability.channelId === requestedChannelId);
  if (exactMatch) {
    return { ok: true, capability: exactMatch };
  }

  const typeMatches = capabilities.filter((capability) => capability.channelType === requestedChannelId);
  if (typeMatches.length === 0) {
    return { ok: false, statusCode: 404, error: 'Channel not found' };
  }
  if (typeMatches.length > 1) {
    return { ok: false, statusCode: 409, error: 'Channel account is ambiguous' };
  }
  return { ok: true, capability: typeMatches[0] };
}

async function listNormalizedCapabilities(ctx: HostApiContext): Promise<NormalizedChannelCapability[]> {
  const configuredChannelTypes = await listConfiguredChannels();
  let statusSnapshot: ChannelsStatusSnapshot | null = null;
  try {
    statusSnapshot = await ctx.gatewayManager.rpc<ChannelsStatusSnapshot>('channels.status', { probe: true });
  } catch {
    // Fall back to configured-channel metadata when live status is unavailable.
  }

  const capabilities: NormalizedChannelCapability[] = [];
  for (const channelType of configuredChannelTypes) {
    const accounts = statusSnapshot?.channelAccounts?.[channelType] ?? [];
    const summary = statusSnapshot?.channels?.[channelType];
    if (accounts.length > 0) {
      let pushedAnyAccount = false;
      for (const account of accounts) {
        if (account.configured === false) continue;
        pushedAnyAccount = true;
        const accountId = account.accountId || statusSnapshot?.channelDefaultAccountId?.[channelType] || 'default';
        const status = resolveNormalizedStatus(summary, account);
        capabilities.push(buildCapability(channelType, accountId, status));
      }
      if (pushedAnyAccount) {
        continue;
      }
    }
    const status = resolveNormalizedStatus(summary, undefined);
    capabilities.push(buildCapability(channelType, statusSnapshot?.channelDefaultAccountId?.[channelType], status));
  }

  return capabilities;
}

export async function handleChannelRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/channels/capabilities' && req.method === 'GET') {
    try {
      const allCapabilities = await listNormalizedCapabilities(ctx);
      const requestedChannelId = url.searchParams.get('channelId');
      const capabilities = requestedChannelId
        ? allCapabilities.filter((item) => item.channelId === requestedChannelId)
        : allCapabilities;
      sendJson(res, 200, { success: true, capabilities });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error), capabilities: [] });
    }
    return true;
  }

  if (url.pathname === '/api/channels/configured' && req.method === 'GET') {
    sendJson(res, 200, { success: true, channels: await listConfiguredChannels() });
    return true;
  }

  if (url.pathname === '/api/channels/config/validate' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ channelType: string }>(req);
      sendJson(res, 200, { success: true, ...(await validateChannelConfig(body.channelType)) });
    } catch (error) {
      sendJson(res, 500, { success: false, valid: false, errors: [String(error)], warnings: [] });
    }
    return true;
  }

  if (url.pathname === '/api/channels/credentials/validate' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ channelType: string; config: Record<string, string> }>(req);
      sendJson(res, 200, { success: true, ...(await validateChannelCredentials(body.channelType, body.config)) });
    } catch (error) {
      sendJson(res, 500, { success: false, valid: false, errors: [String(error)], warnings: [] });
    }
    return true;
  }

  if (url.pathname === '/api/channels/whatsapp/start' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ accountId: string }>(req);
      if (!(await ensureKnownScopedAccountId(body.accountId))) {
        sendJson(res, 404, { success: false, error: 'Scoped channel account not found' });
        return true;
      }
      await whatsAppLoginManager.start(body.accountId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/channels/whatsapp/cancel' && req.method === 'POST') {
    try {
      await whatsAppLoginManager.stop();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/channels/config' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ channelType: string; config: Record<string, unknown>; accountId?: string }>(req);
      if (!(await ensureKnownScopedAccountId(body.accountId))) {
        sendJson(res, 404, { success: false, error: 'Scoped channel account not found' });
        return true;
      }
      if (body.channelType === 'dingtalk') {
        const installResult = await ensureDingTalkPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || 'DingTalk plugin install failed' });
          return true;
        }
      }
      if (body.channelType === 'wecom') {
        const installResult = await ensureWeComPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || 'WeCom plugin install failed' });
          return true;
        }
      }
      if (body.channelType === 'qqbot') {
        const installResult = await ensureQQBotPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || 'QQ Bot plugin install failed' });
          return true;
        }
      }
      if (body.channelType === 'feishu') {
        const installResult = await ensureFeishuPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || 'Feishu plugin install failed' });
          return true;
        }
      }
      const existingValues = await getChannelFormValues(body.channelType, body.accountId);
      if (isSameConfigValues(existingValues, body.config)) {
        await ensureScopedChannelBinding(body.channelType, body.accountId);
        sendJson(res, 200, { success: true, noChange: true });
        return true;
      }
      await saveChannelConfig(body.channelType, body.config, body.accountId);
      await ensureScopedChannelBinding(body.channelType, body.accountId);
      scheduleGatewayChannelSaveRefresh(ctx, body.channelType, `channel:saveConfig:${body.channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/channels/config/enabled' && req.method === 'PUT') {
    try {
      const body = await parseJsonBody<{ channelType: string; enabled: boolean }>(req);
      await setChannelEnabled(body.channelType, body.enabled);
      scheduleGatewayChannelRestart(ctx, `channel:setEnabled:${body.channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/channels/config/') && req.method === 'GET') {
    try {
      const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
      const accountId = url.searchParams.get('accountId') || undefined;
      if (!(await ensureKnownScopedAccountId(accountId))) {
        sendJson(res, 404, { success: false, error: 'Scoped channel account not found' });
        return true;
      }
      sendJson(res, 200, {
        success: true,
        values: await getChannelFormValues(channelType, accountId),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/channels/config/') && req.method === 'DELETE') {
    try {
      const channelType = decodeURIComponent(url.pathname.slice('/api/channels/config/'.length));
      const accountId = url.searchParams.get('accountId') || undefined;
      if (!(await ensureKnownScopedAccountId(accountId))) {
        sendJson(res, 404, { success: false, error: 'Scoped channel account not found' });
        return true;
      }
      if (accountId) {
        await deleteChannelAccountConfig(channelType, accountId);
        await clearChannelBinding(channelType, accountId);
        scheduleGatewayChannelRestart(ctx, `channel:deleteConfig:${channelType}:${accountId}`);
      } else {
        await deleteChannelConfig(channelType);
        await clearAllBindingsForChannel(channelType);
        scheduleGatewayChannelRestart(ctx, `channel:deleteConfig:${channelType}`);
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/channels/:id/test — send a test message via the gateway
  const testMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/test$/);
  if (testMatch && req.method === 'POST') {
    const channelId = decodeURIComponent(testMatch[1]);
    try {
      const status = ctx.gatewayManager.getStatus();
      if (status.state !== 'running') {
        sendJson(res, 503, { success: false, error: 'Gateway is not running' });
        return true;
      }
      const capabilities = await listNormalizedCapabilities(ctx);
      const resolvedCapability = resolveRequestedCapability(capabilities, channelId);
      if (!resolvedCapability.ok) {
        sendJson(res, resolvedCapability.statusCode, { success: false, error: resolvedCapability.error });
        return true;
      }
      const resolvedChannelId = resolvedCapability.capability.channelId;
      const rateKey = `${resolvedChannelId}:test`;
      const rateResult = checkChannelRateLimit(rateKey, CHANNEL_RATE_LIMITS.test);
      if (!rateResult.allowed) {
        sendRateLimitError(res, rateResult.retryAfterSeconds);
        return true;
      }
      // Attempt to send a test message via the gateway HTTP API
      const port = status.port ?? 3000;
      const http = await import('node:http');
      const payload = JSON.stringify({ channelId: resolvedChannelId, text: '✅ ClawX 测试消息 — 连接正常' });
      await new Promise<void>((resolve, reject) => {
        const req2 = http.request(
          { hostname: '127.0.0.1', port, path: '/api/channel/test', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (r) => { r.resume(); r.on('end', resolve); },
        );
        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });
      sendJson(res, 200, { success: true, message: '测试消息已发送' });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/channels/:id/send — send a custom message via the gateway
  const sendMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/send$/);
  if (sendMatch && req.method === 'POST') {
    const channelId = decodeURIComponent(sendMatch[1]);
    try {
      const body = await parseJsonBody<{ text: string }>(req);
      if (!body.text?.trim()) {
        sendJson(res, 400, { success: false, error: 'text is required' });
        return true;
      }
      const status = ctx.gatewayManager.getStatus();
      if (status.state !== 'running') {
        sendJson(res, 503, { success: false, error: 'Gateway is not running' });
        return true;
      }
      const capabilities = await listNormalizedCapabilities(ctx);
      const resolvedCapability = resolveRequestedCapability(capabilities, channelId);
      if (!resolvedCapability.ok) {
        sendJson(res, resolvedCapability.statusCode, { success: false, error: resolvedCapability.error });
        return true;
      }
      const resolvedChannelId = resolvedCapability.capability.channelId;
      const rateKey = `${resolvedChannelId}:send`;
      const rateResult = checkChannelRateLimit(rateKey, CHANNEL_RATE_LIMITS.send);
      if (!rateResult.allowed) {
        sendRateLimitError(res, rateResult.retryAfterSeconds);
        return true;
      }
      const port = status.port ?? 3000;
      const http = await import('node:http');
      const payload = JSON.stringify({ channelId: resolvedChannelId, text: body.text.trim() });
      await new Promise<void>((resolve, reject) => {
        const req2 = http.request(
          { hostname: '127.0.0.1', port, path: '/api/channel/send', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (r) => { r.resume(); r.on('end', resolve); },
        );
        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });
      sendJson(res, 200, { success: true, message: '消息已发送' });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  void ctx;
  return false;
}
