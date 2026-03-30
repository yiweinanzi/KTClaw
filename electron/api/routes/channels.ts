import type { IncomingMessage, ServerResponse } from 'http';
import { app } from 'electron';
import { existsSync, cpSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
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
import {
  assignChannelToAgent,
  clearAllBindingsForChannel,
  clearChannelBinding,
  listAgentsSnapshot,
  listConfiguredAgentIds,
} from '../../utils/agent-config';
import { logger } from '../../utils/logger';
import { whatsAppLoginManager } from '../../utils/whatsapp-login';
import { weChatLoginManager } from '../../utils/wechat-login';
import { createChannelConversationBindingStore } from '../../services/channel-conversation-bindings';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { getOpenClawConfigDir } from '../../utils/paths';

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
    // Patch bare ESM relative specifiers (e.g. './accounts' → './accounts.js') so
    // Node ESM can resolve them when "type":"module" is set in package.json.
    fixBareEsmSpecifiers(join(targetDir, 'src'));
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

function ensureWeChatPluginInstalled(): { installed: boolean; warning?: string } {
  return ensurePluginInstalled('wechat', buildCandidateSources('wechat'), 'WeChat');
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
    name?: string;
    lastConnectedAt?: number | null;
    lastInboundAt?: number | null;
    lastOutboundAt?: number | null;
  }>>;
  channelDefaultAccountId?: Record<string, string>;
};

type WorkbenchSession = {
  id: string;
  channelId: string;
  channelType: string;
  sessionType: 'group' | 'private';
  title: string;
  pinned: boolean;
  syncState: 'synced' | 'connecting' | 'error' | 'disconnected';
  latestActivityAt?: string;
  previewText?: string;
  participantSummary?: string;
  visibleAgentId?: string;
};

type WorkbenchConversationMessage = {
  id: string;
  role: 'human' | 'agent' | 'tool' | 'system';
  authorName?: string;
  createdAt?: string;
  content?: string;
  toolName?: string;
  durationMs?: number;
  summary?: string;
  internal?: boolean;
  /** True when the message was sent by the workbench user (right-aligned bubble) */
  isSelf?: boolean;
};

const FEISHU_PLUGIN_ROOT = join(homedir(), '.openclaw', 'extensions', 'feishu-openclaw-plugin');
const WECHAT_PLUGIN_ROOT = join(homedir(), '.openclaw', 'extensions', 'wechat');
const channelConversationBindings = createChannelConversationBindingStore();
const TEST_FEISHU_SNAPSHOT_KEY = '__clawxTestFeishuWorkbenchSnapshot';

type FeishuConversationIdParts = {
  accountId: string;
  externalConversationId: string;
};

type WeChatConversationIdParts = {
  accountId: string;
  externalConversationId: string;
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

function normalizeWorkbenchSyncState(status: NormalizedChannelStatus): WorkbenchSession['syncState'] {
  if (status === 'connected') return 'synced';
  if (status === 'connecting') return 'connecting';
  if (status === 'error') return 'error';
  return 'disconnected';
}

function readLatestActivityAt(account: {
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastConnectedAt?: number | null;
}): string | undefined {
  const candidates = [account.lastInboundAt, account.lastOutboundAt, account.lastConnectedAt]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (candidates.length === 0) return undefined;
  return new Date(Math.max(...candidates)).toISOString();
}

function buildWorkbenchSessionId(
  channelType: string,
  accountId: string,
  externalConversationId?: string,
): string {
  if (channelType === 'wechat') {
    const conversationId = externalConversationId?.trim() || accountId;
    return `wechat:${accountId}:${conversationId}`;
  }
  return `${channelType}-${accountId}`;
}

function resolveConversationChannelType(conversationId: string): string {
  if (conversationId.includes(':')) {
    return conversationId.split(':')[0] || '';
  }
  if (conversationId.includes('-')) {
    return conversationId.split('-')[0] || '';
  }
  return conversationId;
}

function buildWorkbenchSessions(
  channelType: string,
  statusSnapshot: ChannelsStatusSnapshot | null,
): WorkbenchSession[] {
  const summary = statusSnapshot?.channels?.[channelType];
  const accounts = statusSnapshot?.channelAccounts?.[channelType] ?? [];
  const defaultAccountId = statusSnapshot?.channelDefaultAccountId?.[channelType] ?? 'default';

  const sessions = accounts
    .filter((account) => account.configured !== false)
    .map((account) => {
      const accountId = account.accountId || defaultAccountId;
      const status = resolveNormalizedStatus(summary, account);
      const latestActivityAt = readLatestActivityAt(account);
      return {
        id: buildWorkbenchSessionId(channelType, accountId),
        channelId: `${channelType}-${accountId}`,
        channelType,
        sessionType: accountId === defaultAccountId ? 'group' : 'private',
        title: account.name?.trim() || `${channelType}-${accountId}`,
        pinned: accountId === defaultAccountId,
        syncState: normalizeWorkbenchSyncState(status),
        latestActivityAt,
        participantSummary: accountId === defaultAccountId ? '已同步群聊' : '机器人私聊',
        visibleAgentId: accountId === defaultAccountId ? 'main' : accountId,
      } satisfies WorkbenchSession;
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return (Date.parse(right.latestActivityAt ?? '') || 0) - (Date.parse(left.latestActivityAt ?? '') || 0);
    });

  if (sessions.length > 0) return sessions;

  const fallbackStatus = normalizeWorkbenchSyncState(resolveNormalizedStatus(summary, undefined));
  return [
    {
      id: buildWorkbenchSessionId(channelType, defaultAccountId),
      channelId: `${channelType}-${defaultAccountId}`,
      channelType,
      sessionType: 'group',
      title: channelType,
      pinned: true,
      syncState: fallbackStatus,
      participantSummary: '等待同步会话',
      visibleAgentId: 'main',
    },
  ];
}

async function readOpenClawConfigJson(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(getOpenClawConfigDir(), 'openclaw.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fixBareEsmSpecifiers(dir: string): void {
  if (!existsSync(dir)) return;
  const bareRelative = /((?:from|import)\s+')(\.{1,2}\/[^']*?)(')/g;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (statSync(p).isDirectory()) {
      fixBareEsmSpecifiers(p);
    } else if (entry.name.endsWith('.js')) {
      const orig = readFileSync(p, 'utf-8');
      const fixed = orig.replace(bareRelative, (m, pre: string, spec: string, post: string) =>
        spec.endsWith('.js') || spec.endsWith('/') ? m : pre + spec + '.js' + post
      );
      if (fixed !== orig) writeFileSync(p, fixed, 'utf-8');
    }
  }
}

async function importFeishuPluginModule(relativePath: string): Promise<Record<string, unknown>> {
  const fullPath = join(FEISHU_PLUGIN_ROOT, relativePath);
  return import(pathToFileURL(fullPath).href) as Promise<Record<string, unknown>>;
}

async function importWeChatPluginModule(relativePath: string): Promise<Record<string, unknown>> {
  const fullPath = join(WECHAT_PLUGIN_ROOT, relativePath);
  return import(pathToFileURL(fullPath).href) as Promise<Record<string, unknown>>;
}

// Feishu plugin prepends sender open_id to message text: "ou_xxx: message"
// Strip this prefix so workbench shows clean message content.
const FEISHU_OPEN_ID_PREFIX_RE = /^(ou_[a-z0-9]+):\s*/i;
function stripFeishuSenderPrefix(text: string): { openId: string; cleaned: string } | null {
  const m = FEISHU_OPEN_ID_PREFIX_RE.exec(text);
  if (!m) return null;
  return { openId: m[1], cleaned: text.slice(m[0].length) };
}

function readInjectedFeishuWorkbenchSnapshotForTests():
  | {
    sessions: WorkbenchSession[];
    messagesByConversationId: Map<string, WorkbenchConversationMessage[]>;
  }
  | null {
  const injected = (globalThis as Record<string, unknown>)[TEST_FEISHU_SNAPSHOT_KEY];
  if (!injected || typeof injected !== 'object') {
    return null;
  }
  const row = injected as {
    sessions?: unknown;
    messagesByConversationId?: unknown;
  };
  const sessions = Array.isArray(row.sessions)
    ? row.sessions as WorkbenchSession[]
    : [];
  const messagesByConversationId = row.messagesByConversationId instanceof Map
    ? row.messagesByConversationId as Map<string, WorkbenchConversationMessage[]>
    : new Map<string, WorkbenchConversationMessage[]>();
  return { sessions, messagesByConversationId };
}

async function fetchFeishuWorkbenchSnapshot(): Promise<{
  sessions: WorkbenchSession[];
  messagesByConversationId: Map<string, WorkbenchConversationMessage[]>;
}> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    const injected = readInjectedFeishuWorkbenchSnapshotForTests();
    if (injected) {
      return injected;
    }
    return { sessions: [], messagesByConversationId: new Map() };
  }
  if (!existsSync(FEISHU_PLUGIN_ROOT)) {
    return { sessions: [], messagesByConversationId: new Map() };
  }

  const config = await readOpenClawConfigJson();
  if (!config) {
    return { sessions: [], messagesByConversationId: new Map() };
  }

  const [
    accountsModule,
    larkClientModule,
    toolClientModule,
    formatMessagesModule,
    userNameModule,
  ] = await Promise.all([
    importFeishuPluginModule('src/core/accounts.js'),
    importFeishuPluginModule('src/core/lark-client.js'),
    importFeishuPluginModule('src/core/tool-client.js'),
    importFeishuPluginModule('src/tools/oapi/im/format-messages.js'),
    importFeishuPluginModule('src/tools/oapi/im/user-name-uat.js'),
  ]);

  const getEnabledLarkAccounts = accountsModule.getEnabledLarkAccounts as ((cfg: Record<string, unknown>) => Array<Record<string, unknown>>) | undefined;
  const getLarkAccount = accountsModule.getLarkAccount as ((cfg: Record<string, unknown>, accountId?: string) => Record<string, unknown>) | undefined;
  const LarkClient = larkClientModule.LarkClient as {
    fromCfg: (cfg: Record<string, unknown>, accountId?: string) => { sdk: unknown };
  } | undefined;
  const ToolClient = toolClientModule.ToolClient as (new (params: {
    config: Record<string, unknown>;
    account: Record<string, unknown>;
    senderOpenId?: string;
    sdk: unknown;
  }) => {
    invokeByPath: <T>(toolAction: string, path: string, options?: Record<string, unknown>) => Promise<T>;
  }) | undefined;
  const formatMessageList = formatMessagesModule.formatMessageList as ((
    items: Array<Record<string, unknown>>,
    account: { accountId: string },
    log: (...args: unknown[]) => void,
    client: {
      account: { accountId: string };
      invokeByPath: <T>(toolAction: string, path: string, options?: Record<string, unknown>) => Promise<T>;
      invoke: <T>(toolAction: string, fn: (...args: unknown[]) => Promise<T>, options?: Record<string, unknown>) => Promise<T>;
    },
  ) => Promise<Array<Record<string, unknown>>>) | undefined;
  const batchResolveUserNamesAsUser = userNameModule.batchResolveUserNamesAsUser as ((params: {
    client: {
      account: { accountId: string };
      invoke: <T>(toolAction: string, fn: (...args: unknown[]) => Promise<T>, options?: Record<string, unknown>) => Promise<T>;
    };
    openIds: string[];
    log: (...args: unknown[]) => void;
  }) => Promise<Map<string, string>>) | undefined;
  const getUATUserName = userNameModule.getUATUserName as ((accountId: string, openId: string) => string | undefined) | undefined;

  if (!getEnabledLarkAccounts || !getLarkAccount || !LarkClient || !ToolClient || !formatMessageList || !batchResolveUserNamesAsUser || !getUATUserName) {
    return { sessions: [], messagesByConversationId: new Map() };
  }

  const enabledAccounts = getEnabledLarkAccounts(config);
  const sessions: WorkbenchSession[] = [];
  const messagesByConversationId = new Map<string, WorkbenchConversationMessage[]>();

  for (const enabledAccount of enabledAccounts) {
    const accountId = typeof enabledAccount.accountId === 'string' ? enabledAccount.accountId : 'default';
    const account = getLarkAccount(config, accountId);
    if (!account.configured) continue;

    const toolClient = new ToolClient({
      config,
      account,
      sdk: LarkClient.fromCfg(config, accountId).sdk,
    });

    const searchResponse = await (toolClient as unknown as {
      invoke: <T>(
        toolAction: string,
        fn: (sdk: {
          search: {
            message: {
              create: (
                payload: {
                  data: Record<string, unknown>;
                  params: Record<string, unknown>;
                },
                opts?: unknown,
              ) => Promise<T>;
            };
          };
        }, opts?: unknown) => Promise<T>,
        options?: Record<string, unknown>,
      ) => Promise<T>;
    }).invoke<{ data?: { items?: string[] } }>(
      'feishu_im_user_search_messages.default',
      (sdk, opts) => sdk.search.message.create({
        data: {
          query: '',
          start_time: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000).toString(),
          end_time: Math.floor(Date.now() / 1000).toString(),
        },
        params: {
          user_id_type: 'open_id',
          page_size: 50,
        },
      }, opts),
      { as: 'user' },
    ).catch(() => ({ data: { items: [] } }));

    const messageIds = searchResponse?.data?.items ?? [];
    if (messageIds.length === 0) continue;

    const messageQuery = messageIds.map((id) => `message_ids=${encodeURIComponent(id)}`).join('&');
    const detailsResponse = await toolClient.invokeByPath<{ data?: { items?: Array<Record<string, unknown>> } }>(
      'feishu_im_user_search_messages.default',
      `/open-apis/im/v1/messages/mget?${messageQuery}`,
      {
        method: 'GET',
        query: {
          user_id_type: 'open_id',
          card_msg_content_type: 'raw_card_content',
        },
        as: 'user',
      },
    ).catch(() => ({ data: { items: [] } }));

    const items = detailsResponse?.data?.items ?? [];
    if (items.length === 0) continue;

    const chatIds = [...new Set(items.map((item) => String(item.chat_id || '')).filter(Boolean))];
    const chatsResponse = await toolClient.invokeByPath<{ data?: { items?: Array<Record<string, unknown>> } }>(
      'feishu_im_user_search_messages.default',
      '/open-apis/im/v1/chats/batch_query',
      {
        method: 'POST',
        body: { chat_ids: chatIds },
        query: { user_id_type: 'open_id' },
        as: 'user',
      },
    ).catch(() => ({ data: { items: [] } }));

    const chatContextMap = new Map<string, { name?: string; chat_mode?: string; p2p_target_id?: string }>();
    for (const item of chatsResponse?.data?.items ?? []) {
      if (typeof item.chat_id === 'string') {
        chatContextMap.set(item.chat_id, {
          name: typeof item.name === 'string' ? item.name : undefined,
          chat_mode: typeof item.chat_mode === 'string' ? item.chat_mode : undefined,
          p2p_target_id: typeof item.p2p_target_id === 'string' ? item.p2p_target_id : undefined,
        });
      }
    }

    const p2pTargetIds = [...new Set(
      [...chatContextMap.values()]
        .map((value) => value.p2p_target_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )];
    if (p2pTargetIds.length > 0) {
      await batchResolveUserNamesAsUser({
        client: toolClient as unknown as {
          account: { accountId: string };
          invoke: <T>(toolAction: string, fn: (...args: unknown[]) => Promise<T>, options?: Record<string, unknown>) => Promise<T>;
        },
        openIds: p2pTargetIds,
        log: () => undefined,
      }).catch(() => undefined);
    }

    const formattedMessages = await formatMessageList(
      items,
      { accountId },
      () => undefined,
      toolClient as unknown as {
        account: { accountId: string };
        invokeByPath: <T>(toolAction: string, path: string, options?: Record<string, unknown>) => Promise<T>;
        invoke: <T>(toolAction: string, fn: (...args: unknown[]) => Promise<T>, options?: Record<string, unknown>) => Promise<T>;
      },
    ).catch(() => []);

    const groupedByChatId = new Map<string, Array<Record<string, unknown>>>();
    for (let index = 0; index < formattedMessages.length; index += 1) {
      const message = formattedMessages[index];
      const sourceItem = items[index];
      const chatId = typeof sourceItem?.chat_id === 'string' ? sourceItem.chat_id : '';
      if (!chatId) continue;
      const queue = groupedByChatId.get(chatId) ?? [];
      queue.push(message);
      groupedByChatId.set(chatId, queue);
    }

    for (const [chatId, chatMessages] of groupedByChatId.entries()) {
      const chatContext = chatContextMap.get(chatId);
      const isPrivate = chatContext?.chat_mode === 'p2p';
      const title = isPrivate
        ? (chatContext?.p2p_target_id ? getUATUserName(accountId, chatContext.p2p_target_id) : undefined) || chatContext?.name || chatId
        : chatContext?.name || chatId;
      const latestMessage = chatMessages[0];
      const previewText = typeof latestMessage?.content === 'string' ? latestMessage.content : undefined;
      const latestActivityAt = typeof latestMessage?.create_time === 'string'
        ? latestMessage.create_time
        : undefined;
      const conversationId = `feishu:${accountId}:${chatId}`;
      sessions.push({
        id: conversationId,
        channelId: `feishu-${accountId}`,
        channelType: 'feishu',
        sessionType: isPrivate ? 'private' : 'group',
        title,
        pinned: !isPrivate && accountId === 'default',
        syncState: 'synced',
        latestActivityAt,
        previewText,
        participantSummary: isPrivate ? '机器人私聊' : '已同步群聊',
        visibleAgentId: accountId === 'default' ? 'main' : accountId,
      });

      const visibleMessages: WorkbenchConversationMessage[] = chatMessages.map((message) => {
        const sender = (message.sender ?? {}) as Record<string, unknown>;
        const senderType = typeof sender.sender_type === 'string' ? sender.sender_type : '';
        const senderName = typeof sender.name === 'string' ? sender.name : undefined;
        return {
          id: typeof message.message_id === 'string' ? message.message_id : randomUUID(),
          role: senderType === 'bot' ? 'agent' : 'human',
          authorName: senderName ?? (senderType === 'bot' ? 'KTClaw' : '飞书用户'),
          createdAt: typeof message.create_time === 'string' ? message.create_time : undefined,
          content: typeof message.content === 'string' ? message.content : undefined,
          // Human messages from Feishu API are from external users (not the workbench user)
          ...(senderType !== 'bot' ? { isSelf: false } : {}),
        };
      });
      messagesByConversationId.set(conversationId, visibleMessages);
    }
  }

  sessions.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return (Date.parse(right.latestActivityAt ?? '') || 0) - (Date.parse(left.latestActivityAt ?? '') || 0);
  });

  return { sessions, messagesByConversationId };
}

async function sendFeishuConversationMessage(params: {
  conversationId: string;
  text: string;
  identity?: 'bot' | 'self';
}): Promise<{ messageId: string; chatId: string }> {
  const [, accountId, chatId] = params.conversationId.split(':');
  if (!accountId || !chatId) {
    throw new Error('Invalid Feishu conversation target');
  }

  const pluginModule = await importFeishuPluginModule('index.js');
  const sendMessageFeishu = pluginModule.sendMessageFeishu as ((params: {
    cfg: Record<string, unknown>;
    to: string;
    text: string;
    accountId?: string;
    identity?: 'bot' | 'self';
  }) => Promise<{ messageId: string; chatId: string }>) | undefined;
  if (!sendMessageFeishu) {
    throw new Error('Feishu outbound bridge is unavailable');
  }

  const config = await readOpenClawConfigJson();
  if (!config) {
    throw new Error('OpenClaw config not found');
  }

  return sendMessageFeishu({
    cfg: config,
    to: chatId,
    text: params.text,
    accountId,
    identity: params.identity ?? 'bot',
  });
}

function parseFeishuConversationId(conversationId: string): FeishuConversationIdParts | null {
  if (!conversationId.startsWith('feishu:')) {
    return null;
  }
  const parts = conversationId.split(':');
  if (parts.length < 3) {
    return null;
  }
  const accountId = parts[1]?.trim();
  const externalConversationId = parts.slice(2).join(':').trim();
  if (!accountId || !externalConversationId) {
    return null;
  }
  return { accountId, externalConversationId };
}

function parseWeChatConversationId(conversationId: string): WeChatConversationIdParts | null {
  if (!conversationId.startsWith('wechat:')) {
    return null;
  }
  const parts = conversationId.split(':');
  if (parts.length < 3) {
    return null;
  }
  const accountId = parts[1]?.trim();
  const externalConversationId = parts.slice(2).join(':').trim();
  if (!accountId || !externalConversationId) {
    return null;
  }
  return { accountId, externalConversationId };
}

function extractFirstStringValue(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function coerceIsoTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return coerceIsoTimestamp(asNumber);
    }
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) {
      return new Date(asDate).toISOString();
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const ts = value > 1_000_000_000_000 ? value : value * 1000;
  const asDate = new Date(ts);
  return Number.isNaN(asDate.getTime()) ? undefined : asDate.toISOString();
}

function coerceDurationMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }
  return undefined;
}

function extractRuntimeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => extractRuntimeText(item))
      .filter((item): item is string => Boolean(item))
      .join('\n')
      .trim();
    return text || undefined;
  }
  if (typeof value !== 'object' || value == null) {
    return undefined;
  }

  const row = value as Record<string, unknown>;
  const direct = extractFirstStringValue(row, ['text', 'message', 'content', 'summary', 'result']);
  if (direct) {
    return direct;
  }
  if ('content' in row) {
    return extractRuntimeText(row.content);
  }
  return undefined;
}

function normalizeRuntimeWorkbenchRole(rawRole: unknown): WorkbenchConversationMessage['role'] {
  const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  if (role === 'user' || role === 'human') return 'human';
  if (role === 'assistant' || role === 'agent' || role === 'model') return 'agent';
  if (role === 'tool' || role === 'toolresult' || role === 'tool_result') return 'tool';
  if (role === 'system') return 'system';
  return 'agent';
}

function extractHistoryItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload !== 'object' || payload == null) {
    return [];
  }
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.messages)) {
    return row.messages;
  }
  if (Array.isArray(row.history)) {
    return row.history;
  }
  return [];
}

function mapRuntimeHistoryItemToWorkbenchMessage(
  item: unknown,
  index: number,
): WorkbenchConversationMessage | null {
  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    return {
      id: `runtime-${index}`,
      role: 'agent',
      authorName: 'KTClaw',
      content: text,
    };
  }
  if (typeof item !== 'object' || item == null) {
    return null;
  }

  const row = item as Record<string, unknown>;
  const role = normalizeRuntimeWorkbenchRole(row.role);
  const rawContent = extractRuntimeText(row.content ?? row.message ?? row.text ?? row.output ?? row.result);
  // Strip Feishu sender prefix "ou_xxx: message" -> isSelf=false marks it as incoming Feishu message
  let content: string | undefined = rawContent;
  let isSelf: boolean | undefined;
  if (rawContent) {
    const stripped = stripFeishuSenderPrefix(rawContent);
    if (stripped !== null) {
      content = stripped.cleaned || undefined;
      isSelf = false;
    }
  }
  const summary = extractFirstStringValue(row, ['summary']);
  const id = extractFirstStringValue(row, ['id', 'message_id', 'toolCallId', 'tool_call_id']) ?? `runtime-${index}`;
  const toolName = extractFirstStringValue(row, ['toolName', 'tool_name', 'name']);
  const authorName = extractFirstStringValue(row, ['authorName', 'author'])
    ?? (role === 'human' ? 'Feishu User' : role === 'agent' ? 'KTClaw' : undefined);
  const createdAt = coerceIsoTimestamp(
    row.createdAt
    ?? row.create_time
    ?? row.timestamp
    ?? row.ts
    ?? row.time,
  );
  const details = typeof row.details === 'object' && row.details != null
    ? row.details as Record<string, unknown>
    : null;
  const durationMs = coerceDurationMs(
    row.durationMs
    ?? row.duration
    ?? details?.durationMs
    ?? details?.duration,
  );

  if (!content && !summary && role !== 'tool') {
    return null;
  }

  return {
    id,
    role,
    ...(authorName ? { authorName } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(content ? { content } : {}),
    ...(toolName ? { toolName } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(summary ? { summary } : {}),
    ...(isSelf !== undefined ? { isSelf } : {}),
  };
}

function mapRuntimeHistoryToWorkbenchMessages(payload: unknown): WorkbenchConversationMessage[] {
  return extractHistoryItems(payload)
    .map((item, index) => mapRuntimeHistoryItemToWorkbenchMessage(item, index))
    .filter((item): item is WorkbenchConversationMessage => item != null);
}

async function resolveFeishuBindingForConversation(
  conversationId: string,
  preferredAgentId?: string,
  options?: {
    createIfMissing?: boolean;
  },
): Promise<{ agentId: string; sessionKey: string } | null> {
  const parsedConversation = parseFeishuConversationId(conversationId);
  if (!parsedConversation) {
    return null;
  }

  const existing = await channelConversationBindings.get(
    'feishu',
    parsedConversation.accountId,
    parsedConversation.externalConversationId,
  );
  if (existing?.sessionKey) {
    return {
      agentId: existing.agentId || inferAgentIdFromAccountId(parsedConversation.accountId),
      sessionKey: existing.sessionKey,
    };
  }

  if (options?.createIfMissing === false) {
    return null;
  }

  const snapshot = await listAgentsSnapshot().catch(() => null);
  const snapshotAgents = Array.isArray(snapshot?.agents)
    ? snapshot.agents
    : [];
  const ownerFromChannel = typeof snapshot?.channelOwners?.feishu === 'string'
    ? snapshot.channelOwners.feishu.trim()
    : '';
  const defaultAgentId = typeof snapshot?.defaultAgentId === 'string'
    ? snapshot.defaultAgentId.trim()
    : '';
  const configuredAgentIds = snapshotAgents
    .map((agent) => (typeof agent?.id === 'string' ? agent.id.trim() : ''))
    .filter(Boolean);
  const fallbackAgentIds = configuredAgentIds.length > 0
    ? configuredAgentIds
    : await listConfiguredAgentIds().catch(() => []);
  const candidates = [
    ownerFromChannel,
    preferredAgentId?.trim() || '',
    inferAgentIdFromAccountId(parsedConversation.accountId),
    defaultAgentId,
    'main',
  ].filter(Boolean);
  const resolvedAgentId = candidates.find((candidate) => fallbackAgentIds.includes(candidate))
    || candidates[0]
    || 'main';
  const resolvedAgentSummary = snapshotAgents.find((agent) => {
    return typeof agent?.id === 'string' && agent.id.trim() === resolvedAgentId;
  }) as { mainSessionKey?: unknown } | undefined;
  const summaryMainSessionKey = typeof resolvedAgentSummary?.mainSessionKey === 'string'
    ? resolvedAgentSummary.mainSessionKey.trim()
    : '';
  const sessionKey = summaryMainSessionKey || `agent:${resolvedAgentId}:main`;
  const persisted = await channelConversationBindings.upsert({
    channelType: 'feishu',
    accountId: parsedConversation.accountId,
    externalConversationId: parsedConversation.externalConversationId,
    agentId: resolvedAgentId,
    sessionKey,
  });

  return {
    agentId: persisted.agentId,
    sessionKey: persisted.sessionKey,
  };
}

function buildFeishuConversationPayload(
  conversationId: string,
  discoveredConversation: WorkbenchSession | null,
  resolvedAgentId?: string,
): {
  id: string;
  title: string;
  syncState: WorkbenchSession['syncState'];
  participantSummary?: string;
  visibleAgentId?: string;
} {
  const parsedConversation = parseFeishuConversationId(conversationId);
  const fallbackTitle = parsedConversation?.externalConversationId || conversationId;
  const fallbackSummary = parsedConversation?.accountId === 'default'
    ? 'synced group chat'
    : 'synced private chat';
  const visibleAgentId = resolvedAgentId
    || discoveredConversation?.visibleAgentId
    || (parsedConversation ? inferAgentIdFromAccountId(parsedConversation.accountId) : undefined);

  return {
    id: conversationId,
    title: discoveredConversation?.title || fallbackTitle,
    syncState: discoveredConversation?.syncState || 'synced',
    participantSummary: discoveredConversation?.participantSummary || fallbackSummary,
    ...(visibleAgentId ? { visibleAgentId } : {}),
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

  if (url.pathname === '/api/channels/workbench/sessions' && req.method === 'GET') {
    try {
      const channelType = url.searchParams.get('channelType')?.trim() || '';
      if (!channelType) {
        sendJson(res, 400, { success: false, error: 'channelType is required', sessions: [] });
        return true;
      }
      if (channelType === 'feishu') {
        const liveSnapshot = await fetchFeishuWorkbenchSnapshot().catch(() => ({ sessions: [], messagesByConversationId: new Map() }));
        if (liveSnapshot.sessions.length > 0) {
          sendJson(res, 200, {
            success: true,
            sessions: liveSnapshot.sessions,
          });
          return true;
        }
      }
      const statusSnapshot = await ctx.gatewayManager.rpc<ChannelsStatusSnapshot>('channels.status', { probe: true }).catch(() => null);
      sendJson(res, 200, {
        success: true,
        sessions: buildWorkbenchSessions(channelType, statusSnapshot),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error), sessions: [] });
    }
    return true;
  }

  if (url.pathname === '/api/channels/workbench/messages' && req.method === 'GET') {
    try {
      const conversationId = url.searchParams.get('conversationId')?.trim() || '';
      if (!conversationId) {
        sendJson(res, 400, { success: false, error: 'conversationId is required', conversation: null, messages: [] });
        return true;
      }
      if (conversationId.startsWith('feishu:')) {
        const liveSnapshot = await fetchFeishuWorkbenchSnapshot().catch(() => ({ sessions: [], messagesByConversationId: new Map() }));
        const discoveredConversation = liveSnapshot.sessions.find((session) => session.id === conversationId) ?? null;
        let binding = await resolveFeishuBindingForConversation(
          conversationId,
          discoveredConversation?.visibleAgentId,
          { createIfMissing: false },
        ).catch(() => null);

        const shouldCreateBindingOnRead = Boolean(discoveredConversation);

        if (!binding && shouldCreateBindingOnRead) {
          binding = await resolveFeishuBindingForConversation(
            conversationId,
            discoveredConversation?.visibleAgentId,
            { createIfMissing: true },
          ).catch(() => null);
        }

        if (binding?.sessionKey) {
          const runtimePayload = await ctx.gatewayManager.rpc<unknown>('chat.history', {
            sessionKey: binding.sessionKey,
            limit: 200,
          }).catch(() => null);
          let runtimeMessages = runtimePayload
            ? mapRuntimeHistoryToWorkbenchMessages(runtimePayload)
            : [];

          // Bug 2 fix: if the binding's session key (agent:main:main) yielded no messages,
          // the feishu webhook may have written to the per-chat session key:
          // agent:{agentId}:feishu:group:{chatId}  or  agent:{agentId}:feishu:direct:{chatId}
          // Attempt those peer-session keys as a fallback.
          if (runtimeMessages.length === 0) {
            const { accountId: _aid, externalConversationId: chatId } = parseFeishuConversationId(conversationId) ?? {};
            const agentId = binding.agentId || 'main';
            if (chatId) {
              const fallbackKeys = [
                `agent:${agentId}:feishu:group:${chatId}`,
                `agent:${agentId}:feishu:direct:${chatId}`,
                `agent:${agentId}:feishu:channel:${chatId}`,
              ];
              for (const fallbackKey of fallbackKeys) {
                const fallbackPayload = await ctx.gatewayManager.rpc<unknown>('chat.history', {
                  sessionKey: fallbackKey,
                  limit: 200,
                }).catch(() => null);
                if (fallbackPayload) {
                  const fallbackMessages = mapRuntimeHistoryToWorkbenchMessages(fallbackPayload);
                  if (fallbackMessages.length > 0) {
                    runtimeMessages = fallbackMessages;
                    // persist the correct session key for future send operations
                    await channelConversationBindings.upsert({
                      channelType: 'feishu',
                      accountId: parseFeishuConversationId(conversationId)?.accountId ?? 'default',
                      externalConversationId: chatId,
                      agentId,
                      sessionKey: fallbackKey,
                    }).catch(() => undefined);
                    break;
                  }
                }
              }
            }
          }

          const fallbackMessages = liveSnapshot.messagesByConversationId.get(conversationId) ?? [];

          // Merge runtime messages (agent responses, tool calls) with Feishu snapshot messages
          // (user messages from Feishu API) so both sides of the conversation are visible.
          const mergedIds = new Set(runtimeMessages.map((m) => m.id));
          const uniqueSnapshotMessages = fallbackMessages.filter((m: WorkbenchConversationMessage) => !mergedIds.has(m.id));
          const merged = [...runtimeMessages, ...uniqueSnapshotMessages].sort((a, b) => {
            const ta = Date.parse(a.createdAt ?? '') || 0;
            const tb = Date.parse(b.createdAt ?? '') || 0;
            return ta - tb;
          });

          sendJson(res, 200, {
            success: true,
            conversation: buildFeishuConversationPayload(conversationId, discoveredConversation, binding.agentId),
            messages: merged.length > 0 ? merged : fallbackMessages,
          });
          return true;
        }

        if (discoveredConversation) {
          sendJson(res, 200, {
            success: true,
            conversation: buildFeishuConversationPayload(conversationId, discoveredConversation),
            messages: liveSnapshot.messagesByConversationId.get(conversationId) ?? [],
          });
          return true;
        }

        sendJson(res, 200, {
          success: true,
          conversation: null,
          messages: [],
        });
        return true;
      }
      const channelType = resolveConversationChannelType(conversationId);
      const statusSnapshot = await ctx.gatewayManager.rpc<ChannelsStatusSnapshot>('channels.status', { probe: true }).catch(() => null);
      const sessions = buildWorkbenchSessions(channelType, statusSnapshot);
      const parsedWeChatConversation = parseWeChatConversationId(conversationId);
      const conversation = sessions.find((session) => session.id === conversationId)
        ?? (
          parsedWeChatConversation
            ? sessions.find((session) => session.channelId === `wechat-${parsedWeChatConversation.accountId}`) ?? null
            : null
        );
      const fallbackConversationTitle = parsedWeChatConversation?.externalConversationId || conversationId;
      sendJson(res, 200, {
        success: true,
        conversation: conversation
          ? {
            id: conversation.id,
            title: conversation.title,
            syncState: conversation.syncState,
            participantSummary: conversation.participantSummary,
            visibleAgentId: conversation.visibleAgentId,
          }
          : (
            parsedWeChatConversation
              ? {
                id: conversationId,
                title: fallbackConversationTitle,
                syncState: 'connecting',
                participantSummary: '等待同步会话',
                visibleAgentId: 'main',
              }
              : null
          ),
        messages: [],
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error), conversation: null, messages: [] });
    }
    return true;
  }

  // Paginated messages: GET /api/channels/workbench/conversations/:id/messages?cursor=<createdAt>&limit=<n>
  const conversationMessagesMatch = /^\/api\/channels\/workbench\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
  if (conversationMessagesMatch && req.method === 'GET') {
    try {
      const conversationId = decodeURIComponent(conversationMessagesMatch[1]);
      const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
      const cursor = url.searchParams.get('cursor')?.trim() || null;

      let allMessages: Array<Record<string, unknown>> = [];
      let conversationObj: { id: string; title: string; syncState: string; participantSummary?: string; visibleAgentId?: string } | null = null;

      if (conversationId.startsWith('feishu:')) {
        const liveSnapshot = await fetchFeishuWorkbenchSnapshot().catch(() => ({ sessions: [], messagesByConversationId: new Map() }));
        const discoveredConversation = liveSnapshot.sessions.find((s) => s.id === conversationId) ?? null;
        let binding = await resolveFeishuBindingForConversation(
          conversationId,
          discoveredConversation?.visibleAgentId,
          { createIfMissing: false },
        ).catch(() => null);

        if (!binding && discoveredConversation) {
          binding = await resolveFeishuBindingForConversation(
            conversationId,
            discoveredConversation?.visibleAgentId,
            { createIfMissing: true },
          ).catch(() => null);
        }

        let workbenchMessages: WorkbenchConversationMessage[] = [];
        if (binding?.sessionKey) {
          const runtimePayload = await ctx.gatewayManager.rpc<unknown>('chat.history', {
            sessionKey: binding.sessionKey,
            limit: 500,
          }).catch(() => null);
          workbenchMessages = runtimePayload ? mapRuntimeHistoryToWorkbenchMessages(runtimePayload) : [];

          if (workbenchMessages.length === 0) {
            const { accountId: _aid, externalConversationId: chatId } = parseFeishuConversationId(conversationId) ?? {};
            const agentId = binding.agentId || 'main';
            if (chatId) {
              const peerKeys = [
                `agent:${agentId}:feishu:group:${chatId}`,
                `agent:${agentId}:feishu:direct:${chatId}`,
              ];
              for (const peerKey of peerKeys) {
                const peerPayload = await ctx.gatewayManager.rpc<unknown>('chat.history', { sessionKey: peerKey, limit: 500 }).catch(() => null);
                if (peerPayload) {
                  const peerMsgs = mapRuntimeHistoryToWorkbenchMessages(peerPayload);
                  if (peerMsgs.length > 0) { workbenchMessages = peerMsgs; break; }
                }
              }
            }
          }
        }

        if (workbenchMessages.length === 0) {
          workbenchMessages = liveSnapshot.messagesByConversationId.get(conversationId) ?? [];
        }

        allMessages = workbenchMessages as unknown as Array<Record<string, unknown>>;
        conversationObj = buildFeishuConversationPayload(conversationId, discoveredConversation, binding?.agentId);
      } else {
        const channelType = resolveConversationChannelType(conversationId);
        const statusSnap = await ctx.gatewayManager.rpc<ChannelsStatusSnapshot>('channels.status', { probe: true }).catch(() => null);
        const sessions = buildWorkbenchSessions(channelType, statusSnap);
        const parsedWeChatConversation = parseWeChatConversationId(conversationId);
        const session = sessions.find((s) => s.id === conversationId)
          ?? (
            parsedWeChatConversation
              ? sessions.find((s) => s.channelId === `wechat-${parsedWeChatConversation.accountId}`) ?? null
              : null
          );
        if (session || parsedWeChatConversation) {
          const resolvedConversationId = session?.id ?? conversationId;
          const resolvedConversationTitle = session?.title
            ?? parsedWeChatConversation?.externalConversationId
            ?? conversationId;
          conversationObj = {
            id: resolvedConversationId,
            title: resolvedConversationTitle,
            syncState: session?.syncState ?? 'connecting',
            ...(session?.participantSummary ? { participantSummary: session.participantSummary } : {}),
            ...(session?.visibleAgentId ? { visibleAgentId: session.visibleAgentId } : {}),
          };
          const agentId = session?.visibleAgentId || 'main';
          const sessionKeys = channelType === 'wechat' && parsedWeChatConversation
            ? [
              `agent:${agentId}:wechat:group:${parsedWeChatConversation.externalConversationId}`,
              `agent:${agentId}:wechat:direct:${parsedWeChatConversation.externalConversationId}`,
              `agent:${agentId}:main`,
              'agent:main:main',
            ]
            : [
              `agent:${agentId}:main`,
              'agent:main:main',
            ];
          for (const key of [...new Set(sessionKeys)]) {
            const payload = await ctx.gatewayManager.rpc<unknown>('chat.history', { sessionKey: key, limit: 500 }).catch(() => null);
            if (!payload) continue;
            const msgs = mapRuntimeHistoryToWorkbenchMessages(payload);
            const visible = msgs.filter((m) => m.role !== 'system' || !m.internal);
            if (visible.length > 0) {
              allMessages = visible as unknown as Array<Record<string, unknown>>;
              break;
            }
          }
        }
      }

      // Apply cursor-based pagination (older messages before cursor createdAt)
      const typed = allMessages as unknown as WorkbenchConversationMessage[];
      let filtered = typed;
      if (cursor) {
        const cursorMs = Date.parse(cursor);
        if (Number.isFinite(cursorMs)) {
          filtered = typed.filter((m) => {
            const ts = Date.parse(m.createdAt ?? '');
            return Number.isFinite(ts) && ts < cursorMs;
          });
        }
      }

      const page = filtered.slice(-limit);
      const hasMore = filtered.length > limit;

      sendJson(res, 200, { success: true, conversation: conversationObj, messages: page, hasMore, nextCursor: page[0]?.createdAt ?? null });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error), messages: [], hasMore: false, nextCursor: null });
    }
    return true;
  }

  // Media proxy: GET /api/channels/workbench/media?url=<encoded-url>
  // SSRF guard: only .feishu.cn and .larksuite.com origins are allowed.
  if (url.pathname === '/api/channels/workbench/media' && req.method === 'GET') {
    try {
      const rawUrl = url.searchParams.get('url')?.trim() || '';
      if (!rawUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'url parameter is required' }));
        return true;
      }

      let parsedTarget: URL;
      try {
        parsedTarget = new URL(rawUrl);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid URL' }));
        return true;
      }

      // SSRF guard — only allow Feishu / Lark CDN domains
      const allowedSuffixes = ['.feishu.cn', '.larksuite.com'];
      const hostname = parsedTarget.hostname.toLowerCase();
      const isAllowed = allowedSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
      if (!isAllowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'URL origin not allowed' }));
        return true;
      }

      // Only allow https
      if (parsedTarget.protocol !== 'https:') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Only HTTPS URLs are allowed' }));
        return true;
      }

      const { net } = await import('electron');
      const upstream = net.fetch(rawUrl);
      const upstreamRes = await upstream;

      if (!upstreamRes.ok) {
        res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Upstream error: ${upstreamRes.status}` }));
        return true;
      }

      const contentType = upstreamRes.headers.get('content-type') ?? 'application/octet-stream';
      const contentLength = upstreamRes.headers.get('content-length');
      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      };
      if (contentLength) responseHeaders['Content-Length'] = contentLength;

      res.writeHead(200, responseHeaders);
      const buffer = await upstreamRes.arrayBuffer();
      res.end(Buffer.from(buffer));
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    }
    return true;
  }

  // WeChat media proxy: GET /api/channels/workbench/wechat/media?url=<encoded-url>&accountId=<accountId>
  // WeChat CDN media is AES-128-ECB encrypted — cannot be directly proxied.
  // Must call plugin's downloadRemoteImageToTemp to decrypt to a temp file.
  if (url.pathname === '/api/channels/workbench/wechat/media' && req.method === 'GET') {
    try {
      const rawUrl = url.searchParams.get('url')?.trim() || '';
      const accountId = url.searchParams.get('accountId')?.trim() || 'default';
      if (!rawUrl) {
        sendJson(res, 400, { success: false, error: 'url parameter is required' });
        return true;
      }
      let parsedTarget: URL;
      try {
        parsedTarget = new URL(rawUrl);
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid URL' });
        return true;
      }
      // SSRF guard — only allow WeChat CDN domains
      const allowedWeChatSuffixes = ['.qpic.cn', '.weixin.qq.com', '.wx.qq.com'];
      const hostname = parsedTarget.hostname.toLowerCase();
      const isAllowed = allowedWeChatSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
      if (!isAllowed) {
        sendJson(res, 400, { success: false, error: 'URL not allowed: only WeChat CDN domains are permitted' });
        return true;
      }
      const pluginModule = await importWeChatPluginModule('index.js').catch(() => null);
      const downloadFn = pluginModule?.downloadRemoteImageToTemp as
        | ((url: string, accountId: string) => Promise<{ path: string; mimeType?: string }>) | undefined;
      if (!downloadFn) {
        sendJson(res, 503, { success: false, error: 'WeChat media download unavailable' });
        return true;
      }
      const result = await downloadFn(rawUrl, accountId);
      const fileBuffer = await readFile(result.path);
      const contentType = result.mimeType || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(fileBuffer);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
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

  if (url.pathname === '/api/channels/wechat/qr' && req.method === 'GET') {
    try {
      await weChatLoginManager.start();
      const state = weChatLoginManager.getState();
      if (!state || !state.qrcode) {
        sendJson(res, 500, { success: false, error: 'Failed to generate QR code' });
        return true;
      }
      sendJson(res, 200, {
        success: true,
        qrcode: state.qrcode,
        qrcodeUrl: state.qrcodeUrl,
        sessionKey: state.sessionKey,
        connected: state.connected,
        status: state.status,
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/channels/wechat/qr/status' && req.method === 'GET') {
    const state = weChatLoginManager.getState();
    if (!state) {
      sendJson(res, 200, { success: true, sessionKey: 'wechat-login', status: 'idle', connected: false });
      return true;
    }
    sendJson(res, 200, {
      success: true,
      sessionKey: state.sessionKey,
      status: state.status,
      connected: state.connected,
      accountId: state.accountId,
      message: state.message,
      error: state.error,
    });
    return true;
  }

  if (url.pathname === '/api/channels/wechat/cancel' && req.method === 'POST') {
    weChatLoginManager.stop();
    sendJson(res, 200, { success: true });
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
      if (body.channelType === 'wechat') {
        const installResult = ensureWeChatPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || 'WeChat plugin install failed' });
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
      const body = await parseJsonBody<{ text: string; conversationId?: string; identity?: 'bot' | 'self' }>(req);
      if (!body.text?.trim()) {
        sendJson(res, 400, { success: false, error: 'text is required' });
        return true;
      }
      // identity defaults to 'bot'; 'self' routes to user-identity send when available
      const sendIdentity: 'bot' | 'self' = body.identity === 'self' ? 'self' : 'bot';
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
      if (body.conversationId?.startsWith('feishu:')) {
        const parsedConv = parseFeishuConversationId(body.conversationId);
        const binding = await resolveFeishuBindingForConversation(
          body.conversationId,
          undefined,
          { createIfMissing: true },
        ).catch(() => null);

        // Determine the correct session key for sending.
        // If the binding resolved to the agent's main session (agent:X:main),
        // replace it with a feishu-specific session key to keep Feishu messages
        // isolated from the main Chat page.
        let sendSessionKey = binding?.sessionKey;
        if (sendSessionKey && /^agent:[^:]+:main$/.test(sendSessionKey) && parsedConv) {
          const agentId = binding?.agentId || 'main';
          const chatId = parsedConv.externalConversationId;
          sendSessionKey = `agent:${agentId}:feishu:group:${chatId}`;
          // Persist the feishu-specific session key so future reads also use it
          await channelConversationBindings.upsert({
            channelType: 'feishu',
            accountId: parsedConv.accountId,
            externalConversationId: chatId,
            agentId,
            sessionKey: sendSessionKey,
          }).catch(() => undefined);
        }

        if (sendSessionKey) {
          const result = await ctx.gatewayManager.rpc<Record<string, unknown>>('chat.send', {
            sessionKey: sendSessionKey,
            message: body.text.trim(),
            deliver: false,
            idempotencyKey: randomUUID(),
          });
          sendJson(res, 200, {
            success: true,
            runId: extractFirstStringValue(result, ['runId', 'run_id']),
            sessionKey: sendSessionKey,
          });
          return true;
        }

        const sendResult = await sendFeishuConversationMessage({
          conversationId: body.conversationId,
          text: body.text.trim(),
          identity: sendIdentity,
        });
        sendJson(res, 200, { success: true, message: '消息已发送', ...sendResult });
        return true;
      }
      if (body.conversationId?.startsWith('wechat:')) {
        // wechat:accountId:chatId
        const wechatParts = body.conversationId.split(':');
        const wechatAccountId = wechatParts[1] ?? 'default';
        const wechatChatId = (wechatParts.slice(2).join(':').trim()) || (wechatParts[1] ?? '');
        const wechatBinding = await channelConversationBindings.get({
          channelType: 'wechat', accountId: wechatAccountId, externalConversationId: wechatChatId,
        }).catch(() => null);
        const wechatSessionKey = wechatBinding?.sessionKey ?? `agent:main:wechat:group:${wechatChatId}`;
        await ctx.gatewayManager.rpc('chat.send', {
          sessionKey: wechatSessionKey,
          message: body.text.trim(),
          deliver: false,
        });
        sendJson(res, 200, { success: true, message: '消息已发送' });
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

  // GET /api/channels/workbench/members?sessionId= — return group member list for @mention popover
  // GET /api/channels/workbench/wechat/members?sessionId= — WeChat group member list
  if (url.pathname === '/api/channels/workbench/wechat/members' && req.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      sendJson(res, 400, { success: false, error: 'sessionId is required', members: [] });
      return true;
    }
    try {
      const pluginModule = await importWeChatPluginModule('index.js').catch(() => null);
      const getGroupMembers = pluginModule?.getGroupMembers as ((params: {
        cfg: Record<string, unknown>;
        chatId: string;
        accountId?: string;
      }) => Promise<Array<{ openId: string; name: string }>>) | undefined;
      if (!getGroupMembers) {
        sendJson(res, 200, { success: true, members: [] });
        return true;
      }
      const parts = sessionId.split(':');
      const accountId = parts[1] ?? 'default';
      const chatId = parts[2] ?? sessionId;
      const config = await readOpenClawConfigJson();
      if (!config) {
        sendJson(res, 200, { success: true, members: [] });
        return true;
      }
      const members = await getGroupMembers({ cfg: config, chatId, accountId });
      sendJson(res, 200, { success: true, members: Array.isArray(members) ? members : [] });
    } catch (error) {
      sendJson(res, 200, { success: true, members: [], error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/channels/workbench/members' && req.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      sendJson(res, 400, { success: false, error: 'sessionId is required', members: [] });
      return true;
    }
    try {
      const pluginModule = await importFeishuPluginModule('index.js').catch(() => null);
      const getGroupMembers = pluginModule?.getGroupMembers as ((params: {
        cfg: Record<string, unknown>;
        chatId: string;
        accountId?: string;
      }) => Promise<Array<{ openId: string; name: string }>>) | undefined;

      if (!getGroupMembers) {
        // Plugin doesn't export getGroupMembers — return empty list gracefully
        sendJson(res, 200, { success: true, members: [] });
        return true;
      }

      // sessionId format: feishu:<accountId>:<chatId>
      const parts = sessionId.split(':');
      const accountId = parts[1] ?? 'default';
      const chatId = parts[2] ?? sessionId;
      const config = await readOpenClawConfigJson();
      if (!config) {
        sendJson(res, 200, { success: true, members: [] });
        return true;
      }

      const members = await getGroupMembers({ cfg: config, chatId, accountId });
      sendJson(res, 200, { success: true, members: Array.isArray(members) ? members : [] });
    } catch (error) {
      sendJson(res, 200, { success: true, members: [], error: String(error) });
    }
    return true;
  }

  void ctx;
  return false;
}
