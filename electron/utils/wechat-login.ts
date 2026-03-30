import { EventEmitter } from 'events';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger';
import { normalizeOpenClawAccountId } from './channel-alias';

type WeChatQrStatus = 'pending' | 'scanned' | 'confirmed' | 'expired' | 'error';

export interface WeChatQrState {
  qrcode: string;
  qrcodeUrl: string;
  sessionKey: string;
  status: WeChatQrStatus;
  connected: boolean;
  accountId?: string;
  message?: string;
  error?: string;
}

const WECHAT_QR_TTL_MS = 5 * 60 * 1000; // 5 minutes (plugin ACTIVE_LOGIN_TTL_MS)
const WECHAT_QR_POLL_MS = 2_000;
const WECHAT_QR_SESSION_KEY = 'wechat-login';
const WECHAT_QR_BOT_TYPE = 'ipad';
const WECHAT_QR_API_BASE = 'https://ilinkai.weixin.qq.com';

type ActiveLogin = {
  qrcode: string;
  qrcodeUrl: string;
  startedAt: number;
  currentApiBaseUrl: string;
};

type WeChatQrFetchResponse = {
  qrcode?: string;
  qrcode_img_content?: string;
};

type WeChatQrStatusResponse = {
  status?: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'scaned_but_redirect';
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  redirect_host?: string;
};

type WeChatAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  userId?: string;
};

function resolveWeChatStateDir(): string {
  return join(homedir(), '.openclaw', OPENCLAW_WECHAT_CHANNEL_TYPE);
}

function resolveWeChatAccountsDir(): string {
  return join(resolveWeChatStateDir(), 'accounts');
}

function resolveWeChatAccountIndexPath(): string {
  return join(resolveWeChatStateDir(), 'accounts.json');
}

function readIndexedWeChatAccountIds(): string[] {
  try {
    const filePath = resolveWeChatAccountIndexPath();
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function registerWeChatAccountId(accountId: string): void {
  mkdirSync(resolveWeChatStateDir(), { recursive: true });
  const existing = readIndexedWeChatAccountIds();
  if (existing.includes(accountId)) return;
  writeFileSync(resolveWeChatAccountIndexPath(), JSON.stringify([...existing, accountId], null, 2), 'utf8');
}

function saveWeChatAccount(accountId: string, update: { token?: string; baseUrl?: string; userId?: string }): void {
  const dir = resolveWeChatAccountsDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${accountId}.json`);

  let existing: WeChatAccountData = {};
  try {
    if (existsSync(filePath)) {
      existing = JSON.parse(readFileSync(filePath, 'utf8')) as WeChatAccountData;
    }
  } catch {
    existing = {};
  }

  const token = update.token?.trim() || existing.token;
  const baseUrl = update.baseUrl?.trim() || existing.baseUrl;
  const userId = update.userId?.trim() || existing.userId;
  const next: WeChatAccountData = {
    ...(token ? { token, savedAt: new Date().toISOString() } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(userId ? { userId } : {}),
  };
  writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  registerWeChatAccountId(accountId);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

class WeChatLoginManager extends EventEmitter {
  private state: WeChatQrState | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeLogin: ActiveLogin | null = null;

  getState(): WeChatQrState | null {
    return this.state;
  }

  async start(): Promise<void> {
    this.stop();
    try {
      const result = await fetchJson(
        `${WECHAT_QR_API_BASE}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(WECHAT_QR_BOT_TYPE)}`,
        5_000,
      ) as WeChatQrFetchResponse;
      if (!result?.qrcode || !result?.qrcode_img_content) {
        throw new Error('Failed to fetch QR code from WeChat login endpoint');
      }
      this.activeLogin = {
        qrcode: result.qrcode,
        qrcodeUrl: result.qrcode_img_content,
        startedAt: Date.now(),
        currentApiBaseUrl: WECHAT_QR_API_BASE,
      };
      this.state = {
        qrcode: result.qrcode,
        qrcodeUrl: result.qrcode_img_content,
        sessionKey: WECHAT_QR_SESSION_KEY,
        status: 'pending',
        connected: false,
      };
      this.emit('state', this.state);
      this.schedulePoll();
      this.expiryTimer = setTimeout(() => {
        if (this.state && this.state.status === 'pending') {
          this.state = { ...this.state, status: 'expired', connected: false };
          this.emit('state', this.state);
          this.stop();
        }
      }, WECHAT_QR_TTL_MS);
    } catch (error) {
      logger.error('[WeChatLoginManager] start failed', error);
      this.state = {
        qrcode: '',
        qrcodeUrl: '',
        sessionKey: WECHAT_QR_SESSION_KEY,
        status: 'error',
        connected: false,
        error: String(error),
      };
      this.emit('state', this.state);
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.activeLogin = null;
  }

  private schedulePoll(): void {
    this.pollTimer = setTimeout(async () => {
      if (!this.state || !this.activeLogin) return;
      if (Date.now() - this.activeLogin.startedAt >= WECHAT_QR_TTL_MS) {
        this.state = { ...this.state, status: 'expired', connected: false, message: '二维码已过期，请刷新二维码。' };
        this.emit('state', this.state);
        this.stop();
        return;
      }
      try {
        const currentApiBase = this.activeLogin.currentApiBaseUrl;
        const statusResponse = await fetchJson(
          `${currentApiBase}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(this.activeLogin.qrcode)}`,
          35_000,
        ) as WeChatQrStatusResponse;
        const status = statusResponse.status ?? 'wait';

        if (status === 'scaned_but_redirect' && statusResponse.redirect_host) {
          const redirectBase = /^https?:\/\//.test(statusResponse.redirect_host)
            ? statusResponse.redirect_host
            : `https://${statusResponse.redirect_host}`;
          this.activeLogin.currentApiBaseUrl = redirectBase;
          this.state = { ...this.state, status: 'scanned', connected: false, message: '二维码已扫描，正在跳转登录节点。' };
          this.emit('state', this.state);
          this.schedulePoll();
          return;
        }

        if (status === 'confirmed' && statusResponse.bot_token && statusResponse.ilink_bot_id) {
          const normalizedId = normalizeOpenClawAccountId(statusResponse.ilink_bot_id);
          saveWeChatAccount(normalizedId, {
            token: statusResponse.bot_token,
            baseUrl: statusResponse.baseurl ?? this.activeLogin.currentApiBaseUrl,
            userId: statusResponse.ilink_user_id,
          });
          this.state = {
            ...this.state,
            status: 'confirmed',
            connected: true,
            accountId: normalizedId,
            message: '微信连接成功。',
          };
          this.emit('state', this.state);
          this.stop();
          return;
        }

        if (status === 'expired') {
          this.state = {
            ...this.state,
            status: 'expired',
            connected: false,
            message: '二维码已过期，请刷新二维码。',
          };
          this.emit('state', this.state);
          this.stop();
          return;
        }

        if (status === 'scaned') {
          this.state = {
            ...this.state,
            status: 'scanned',
            connected: false,
            message: '二维码已扫描，请在微信中确认。',
          };
          this.emit('state', this.state);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          logger.warn('[WeChatLoginManager] poll error', err);
        }
      }
      if (this.state && (this.state.status === 'pending' || this.state.status === 'scanned')) {
        this.schedulePoll();
      }
    }, WECHAT_QR_POLL_MS);
  }
}

export const weChatLoginManager = new WeChatLoginManager();
