import type { IncomingMessage, ServerResponse } from 'http';
import { app } from 'electron';
import { existsSync, cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
import { assignChannelToAgent, clearAllBindingsForChannel, clearChannelBinding, listConfiguredAgentIds } from '../../utils/agent-config';
import { logger } from '../../utils/logger';
import { whatsAppLoginManager } from '../../utils/whatsapp-login';
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
};

const FEISHU_PLUGIN_ROOT = join(homedir(), '.openclaw', 'extensions', 'feishu-openclaw-plugin');

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
        id: `${channelType}-${accountId}`,
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
      id: `${channelType}-${defaultAccountId}`,
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

async function importFeishuPluginModule(relativePath: string): Promise<Record<string, unknown>> {
  const fullPath = join(FEISHU_PLUGIN_ROOT, relativePath);
  return import(pathToFileURL(fullPath).href) as Promise<Record<string, unknown>>;
}

async function fetchFeishuWorkbenchSnapshot(): Promise<{
  sessions: WorkbenchSession[];
  messagesByConversationId: Map<string, WorkbenchConversationMessage[]>;
}> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
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
  });
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
        const conversation = liveSnapshot.sessions.find((session) => session.id === conversationId) ?? null;
        if (conversation) {
          sendJson(res, 200, {
            success: true,
            conversation: {
              id: conversation.id,
              title: conversation.title,
              syncState: conversation.syncState,
              participantSummary: conversation.participantSummary,
              visibleAgentId: conversation.visibleAgentId,
            },
            messages: liveSnapshot.messagesByConversationId.get(conversationId) ?? [],
          });
          return true;
        }
      }
      const [channelType] = conversationId.split('-');
      const statusSnapshot = await ctx.gatewayManager.rpc<ChannelsStatusSnapshot>('channels.status', { probe: true }).catch(() => null);
      const sessions = buildWorkbenchSessions(channelType, statusSnapshot);
      const conversation = sessions.find((session) => session.id === conversationId) ?? null;
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
          : null,
        messages: [],
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error), conversation: null, messages: [] });
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
      const body = await parseJsonBody<{ text: string; conversationId?: string }>(req);
      if (!body.text?.trim()) {
        sendJson(res, 400, { success: false, error: 'text is required' });
        return true;
      }
      if (body.conversationId?.startsWith('feishu:')) {
        const result = await sendFeishuConversationMessage({
          conversationId: body.conversationId,
          text: body.text.trim(),
        });
        sendJson(res, 200, { success: true, message: '娑堟伅宸插彂閫?', ...result });
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
