import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from '@/pages/Settings';
import { hostApiFetch } from '@/lib/host-api';
import { useSettingsStore } from '@/stores/settings';
import { toast } from 'sonner';

const { gatewayState, updateState } = vi.hoisted(() => ({
  gatewayState: {
    status: { state: 'running', port: 18789 },
    restart: vi.fn(),
  },
  updateState: {
    currentVersion: '1.0.0',
    status: 'idle',
    updateInfo: null,
    progress: null,
    error: null,
    setAutoDownload: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    init: vi.fn(),
  },
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: () => gatewayState,
}));

vi.mock('@/stores/update', () => ({
  useUpdateStore: (selector: (state: typeof updateState) => unknown) => selector(updateState),
}));

vi.mock('@/stores/skills', () => ({
  useSkillsStore: () => ({
    skills: [],
    loading: false,
    fetchSkills: vi.fn(),
    enableSkill: vi.fn(),
    disableSkill: vi.fn(),
  }),
}));

vi.mock('@/components/settings/UpdateSettings', () => ({
  UpdateSettings: () => <div>Update Settings Mock</div>,
}));

vi.mock('@/components/settings/ProvidersSettings', () => ({
  ProvidersSettings: () => <div>Providers Settings Mock</div>,
}));

vi.mock('@/lib/api-client', () => ({
  invokeIpc: vi.fn(),
  toUserMessage: (error: unknown) => String(error),
  getGatewayWsDiagnosticEnabled: () => false,
  setGatewayWsDiagnosticEnabled: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/telemetry', () => ({
  clearUiTelemetry: vi.fn(),
  getUiTelemetrySnapshot: vi.fn(() => []),
  subscribeUiTelemetry: vi.fn(() => () => undefined),
  trackUiEvent: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Settings center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSettingsStore.getState().resetSettings();
  });

  it('renders the current grouped navigation and section shells', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getAllByText('基础').length).toBeGreaterThan(0);
    expect(screen.getAllByText('工作流').length).toBeGreaterThan(0);
    expect(screen.getAllByText('能力').length).toBeGreaterThan(0);
    expect(screen.getAllByText('治理').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /迁移与备份/ }));
    expect(screen.getByRole('button', { name: /启动迁移向导/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /记忆与知识/ }));
    expect(screen.getByRole('tab', { name: '策略配置 (Settings)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '数据浏览器 (Browser)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /反馈与开发者/ }));
    expect(screen.getByText('KTClaw Doctor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run checks' })).toBeInTheDocument();
  });

  it('persists experimental toggles through the host settings api', () => {
    const hostApiFetchMock = vi.mocked(hostApiFetch);
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /反馈与开发者/ }));

    const remoteSwitch = screen.getByRole('switch', { name: /API RPC/ });
    fireEvent.click(remoteSwitch);

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings/remoteRpcEnabled',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: true }),
      }),
    );

    const p2pSwitch = screen.getByRole('switch', { name: /P2P/ });
    fireEvent.click(p2pSwitch);

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings/p2pSyncEnabled',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: true }),
      }),
    );
  });

  it('persists route rules and tool permission editors through the host settings api', async () => {
    const hostApiFetchMock = vi.mocked(hostApiFetch);
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /通道高级配置/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ 添加路由规则/ }));
    });
    fireEvent.change(await screen.findByRole('textbox', { name: '新增路由规则' }), {
      target: { value: 'support-* -> planner-agent' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
    });

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ channelRouteRules: ['support-* -> planner-agent'] }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /工具权限/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /路径白名单/ }));
    });
    expect(await screen.findByText('新增允许访问路径')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: '新增允许访问路径' }), {
        target: { value: 'C:\\Projects\\KTClaw' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存路径' }));
    });
    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ filePathAllowlist: ['C:\\Projects\\KTClaw'] }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /编辑黑名单/ }));
    });
    expect(await screen.findByText('新增命令黑名单')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: '新增命令黑名单' }), {
        target: { value: 'rm -rf /' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存黑名单' }));
    });
    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ terminalCommandBlocklist: ['rm -rf /'] }),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ 添加工具许可/ }));
    });
    expect(await screen.findByText('新增工具许可')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: '新增工具许可' }), {
        target: { value: 'github-cli --repo anthropics/claude-code' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存许可' }));
    });
    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ customToolGrants: ['github-cli --repo anthropics/claude-code'] }),
      }),
    );

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('已添加工具许可');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ Python 解释器/ }));
    });
    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          customToolGrants: ['github-cli --repo anthropics/claude-code', 'Python 解释器'],
        }),
      }),
    );
  });

  it('keeps editor state and reports an error when route rule persistence fails', async () => {
    const hostApiFetchMock = vi.mocked(hostApiFetch);
    hostApiFetchMock.mockRejectedValueOnce(new Error('write failed'));

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /通道高级配置/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+ 添加路由规则/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '新增路由规则' }), {
      target: { value: 'ops-* -> reviewer-agent' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('保存路由规则失败');
    });
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '新增路由规则' })).toHaveValue('ops-* -> reviewer-agent');
  });

  it('persists channel advanced defaults and global risk level through the host settings api', () => {
    const hostApiFetchMock = vi.mocked(hostApiFetch);
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /通道高级配置/ }));

    const chatModeSelect = screen.getByRole('combobox', { name: '默认群聊行为模式' });
    fireEvent.change(chatModeSelect, { target: { value: 'all-listen' } });

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings/groupChatMode',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'all-listen' }),
      }),
    );

    const groupRateInput = screen.getByRole('spinbutton', { name: '群聊每分钟发言上限' });
    fireEvent.change(groupRateInput, { target: { value: '9' } });

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings/groupRate',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: '9' }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /工具权限/ }));

    const riskSelect = screen.getByRole('combobox', {
      name: '全局风险级别设定 (Global Risk Level)',
    });
    fireEvent.change(riskSelect, { target: { value: 'strict' } });

    expect(hostApiFetchMock).toHaveBeenCalledWith(
      '/api/settings/globalRiskLevel',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'strict' }),
      }),
    );
  });
});
