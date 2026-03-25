import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeishuOnboardingWizard } from '@/components/channels/FeishuOnboardingWizard';
import { hostApiFetch } from '@/lib/host-api';

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

describe('FeishuOnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hostApiFetch).mockImplementation(async (path) => {
      if (path === '/api/feishu/status') {
        return {
          docsVersion: '2026.3.25',
          openClaw: { version: '2026.3.22', minVersion: '2026.3.2', compatible: true },
          plugin: {
            bundledVersion: '2026.3.25',
            bundledSource: 'build/openclaw-plugins/feishu-openclaw-plugin',
            installedVersion: '2026.3.25',
            installedPath: 'C:/Users/test/.openclaw/extensions/feishu-openclaw-plugin',
            recommendedVersion: '2026.3.25',
            installed: true,
            needsUpdate: false,
          },
          channel: {
            configured: true,
            accountIds: ['default'],
            pluginEnabled: true,
          },
          nextAction: 'ready',
        };
      }
      if (path === '/api/feishu/auth/start') {
        return {
          id: 'auth-session-1',
          accountId: 'default',
          appId: 'cli_123',
          brand: 'feishu',
          state: 'pending',
          verificationUriComplete: 'https://verify.example/complete',
          qrCodeDataUrl: 'data:image/png;base64,qr',
          userCode: 'user-code',
          scopeCount: 2,
          createdAt: '2026-03-25T18:00:00.000Z',
          expiresAt: '2026-03-25T18:10:00.000Z',
          message: '等待用户在飞书中确认授权。',
        };
      }
      throw new Error(`Unexpected hostApiFetch call: ${String(path)}`);
    });
  });

  it('loads status and starts user authorization from the wizard', async () => {
    render(
      <FeishuOnboardingWizard
        onClose={vi.fn()}
        onLinkExistingRobot={vi.fn()}
      />,
    );

    expect(await screen.findByText('OpenClaw 版本')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '开始飞书用户授权' }));

    await waitFor(() => {
      expect(hostApiFetch).toHaveBeenCalledWith('/api/feishu/auth/start', expect.objectContaining({ method: 'POST' }));
    });

    expect(await screen.findByText('飞书扫码授权')).toBeInTheDocument();
    expect(screen.getByText(/等待用户在飞书中确认授权/)).toBeInTheDocument();
  });
});
