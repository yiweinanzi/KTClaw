/**
 * Settings State Store
 * Manages application settings
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import { hostApiFetch } from '@/lib/host-api';
import { resolveSupportedLanguage } from '../../shared/language';

type Theme = 'light' | 'dark' | 'system';
type UpdateChannel = 'stable' | 'beta' | 'dev';

interface SettingsState {
  // General
  theme: Theme;
  accentColor: string;
  language: string;
  startMinimized: boolean;
  launchAtStartup: boolean;
  telemetryEnabled: boolean;

  // Gateway
  gatewayAutoStart: boolean;
  gatewayPort: number;
  proxyEnabled: boolean;
  proxyServer: string;
  proxyHttpServer: string;
  proxyHttpsServer: string;
  proxyAllServer: string;
  proxyBypassRules: string;

  // Update
  updateChannel: UpdateChannel;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;

  // UI State
  sidebarCollapsed: boolean;
  contextRailCollapsed: boolean;
  rightPanelMode: 'agent' | 'files' | null;
  devModeUnlocked: boolean;
  remoteRpcEnabled: boolean;
  p2pSyncEnabled: boolean;

  // Identity / Brand
  brandName: string;
  brandSubtitle: string;
  myName: string;

  // Model defaults
  defaultModel: string;
  contextLimit: number;

  // Appearance toggles
  showToolCalls: boolean;
  emojiAvatar: boolean;
  hideAvatarBg: boolean;
  minimizeToTray: boolean;

  // Team & Role Strategy
  autoSpawn: boolean;
  modelInherit: boolean;
  strictIsolation: boolean;

  // Channel Advanced
  groupRate: string;

  // Automation Defaults
  workerSlots: string;
  maxDailyRuns: string;
  exponentialBackoff: boolean;
  agentSelfHeal: boolean;
  suspendOnFail: boolean;
  mobileAlert: boolean;

  // Tool Permissions
  fileAcl: boolean;
  terminalAcl: boolean;
  networkAcl: boolean;

  // Setup
  setupComplete: boolean;

  // Actions
  init: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: string) => void;
  setLanguage: (language: string) => void;
  setStartMinimized: (value: boolean) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setTelemetryEnabled: (value: boolean) => void;
  setGatewayAutoStart: (value: boolean) => void;
  setGatewayPort: (port: number) => void;
  setProxyEnabled: (value: boolean) => void;
  setProxyServer: (value: string) => void;
  setProxyHttpServer: (value: string) => void;
  setProxyHttpsServer: (value: string) => void;
  setProxyAllServer: (value: string) => void;
  setProxyBypassRules: (value: string) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  setAutoCheckUpdate: (value: boolean) => void;
  setAutoDownloadUpdate: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  setContextRailCollapsed: (value: boolean) => void;
  setRightPanelMode: (mode: 'agent' | 'files' | null) => void;
  setDevModeUnlocked: (value: boolean) => void;
  setRemoteRpcEnabled: (value: boolean) => void;
  setP2pSyncEnabled: (value: boolean) => void;
  setBrandName: (value: string) => void;
  setBrandSubtitle: (value: string) => void;
  setMyName: (value: string) => void;
  setDefaultModel: (value: string) => void;
  setContextLimit: (value: number) => void;
  setShowToolCalls: (value: boolean) => void;
  setEmojiAvatar: (value: boolean) => void;
  setHideAvatarBg: (value: boolean) => void;
  setMinimizeToTray: (value: boolean) => void;
  setAutoSpawn: (value: boolean) => void;
  setModelInherit: (value: boolean) => void;
  setStrictIsolation: (value: boolean) => void;
  setGroupRate: (value: string) => void;
  setWorkerSlots: (value: string) => void;
  setMaxDailyRuns: (value: string) => void;
  setExponentialBackoff: (value: boolean) => void;
  setAgentSelfHeal: (value: boolean) => void;
  setSuspendOnFail: (value: boolean) => void;
  setMobileAlert: (value: boolean) => void;
  setFileAcl: (value: boolean) => void;
  setTerminalAcl: (value: boolean) => void;
  setNetworkAcl: (value: boolean) => void;
  markSetupComplete: () => void;
  resetSettings: () => void;
}

const defaultSettings = {
  theme: 'system' as Theme,
  accentColor: '#007aff',
  language: resolveSupportedLanguage(typeof navigator !== 'undefined' ? navigator.language : undefined),
  startMinimized: false,
  launchAtStartup: false,
  telemetryEnabled: true,
  gatewayAutoStart: true,
  gatewayPort: 18789,
  proxyEnabled: false,
  proxyServer: '',
  proxyHttpServer: '',
  proxyHttpsServer: '',
  proxyAllServer: '',
  proxyBypassRules: '<local>;localhost;127.0.0.1;::1',
  updateChannel: 'stable' as UpdateChannel,
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  sidebarCollapsed: false,
  contextRailCollapsed: true,
  rightPanelMode: null as 'agent' | 'files' | null,
  devModeUnlocked: false,
  remoteRpcEnabled: false,
  p2pSyncEnabled: false,
  setupComplete: false,
  brandName: 'KTClaw Control',
  brandSubtitle: '智能编排中枢',
  myName: 'Commander',
  defaultModel: 'claude-sonnet-4-6',
  contextLimit: 32000,
  showToolCalls: false,
  emojiAvatar: true,
  hideAvatarBg: false,
  minimizeToTray: true,
  autoSpawn: true,
  modelInherit: true,
  strictIsolation: true,
  groupRate: '5',
  workerSlots: '4',
  maxDailyRuns: '200',
  exponentialBackoff: true,
  agentSelfHeal: true,
  suspendOnFail: true,
  mobileAlert: true,
  fileAcl: true,
  terminalAcl: true,
  networkAcl: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      init: async () => {
        try {
          const settings = await hostApiFetch<Partial<typeof defaultSettings>>('/api/settings');
          const resolvedLanguage = settings.language
            ? resolveSupportedLanguage(settings.language)
            : undefined;
          set((state) => ({
            ...state,
            ...settings,
            ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
          }));
          if (resolvedLanguage) {
            i18n.changeLanguage(resolvedLanguage);
          }
        } catch {
          // Keep renderer-persisted settings as a fallback when the main
          // process store is not reachable.
        }
      },

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setLanguage: (language) => {
        const resolvedLanguage = resolveSupportedLanguage(language);
        i18n.changeLanguage(resolvedLanguage);
        set({ language: resolvedLanguage });
        void hostApiFetch('/api/settings/language', {
          method: 'PUT',
          body: JSON.stringify({ value: resolvedLanguage }),
        }).catch(() => { });
      },
      setStartMinimized: (startMinimized) => set({ startMinimized }),
      setLaunchAtStartup: (launchAtStartup) => {
        set({ launchAtStartup });
        void hostApiFetch('/api/settings/launchAtStartup', {
          method: 'PUT',
          body: JSON.stringify({ value: launchAtStartup }),
        }).catch(() => { });
      },
      setTelemetryEnabled: (telemetryEnabled) => {
        set({ telemetryEnabled });
        void hostApiFetch('/api/settings/telemetryEnabled', {
          method: 'PUT',
          body: JSON.stringify({ value: telemetryEnabled }),
        }).catch(() => { });
      },
      setGatewayAutoStart: (gatewayAutoStart) => {
        set({ gatewayAutoStart });
        void hostApiFetch('/api/settings/gatewayAutoStart', {
          method: 'PUT',
          body: JSON.stringify({ value: gatewayAutoStart }),
        }).catch(() => { });
      },
      setGatewayPort: (gatewayPort) => {
        set({ gatewayPort });
        void hostApiFetch('/api/settings/gatewayPort', {
          method: 'PUT',
          body: JSON.stringify({ value: gatewayPort }),
        }).catch(() => { });
      },
      setProxyEnabled: (proxyEnabled) => set({ proxyEnabled }),
      setProxyServer: (proxyServer) => set({ proxyServer }),
      setProxyHttpServer: (proxyHttpServer) => set({ proxyHttpServer }),
      setProxyHttpsServer: (proxyHttpsServer) => set({ proxyHttpsServer }),
      setProxyAllServer: (proxyAllServer) => set({ proxyAllServer }),
      setProxyBypassRules: (proxyBypassRules) => set({ proxyBypassRules }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setAutoCheckUpdate: (autoCheckUpdate) => set({ autoCheckUpdate }),
      setAutoDownloadUpdate: (autoDownloadUpdate) => set({ autoDownloadUpdate }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setContextRailCollapsed: (contextRailCollapsed) => set({ contextRailCollapsed }),
      setRightPanelMode: (rightPanelMode) => set({ rightPanelMode }),
      setDevModeUnlocked: (devModeUnlocked) => {
        set({ devModeUnlocked });
        void hostApiFetch('/api/settings/devModeUnlocked', {
          method: 'PUT',
          body: JSON.stringify({ value: devModeUnlocked }),
        }).catch(() => { });
      },
      setRemoteRpcEnabled: (remoteRpcEnabled) => set({ remoteRpcEnabled }),
      setP2pSyncEnabled: (p2pSyncEnabled) => set({ p2pSyncEnabled }),
      markSetupComplete: () => set({ setupComplete: true }),
      setBrandName: (brandName) => set({ brandName }),
      setBrandSubtitle: (brandSubtitle) => set({ brandSubtitle }),
      setMyName: (myName) => set({ myName }),
      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setContextLimit: (contextLimit) => set({ contextLimit }),
      setShowToolCalls: (showToolCalls) => set({ showToolCalls }),
      setEmojiAvatar: (emojiAvatar) => set({ emojiAvatar }),
      setHideAvatarBg: (hideAvatarBg) => set({ hideAvatarBg }),
      setMinimizeToTray: (minimizeToTray) => set({ minimizeToTray }),
      setAutoSpawn: (autoSpawn) => set({ autoSpawn }),
      setModelInherit: (modelInherit) => set({ modelInherit }),
      setStrictIsolation: (strictIsolation) => set({ strictIsolation }),
      setGroupRate: (groupRate) => set({ groupRate }),
      setWorkerSlots: (workerSlots) => set({ workerSlots }),
      setMaxDailyRuns: (maxDailyRuns) => set({ maxDailyRuns }),
      setExponentialBackoff: (exponentialBackoff) => set({ exponentialBackoff }),
      setAgentSelfHeal: (agentSelfHeal) => set({ agentSelfHeal }),
      setSuspendOnFail: (suspendOnFail) => set({ suspendOnFail }),
      setMobileAlert: (mobileAlert) => set({ mobileAlert }),
      setFileAcl: (fileAcl) => set({ fileAcl }),
      setTerminalAcl: (terminalAcl) => set({ terminalAcl }),
      setNetworkAcl: (networkAcl) => set({ networkAcl }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'clawx-settings',
    }
  )
);
