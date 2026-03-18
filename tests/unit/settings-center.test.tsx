import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Settings from '@/pages/Settings';

const { settingsState, gatewayState, updateState } = vi.hoisted(() => ({
  settingsState: {
    theme: 'light' as const,
    setTheme: vi.fn(),
    language: 'zh-CN',
    setLanguage: vi.fn(),
    launchAtStartup: false,
    setLaunchAtStartup: vi.fn(),
    gatewayAutoStart: true,
    setGatewayAutoStart: vi.fn(),
    proxyEnabled: false,
    proxyServer: '',
    proxyHttpServer: '',
    proxyHttpsServer: '',
    proxyAllServer: '',
    proxyBypassRules: '',
    setProxyEnabled: vi.fn(),
    setProxyServer: vi.fn(),
    setProxyHttpServer: vi.fn(),
    setProxyHttpsServer: vi.fn(),
    setProxyAllServer: vi.fn(),
    setProxyBypassRules: vi.fn(),
    autoCheckUpdate: true,
    setAutoCheckUpdate: vi.fn(),
    autoDownloadUpdate: false,
    setAutoDownloadUpdate: vi.fn(),
    devModeUnlocked: false,
    setDevModeUnlocked: vi.fn(),
    telemetryEnabled: false,
    setTelemetryEnabled: vi.fn(),
  },
  gatewayState: {
    status: { state: 'running', port: 18789 },
    restart: vi.fn(),
  },
  updateState: {
    currentVersion: '1.0.0',
    setAutoDownload: vi.fn(),
  },
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => settingsState,
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: () => gatewayState,
}));

vi.mock('@/stores/update', () => ({
  useUpdateStore: (selector: (state: typeof updateState) => unknown) => selector(updateState),
}));

vi.mock('@/components/settings/ProvidersSettings', () => ({
  ProvidersSettings: () => <div>Providers Settings Mock</div>,
}));

vi.mock('@/components/settings/UpdateSettings', () => ({
  UpdateSettings: () => <div>Update Settings Mock</div>,
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
  });

  it('renders grouped secondary navigation and the monitoring module from the approved board', () => {
    render(<Settings />);

    expect(screen.getAllByText('基础').length).toBeGreaterThan(0);
    expect(screen.getAllByText('工作流').length).toBeGreaterThan(0);
    expect(screen.getAllByText('能力').length).toBeGreaterThan(0);
    expect(screen.getAllByText('治理').length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /监控与统计/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('总预估花费')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Usage Breakdown' }));
    expect(screen.getByText(/2,845,910 Total Tokens/)).toBeInTheDocument();
    expect(screen.getByText('x-radar-collect')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Alerts & Policies' }));
    expect(screen.getByText('Quota & Billing Alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /模型与 Provider/ }));
    expect(screen.getByText('Providers Settings Mock')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /反馈与开发者/ }));
    expect(screen.getByText('Update Settings Mock')).toBeInTheDocument();
  });
});
