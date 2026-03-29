import { EventEmitter } from 'events';
import { logger } from './logger';

type WeChatQrStatus = 'pending' | 'scanned' | 'confirmed' | 'expired' | 'error';

export interface WeChatQrState {
  qrcode: string;
  qrcodeUrl: string;
  status: WeChatQrStatus;
  accountId?: string;
  error?: string;
}

const WECHAT_QR_TTL_MS = 5 * 60 * 1000; // 5 minutes (plugin ACTIVE_LOGIN_TTL_MS)
const WECHAT_QR_POLL_MS = 2_000;

class WeChatLoginManager extends EventEmitter {
  private state: WeChatQrState | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): WeChatQrState | null {
    return this.state;
  }

  async start(): Promise<void> {
    this.stop();
    try {
      const pluginModule = await this.importPlugin();
      const result = await pluginModule.startWeixinLoginWithQr?.('wechat-login', 'ipad');
      if (!result?.qrcode) {
        throw new Error('Plugin did not return a QR code');
      }
      this.state = {
        qrcode: result.qrcode,
        qrcodeUrl: result.qrcodeUrl ?? '',
        status: 'pending',
      };
      this.emit('state', this.state);
      this.schedulePoll(pluginModule);
      this.expiryTimer = setTimeout(() => {
        if (this.state && this.state.status === 'pending') {
          this.state = { ...this.state, status: 'expired' };
          this.emit('state', this.state);
          this.stop();
        }
      }, WECHAT_QR_TTL_MS);
    } catch (error) {
      logger.error('[WeChatLoginManager] start failed', error);
      this.state = { qrcode: '', qrcodeUrl: '', status: 'error', error: String(error) };
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
  }

  private schedulePoll(pluginModule: Record<string, unknown>): void {
    this.pollTimer = setTimeout(async () => {
      if (!this.state || this.state.status !== 'pending') return;
      try {
        const waitResult = await (pluginModule.waitForWeixinLogin as ((opts: { sessionKey: string; timeoutMs: number }) => Promise<{ connected: boolean; accountId?: string; userId?: string; message?: string }>))?.({ sessionKey: 'wechat-login', timeoutMs: WECHAT_QR_POLL_MS });
        if (waitResult?.connected) {
          this.state = { ...this.state, status: 'confirmed', accountId: waitResult.accountId };
          this.emit('state', this.state);
          this.stop();
          return;
        }
      } catch (err) {
        logger.warn('[WeChatLoginManager] poll error', err);
      }
      if (this.state?.status === 'pending') {
        this.schedulePoll(pluginModule);
      }
    }, WECHAT_QR_POLL_MS);
  }

  private async importPlugin(): Promise<Record<string, unknown>> {
    // Dynamically import the bundled wechat plugin (mirrors feishu importFeishuPluginModule)
    const { importWeChatPluginModule } = await import('./wechat-plugin-loader');
    return importWeChatPluginModule('index.js');
  }
}

export const weChatLoginManager = new WeChatLoginManager();
