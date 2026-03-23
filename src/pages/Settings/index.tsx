import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SettingsMemoryKnowledgePanel } from '@/components/settings-center/settings-memory-knowledge-panel';
import { SettingsMigrationPanel } from '@/components/settings-center/settings-migration-panel';
import { SettingsMigrationWizard } from '@/components/settings-center/settings-migration-wizard';
import { SettingsNav } from '@/components/settings-center/settings-nav';
import { SettingsSectionCard } from '@/components/settings-center/settings-section-card';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTION_META,
  type SettingsSectionId,
} from '@/components/settings-center/settings-shell-data';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { invokeIpc, toUserMessage } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';
import { cn } from '@/lib/utils';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { useSkillsStore } from '@/stores/skills';
import { useUpdateStore } from '@/stores/update';
import type { ReactNode } from 'react';

export function Settings() {
  const { t } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();
  const {
    proxyEnabled,
    proxyServer,
    proxyHttpServer,
    proxyHttpsServer,
    proxyAllServer,
    proxyBypassRules,
    setProxyEnabled,
    setProxyServer,
    setProxyHttpServer,
    setProxyHttpsServer,
    setProxyAllServer,
    setProxyBypassRules,
    autoCheckUpdate,
    setAutoCheckUpdate,
    autoDownloadUpdate,
    setAutoDownloadUpdate,
    devModeUnlocked,
    setDevModeUnlocked,
    remoteRpcEnabled,
    setRemoteRpcEnabled,
    p2pSyncEnabled,
    setP2pSyncEnabled,
    telemetryEnabled,
    setTelemetryEnabled,
  } = useSettingsStore();

  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const updateSetAutoDownload = useUpdateStore((state) => state.setAutoDownload);
  const updateStatus = useUpdateStore((state) => state.status);
  const updateInfo = useUpdateStore((state) => state.updateInfo);
  const updateProgress = useUpdateStore((state) => state.progress);
  const updateError = useUpdateStore((state) => state.error);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const downloadUpdate = useUpdateStore((state) => state.downloadUpdate);
  const installUpdate = useUpdateStore((state) => state.installUpdate);
  const initUpdate = useUpdateStore((state) => state.init);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION);
  const [proxyEnabledDraft, setProxyEnabledDraft] = useState(proxyEnabled);
  const [proxyServerDraft, setProxyServerDraft] = useState(proxyServer);
  const [proxyHttpServerDraft, setProxyHttpServerDraft] = useState(proxyHttpServer);
  const [proxyHttpsServerDraft, setProxyHttpsServerDraft] = useState(proxyHttpsServer);
  const [proxyAllServerDraft, setProxyAllServerDraft] = useState(proxyAllServer);
  const [proxyBypassRulesDraft, setProxyBypassRulesDraft] = useState(proxyBypassRules);
  const [savingProxy, setSavingProxy] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState<'diagnose' | 'fix' | null>(null);
  const [doctorSummary, setDoctorSummary] = useState('');
  const [migrationWizardOpen, setMigrationWizardOpen] = useState(false);

  useEffect(() => setProxyEnabledDraft(proxyEnabled), [proxyEnabled]);
  useEffect(() => setProxyServerDraft(proxyServer), [proxyServer]);
  useEffect(() => setProxyHttpServerDraft(proxyHttpServer), [proxyHttpServer]);
  useEffect(() => setProxyHttpsServerDraft(proxyHttpsServer), [proxyHttpsServer]);
  useEffect(() => setProxyAllServerDraft(proxyAllServer), [proxyAllServer]);
  useEffect(() => setProxyBypassRulesDraft(proxyBypassRules), [proxyBypassRules]);
  useEffect(() => {
    if (activeSection !== 'migration-backup' && migrationWizardOpen) {
      setMigrationWizardOpen(false);
    }
  }, [activeSection, migrationWizardOpen]);

  const activeMeta = SETTINGS_SECTION_META[activeSection];

  const saveProxySettings = async () => {
    setSavingProxy(true);
    try {
      const normalizedProxyServer = proxyServerDraft.trim();
      const normalizedHttpServer = proxyHttpServerDraft.trim();
      const normalizedHttpsServer = proxyHttpsServerDraft.trim();
      const normalizedAllServer = proxyAllServerDraft.trim();
      const normalizedBypassRules = proxyBypassRulesDraft.trim();

      await invokeIpc('settings:setMany', {
        proxyEnabled: proxyEnabledDraft,
        proxyServer: normalizedProxyServer,
        proxyHttpServer: normalizedHttpServer,
        proxyHttpsServer: normalizedHttpsServer,
        proxyAllServer: normalizedAllServer,
        proxyBypassRules: normalizedBypassRules,
      });

      setProxyEnabled(proxyEnabledDraft);
      setProxyServer(normalizedProxyServer);
      setProxyHttpServer(normalizedHttpServer);
      setProxyHttpsServer(normalizedHttpsServer);
      setProxyAllServer(normalizedAllServer);
      setProxyBypassRules(normalizedBypassRules);
      toast.success(t('settings:gateway.proxySaved'));
    } catch (error) {
      toast.error(`${t('settings:gateway.proxySaveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSavingProxy(false);
    }
  };

  const runDoctor = async (mode: 'diagnose' | 'fix') => {
    setDoctorRunning(mode);
    try {
      const result = await invokeIpc<{
        success: boolean;
        exitCode?: number;
        stderr?: string;
        stdout?: string;
      }>('hostapi:fetch', {
        route: '/api/app/openclaw-doctor',
        init: {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
      });
      const summary = result?.success
        ? `${mode}: success (exit=${result.exitCode ?? 0})`
        : `${mode}: failed (exit=${result?.exitCode ?? 'n/a'}) ${result?.stderr ?? ''}`;
      setDoctorSummary(summary);
      if (result?.success) {
        toast.success(
          mode === 'fix'
            ? t('settings:developer.doctorFixSucceeded')
            : t('settings:developer.doctorSucceeded'),
        );
      } else {
        toast.error(
          mode === 'fix'
            ? t('settings:developer.doctorFixFailed')
            : t('settings:developer.doctorFailed'),
        );
      }
    } catch (error) {
      setDoctorSummary(`${mode}: ${toUserMessage(error)}`);
      toast.error(toUserMessage(error));
    } finally {
      setDoctorRunning(null);
    }
  };

  return (
    <div className="h-full bg-[linear-gradient(180deg,#f3f4f6_0%,#eceff3_100%)] p-6 dark:bg-background">
      <div className="mx-auto flex h-full max-w-[1360px] overflow-hidden rounded-[32px] border border-black/[0.05] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-background">
        <SettingsNav
          groups={SETTINGS_NAV_GROUPS}
          activeItemId={activeSection}
          onChange={setActiveSection}
        />

        <main className="min-w-0 flex-1 overflow-y-auto bg-white px-[60px] py-8 dark:bg-background">
          <div className="mx-auto max-w-[780px]">
            <header className="mb-8">
              <button
                onClick={() => navigate('/')}
                className="mb-4 flex items-center gap-2 text-[13px] text-[#8e8e93] transition-colors hover:text-[#000000]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回工作台
              </button>
              <h1 className="text-[24px] font-semibold text-[#000000] dark:text-foreground">
                {activeMeta.title}{' '}
                <span className="text-[#3c3c43]">{activeMeta.kicker}</span>
              </h1>
              <p className="mt-2 text-[13px] text-[#3c3c43] dark:text-muted-foreground">
                {activeMeta.subtitle}
              </p>
            </header>

            <div className="space-y-5">
              {renderActiveSection({
                activeSection,
                gatewayStatus,
                restartGateway,
                proxyEnabledDraft,
                setProxyEnabledDraft,
                proxyServerDraft,
                setProxyServerDraft,
                proxyHttpServerDraft,
                setProxyHttpServerDraft,
                proxyHttpsServerDraft,
                setProxyHttpsServerDraft,
                proxyAllServerDraft,
                setProxyAllServerDraft,
                proxyBypassRulesDraft,
                setProxyBypassRulesDraft,
                saveProxySettings,
                savingProxy,
                currentVersion,
                autoCheckUpdate,
                setAutoCheckUpdate,
                autoDownloadUpdate,
                setAutoDownloadUpdate,
                updateSetAutoDownload,
                devModeUnlocked,
                setDevModeUnlocked,
                remoteRpcEnabled,
                setRemoteRpcEnabled,
                p2pSyncEnabled,
                setP2pSyncEnabled,
                telemetryEnabled,
                setTelemetryEnabled,
                doctorRunning,
                runDoctor,
                doctorSummary,
                openMigrationWizard: () => setMigrationWizardOpen(true),
                updateStatus,
                updateInfo,
                updateProgress,
                updateError,
                checkForUpdates,
                downloadUpdate,
                installUpdate,
                initUpdate,
                t,
              })}
            </div>
          </div>
        </main>
      </div>

      {migrationWizardOpen ? (
        <SettingsMigrationWizard open onOpenChange={setMigrationWizardOpen} />
      ) : null}
    </div>
  );
}

/* ─── renderActiveSection ─── */

type RenderSectionArgs = {
  activeSection: SettingsSectionId;
  gatewayStatus: { state: string; port?: number };
  restartGateway: () => unknown;
  proxyEnabledDraft: boolean;
  setProxyEnabledDraft: (value: boolean) => void;
  proxyServerDraft: string;
  setProxyServerDraft: (value: string) => void;
  proxyHttpServerDraft: string;
  setProxyHttpServerDraft: (value: string) => void;
  proxyHttpsServerDraft: string;
  setProxyHttpsServerDraft: (value: string) => void;
  proxyAllServerDraft: string;
  setProxyAllServerDraft: (value: string) => void;
  proxyBypassRulesDraft: string;
  setProxyBypassRulesDraft: (value: string) => void;
  saveProxySettings: () => Promise<void>;
  savingProxy: boolean;
  currentVersion: string;
  autoCheckUpdate: boolean;
  setAutoCheckUpdate: (value: boolean) => void;
  autoDownloadUpdate: boolean;
  setAutoDownloadUpdate: (value: boolean) => void;
  updateSetAutoDownload: (value: boolean) => void;
  devModeUnlocked: boolean;
  setDevModeUnlocked: (value: boolean) => void;
  remoteRpcEnabled: boolean;
  setRemoteRpcEnabled: (value: boolean) => void;
  p2pSyncEnabled: boolean;
  setP2pSyncEnabled: (value: boolean) => void;
  telemetryEnabled: boolean;
  setTelemetryEnabled: (value: boolean) => void;
  doctorRunning: 'diagnose' | 'fix' | null;
  runDoctor: (mode: 'diagnose' | 'fix') => Promise<void>;
  doctorSummary: string;
  openMigrationWizard: () => void;
  updateStatus: import('@/stores/update').UpdateStatus;
  updateInfo: import('@/stores/update').UpdateInfo | null;
  updateProgress: import('@/stores/update').ProgressInfo | null;
  updateError: string | null;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  initUpdate: () => Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function renderActiveSection(args: RenderSectionArgs) {
  switch (args.activeSection) {
    case 'general':
      return <GeneralSection />;

    case 'model-provider':
      return <ModelProviderSection gatewayStatus={args.gatewayStatus} restartGateway={args.restartGateway} />;

    case 'team-role-strategy':
      return <TeamRoleSection />;

    case 'channel-advanced':
      return <ChannelAdvancedSection />;

    case 'automation-defaults':
      return <AutomationDefaultsSection />;

    case 'memory-knowledge':
      return <SettingsMemoryKnowledgePanel />;

    case 'skills-mcp':
      return <SkillsMcpSection />;

    case 'tool-permissions':
      return <ToolPermissionsSection />;

    case 'migration-backup':
      return <SettingsMigrationPanel onLaunchWizard={args.openMigrationWizard} />;

    case 'auto-update':
      return (
        <AutoUpdateSection
          currentVersion={args.currentVersion}
          autoCheckUpdate={args.autoCheckUpdate}
          setAutoCheckUpdate={args.setAutoCheckUpdate}
          autoDownloadUpdate={args.autoDownloadUpdate}
          setAutoDownloadUpdate={args.setAutoDownloadUpdate}
          updateSetAutoDownload={args.updateSetAutoDownload}
          updateStatus={args.updateStatus}
          updateInfo={args.updateInfo}
          updateProgress={args.updateProgress}
          updateError={args.updateError}
          checkForUpdates={args.checkForUpdates}
          downloadUpdate={args.downloadUpdate}
          installUpdate={args.installUpdate}
          initUpdate={args.initUpdate}
        />
      );

    case 'feedback-developer':
      return (
        <>
          {/* Card 1: 实验室实验 */}
          <SettingsSectionCard
            title="实验室实验 (Experimental Flags)"
            description=""
          >
            <ToggleRow
              label="开发者专用模式 (Dev Mode)"
              desc="在主工作台解锁底层 WebSocket 抓包控制台与 RAW Payload 窗口。"
              checked={args.devModeUnlocked}
              onCheckedChange={args.setDevModeUnlocked}
            />
            <ToggleRow
              label="启用远程 API RPC 监听"
              desc="开启本地 18789 端口，允许本机的浏览器扩展或其他 Shell 直接使唤主控内核。 (有一定风险)"
              checked={args.remoteRpcEnabled}
              onCheckedChange={args.setRemoteRpcEnabled}
            />
            <ToggleRow
              label="启用 Tauri/Web P2P 同步 (预览)"
              desc="正在酝酿的能力测试：多机器设备组网互传 Agent 记忆。"
              checked={args.p2pSyncEnabled}
              onCheckedChange={args.setP2pSyncEnabled}
            />
          </SettingsSectionCard>

          {/* Card 2: 诊断排错与反馈系统 */}
          <SettingsSectionCard
            title="诊断排错与反馈系统"
            description=""
          >
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#f2f2f7] px-4 py-3">
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#2563eb]">KTClaw Doctor</p>
                <p className="mt-0.5 text-[12px] text-[#8e8e93]">完整分析你的环境变量、Nodejs 版本与目录权限有无隐患。</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-lg text-[12px]"
                onClick={() => void args.runDoctor('diagnose')}
                disabled={args.doctorRunning !== null}
              >
                {args.doctorRunning === 'diagnose' ? args.t('common:status.running') : 'Run checks'}
              </Button>
            </div>

            {args.doctorSummary ? (
              <p className="mb-3 text-[12px] text-[#667085]">{args.doctorSummary}</p>
            ) : null}

            <ToggleRow
              label="崩溃时自动发送匿名报告 (Telemetry)"
              desc="帮助核心社区了解运行时发生的 Electron 异常。"
              checked={args.telemetryEnabled}
              onCheckedChange={args.setTelemetryEnabled}
            />

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => void invokeIpc('shell:openExternal', 'https://github.com/anthropics/claude-code/issues')}
                className="flex-1 rounded-xl border border-dashed border-[#c6c6c8] px-3 py-2.5 text-[13px] text-[#8e8e93] transition-colors hover:border-[#8e8e93] hover:text-[#3c3c43]"
              >
                📝 提交 Issue (GitHub)
              </button>
              <button
                type="button"
                onClick={() => {
                  const info = [
                    `Platform: ${window.electron?.platform ?? navigator.platform}`,
                    `App Version: ${args.currentVersion}`,
                    `Gateway: ${args.gatewayStatus.state} (port ${args.gatewayStatus.port ?? 'n/a'})`,
                    `User Agent: ${navigator.userAgent}`,
                  ].join('\n');
                  void navigator.clipboard.writeText(info);
                }}
                className="flex-1 rounded-xl border border-dashed border-[#c6c6c8] px-3 py-2.5 text-[13px] text-[#8e8e93] transition-colors hover:border-[#8e8e93] hover:text-[#3c3c43]"
              >
                🐛 复制本机运行环境清单
              </button>
            </div>
          </SettingsSectionCard>
        </>
      );

    default:
      return null;
  }
}

/* ─── Primitive helpers ─── */

function SettingsCard({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#c6c6c8] bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[#000000]">{title}</h3>
        {headerRight}
      </div>
      <div className="divide-y divide-black/[0.04]">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  desc,
  right,
}: {
  label: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#000000]">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] text-[#8e8e93]">{desc}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#000000]">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] text-[#8e8e93]">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="py-3">
      <p className="mb-1.5 text-[13px] font-medium text-[#000000]">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac focus:ring-1 focus:ring-clawx-ac/20"
      />
    </div>
  );
}

/* ─── Section: General (07.1) ─── */

function GeneralSection() {
  const {
    theme, setTheme, accentColor, setAccentColor, language, setLanguage, launchAtStartup, setLaunchAtStartup,
    brandName, setBrandName, brandSubtitle, setBrandSubtitle, myName, setMyName,
    showToolCalls, setShowToolCalls, emojiAvatar, setEmojiAvatar,
    hideAvatarBg, setHideAvatarBg, minimizeToTray, setMinimizeToTray,
  } = useSettingsStore();

  return (
    <>
      {/* 账号与安全 */}
      <SettingsCard title="账号与安全">
        <SettingsRow
          label="手机号"
          right={<span className="text-[13px] text-[#8e8e93]">177****7838</span>}
        />
        <SettingsRow
          label="注销账号"
          desc="注销账号将删除您的账户和所有数据"
          right={
            <button
              type="button"
              className="rounded-lg border border-[#ef4444] px-3.5 py-1.5 text-[13px] text-[#ef4444] transition-colors hover:bg-[#fef2f2]"
            >
              注销
            </button>
          }
        />
      </SettingsCard>

      {/* 外观与行为 */}
      <SettingsCard title="外观与行为">
        {/* Language dropdown */}
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">界面语言</p>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238e8e93' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] text-[#8e8e93]">切换后需重启应用。</p>
        </div>

        {/* Theme mode */}
        <SettingsRow
          label="主题模式"
          desc="选择橙白浅色或 Neon Noir 深色模式。"
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'h-10 w-10 rounded-full border-2 transition-all',
                  theme === 'light' ? 'border-black/25 scale-110' : 'border-black/[0.04]',
                )}
                style={{
                  background:
                    'conic-gradient(from 90deg, #f97316 0deg 180deg, #f3f4f6 180deg 360deg)',
                }}
                title="浅色模式"
              />
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'h-10 w-10 rounded-full border-2 transition-all',
                  theme === 'dark' ? 'border-white/30 scale-110' : 'border-black/[0.04]',
                )}
                style={{
                  background:
                    'conic-gradient(from 90deg, #1c1c1e 0deg 180deg, #7c3aed 180deg 360deg)',
                }}
                title="深色模式"
              />
            </div>
          }
        />

        {/* Accent color */}
        <SettingsRow
          label="主题色"
          desc="选择主色调，影响按钮、链接、选中态等全局高亮色。"
          right={
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { color: '#007aff', label: '蓝色' },
                { color: '#10b981', label: '绿色' },
                { color: '#8b5cf6', label: '紫色' },
                { color: '#f97316', label: '橙色' },
                { color: '#ef4444', label: '红色' },
                { color: '#06b6d4', label: '青色' },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  type="button"
                  title={label}
                  onClick={() => setAccentColor(color)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all hover:scale-110',
                    accentColor === color ? 'border-black/40 scale-110' : 'border-black/[0.08]',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={accentColor || '#007aff'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border border-black/10"
                title="自定义颜色"
              />
            </div>
          }
        />

        <ToggleRow
          label="开机自启"
          desc="登录时自动启动 AutoClaw。"
          checked={launchAtStartup}
          onCheckedChange={setLaunchAtStartup}
        />
        <ToggleRow
          label="显示工具调用"
          desc="在对话消息中展示模型的工具调用详情块。"
          checked={showToolCalls}
          onCheckedChange={setShowToolCalls}
        />
        <ToggleRow
          label="仅以 Emoji 作为头像"
          desc="关闭彩色背景，仅显示 Emoji 和玻璃质感"
          checked={emojiAvatar}
          onCheckedChange={setEmojiAvatar}
        />
        <ToggleRow
          label="隐藏侧栏头像块背景"
          desc="使用全透明样式悬浮展示个人 Logo"
          checked={hideAvatarBg}
          onCheckedChange={setHideAvatarBg}
        />
        <ToggleRow
          label="关闭时隐藏到托盘"
          desc="点击顶部关闭按钮时不退出进程，维持 Cron 和通道在线"
          checked={minimizeToTray}
          onCheckedChange={setMinimizeToTray}
        />
      </SettingsCard>

      {/* 品牌与身份 */}
      <SettingsCard title="品牌与身份">
        <InputField label="工作台名称" value={brandName} onChange={setBrandName} />
        <InputField label="副标题" value={brandSubtitle} onChange={setBrandSubtitle} />
        <InputField label="我的名字指代" value={myName} onChange={setMyName} />
      </SettingsCard>

      {/* 退出登录 */}
      <div className="py-2 text-center">
        <button
          type="button"
          className="text-[13px] text-[#8e8e93] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
        >
          退出登录
        </button>
      </div>
    </>
  );
}

/* ─── Section: Model & Provider (07.2) ─── */

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (Anthropic)' },
  { value: 'claude-opus-4-6', label: 'claude-opus-4-6 (Anthropic)' },
  { value: 'gpt-4o', label: 'gpt-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini (OpenAI)' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Google)' },
  { value: 'deepseek-chat', label: 'deepseek-chat (DeepSeek)' },
];

function ModelProviderSection({
  gatewayStatus,
  restartGateway,
}: {
  gatewayStatus: { state: string; port?: number };
  restartGateway: () => unknown;
}) {
  const isConnected = gatewayStatus.state === 'running';
  const { gatewayPort, setGatewayPort, defaultModel, setDefaultModel, contextLimit, setContextLimit } = useSettingsStore();
  const [portDraft, setPortDraft] = useState(String(gatewayPort));
  const [savingPort, setSavingPort] = useState(false);

  return (
    <>
      {/* 默认路由与偏好 */}
      <SettingsCard title="默认路由与偏好">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">全局默认模型</p>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="py-3">
          <p className="mb-3 text-[13px] font-medium text-[#000000]">对话上下文压缩阈值</p>
          <input
            type="range"
            min={8000}
            max={128000}
            step={1000}
            value={contextLimit}
            onChange={(e) => setContextLimit(Number(e.target.value))}
            className="w-full" style={{ accentColor: 'var(--ac)' }}
          />
          <div className="mt-1 text-right text-[12px] text-[#8e8e93]">
            {contextLimit.toLocaleString()} Tokens
          </div>
        </div>
      </SettingsCard>

      {/* 云端服务商配置 */}
      <ProvidersSettings />

      {/* Gateway 配置 */}
      <section className="rounded-xl border border-[#c6c6c8] bg-white px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[#000000]">Gateway 配置</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                isConnected ? 'bg-[#dcfce7] text-[#059669]' : 'text-[#ef4444]',
              )}
            >
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
              onClick={() => restartGateway()}
            >
              重新连接
            </button>
            <button
              type="button"
              className="rounded-md bg-[#ef4444] px-2.5 py-1 text-[12px] text-white transition-colors hover:bg-[#dc2626]"
            >
              重置连接
            </button>
            <button
              type="button"
              className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
            >
              诊断
            </button>
          </div>
        </div>
        <div className="divide-y divide-black/[0.04]">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-[#000000]">端口 (Port)</p>
              <p className="mt-0.5 text-[12px] text-[#8e8e93]">
                修改端口后 Gateway 将自动重启，请确保目标端口未被其他程序占用。
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value)}
                className="w-[100px] rounded-lg border border-black/10 bg-[#f9f9f9] px-3 py-1.5 font-mono text-[12px] text-[#3c3c43] outline-none focus:border-clawx-ac focus:bg-white"
              />
              <button
                type="button"
                disabled={savingPort || portDraft === String(gatewayPort)}
                onClick={async () => {
                  const p = parseInt(portDraft, 10);
                  if (!p || p < 1024 || p > 65535) return;
                  setSavingPort(true);
                  setGatewayPort(p);
                  setSavingPort(false);
                }}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7] disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 自定义模型 */}
      <SettingsCard
        title="自定义模型 (Custom Models)"
        headerRight={
          <button
            type="button"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
          >
            + 添加自定义模型
          </button>
        }
      >
        <div className="rounded-lg border border-dashed border-black/10 py-8 text-center text-[13px] text-[#8e8e93]">
          暂无自定义模型 (No custom model)
        </div>
      </SettingsCard>

      {/* Connection tips */}
      <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-5 py-4 text-[13px]">
        <p className="mb-2 font-semibold text-[#1d4ed8]">连接异常时，可按以下方式尝试修复：</p>
        <ol className="space-y-1.5 text-[#1e40af]">
          <li>
            1. <strong>重新连接</strong> —
            主动断开并重连 WebSocket，适用于网络短暂抖动后的快速恢复。
          </li>
          <li>
            2. <strong>重置连接</strong> —
            清除本地缓存的 Gateway Token 并重新握手认证，适用于 Token 不匹配报错。
          </li>
          <li>
            3. <strong>诊断</strong> — 运行{' '}
            <code className="rounded bg-[#dbeafe] px-1 font-mono text-[12px]">
              openclaw doctor --json
            </code>{' '}
            检查环境变量、端口占用和权限。
          </li>
        </ol>
      </div>
    </>
  );
}

/* ─── Section: Team & Role Strategy (08.1) ─── */

function TeamRoleSection() {
  const { autoSpawn, setAutoSpawn, modelInherit, setModelInherit, strictIsolation, setStrictIsolation } = useSettingsStore();

  return (
    <>
      {/* 组织运行模板 */}
      <SettingsCard title="组织运行模板">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">当前默认架构方案</p>
          <select className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac">
            <option>三省六部制（主脑调度，专业分身执行）</option>
            <option>单脑独立（主脑全权处理所有任务）</option>
            <option>扁平协作（所有 Agent 平级并行）</option>
          </select>
          <p className="mt-2 text-[12px] text-[#8e8e93]">
            在"团队 Map"面板中直观可视化当前激活的子智能体。
          </p>
        </div>
      </SettingsCard>

      {/* 派生规则 */}
      <SettingsCard title="派生规则">
        <ToggleRow
          label="允许运行时自动生成新角色"
          desc="主脑判断人手不够时，无需弹窗确认即可启动全新人设的分身。"
          checked={autoSpawn}
          onCheckedChange={setAutoSpawn}
        />
        <ToggleRow
          label="默认模型继承"
          desc="所有派生出的子 Agent 默认沿用主脑的 Providers 配置，禁止单独越权发起私有计费模型调用。"
          checked={modelInherit}
          onCheckedChange={setModelInherit}
        />
      </SettingsCard>

      {/* 隔离与共享 */}
      <SettingsCard title="隔离与共享">
        <ToggleRow
          label="严格显式传参（隔离态）"
          desc="子 Agent 看不到主对话，只能看到派发给它的任务参数，保证 Token 高效且防串线。"
          checked={strictIsolation}
          onCheckedChange={setStrictIsolation}
        />
      </SettingsCard>
    </>
  );
}

/* ─── Section: Channel Advanced Config (08.2) ─── */

function ChannelAdvancedSection() {
  const { groupRate, setGroupRate } = useSettingsStore();

  return (
    <>
      {/* 群聊发言默认策略 */}
      <SettingsCard title="群聊发言默认策略">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">默认群聊行为模式</p>
          <select className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac">
            <option>@触发（仅被 @ 时回复）</option>
            <option>全量监听（所有消息都响应）</option>
            <option>静默（不主动发言）</option>
          </select>
        </div>
      </SettingsCard>

      {/* 路由分发矩阵 */}
      <SettingsCard title="路由分发矩阵">
        <div className="py-6 text-center text-[13px] text-[#8e8e93]">
          暂无路由规则，请先在「频道」页面配置频道后添加
        </div>
        <div className="py-2">
          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-black/10 py-2 text-[13px] text-[#8e8e93] transition-colors hover:bg-[#f2f2f7]"
          >
            + 添加路由规则
          </button>
        </div>
      </SettingsCard>

      {/* 风控防骚扰 */}
      <SettingsCard title="风控防骚扰">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">群聊每分钟发言上限</p>
          <input
            type="number"
            value={groupRate}
            onChange={(e) => setGroupRate(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
          />
          <p className="mt-1.5 text-[12px] text-[#8e8e93]">超出后进入 5 分钟的静默冷却。</p>
        </div>
      </SettingsCard>
    </>
  );
}

/* ─── Section: Automation Defaults (08.3) ─── */

function AutomationDefaultsSection() {
  const {
    workerSlots, setWorkerSlots, maxDailyRuns, setMaxDailyRuns,
    exponentialBackoff, setExponentialBackoff, agentSelfHeal, setAgentSelfHeal,
    suspendOnFail, setSuspendOnFail, mobileAlert, setMobileAlert,
  } = useSettingsStore();

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238e8e93' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat' as const,
    backgroundPosition: 'right 12px center',
    paddingRight: '32px',
  };

  return (
    <>
      <SettingsCard title="调度参数限制">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">并行 Worker 槽位</p>
          <select
            value={workerSlots}
            onChange={(e) => setWorkerSlots(e.target.value)}
            className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
            style={selectStyle}
          >
            <option value="2">2 并发 (轻量)</option>
            <option value="4">4 并发 (均衡)</option>
            <option value="8">8 并发 (高性能)</option>
            <option value="16">16 并发 (企业级)</option>
          </select>
        </div>
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">单日最大自动化运行次数</p>
          <input
            type="number"
            value={maxDailyRuns}
            onChange={(e) => setMaxDailyRuns(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
          />
          <p className="mt-1.5 text-[12px] text-[#8e8e93]">防止死循环剧烈消耗配额。</p>
        </div>
      </SettingsCard>

      <SettingsCard title="失败处理与重试">
        <ToggleRow
          label="断网或超时后指数退避重试 (Exponential Backoff)"
          desc="采用 1min / 5min / 15min / 1hour 进行 4 次尝试"
          checked={exponentialBackoff}
          onCheckedChange={setExponentialBackoff}
        />
        <ToggleRow
          label="工具报错让 Agent 原地思辨"
          desc="当 API 报 400 时，给 Agent 至多 3 轮机会尝试修复参数"
          checked={agentSelfHeal}
          onCheckedChange={setAgentSelfHeal}
        />
      </SettingsCard>

      <SettingsCard title="告警触发器">
        <ToggleRow
          label="连续失败将任务挂起并标红 (Suspend)"
          desc="不轻易跳过，等待人类处理"
          checked={suspendOnFail}
          onCheckedChange={setSuspendOnFail}
        />
        <ToggleRow
          label="主系统发呆、熔断推送到手机通道"
          desc="通过通知组件强制唤醒人类监管审核"
          checked={mobileAlert}
          onCheckedChange={setMobileAlert}
        />
      </SettingsCard>
    </>
  );
}

/* ─── Section: Skills & MCP (09.2) ─── */

const MCP_QUICK_TEMPLATES = [
  { label: 'File System', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  { label: 'Brave Search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
  { label: 'SQLite', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite'] },
  { label: 'Web Fetch', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  { label: 'Puppeteer', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] },
  { label: 'Memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
];

interface McpServer { name: string; command: string; args: string[]; env: Record<string, string>; enabled: boolean; transport: string; addedAt: string; }

function SkillsMcpSection() {
  const { skills, loading: skillsLoading, fetchSkills, enableSkill, disableSkill } = useSkillsStore();
  const { status: gatewayStatus } = useGatewayStore();
  const isGatewayConnected = gatewayStatus.state === 'running';

  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const [addMcpName, setAddMcpName] = useState('');
  const [addMcpCmd, setAddMcpCmd] = useState('');
  const [addMcpArgs, setAddMcpArgs] = useState('');
  const [addMcpSaving, setAddMcpSaving] = useState(false);

  const fetchMcp = useCallback(async () => {
    setMcpLoading(true);
    try {
      const data = await hostApiFetch<{ servers: McpServer[] }>('/api/mcp');
      setMcpServers(Array.isArray(data.servers) ? data.servers : []);
    } catch { /* ignore */ } finally { setMcpLoading(false); }
  }, []);

  useEffect(() => { void fetchSkills(); void fetchMcp(); }, [fetchSkills, fetchMcp]);

  const handleSkillToggle = async (skillId: string, enabled: boolean) => {
    try {
      if (enabled) await enableSkill(skillId);
      else await disableSkill(skillId);
    } catch { /* ignore */ }
  };

  const handleMcpToggle = async (name: string) => {
    await hostApiFetch(`/api/mcp/${encodeURIComponent(name)}/toggle`, { method: 'PATCH' });
    await fetchMcp();
  };

  const handleMcpDelete = async (name: string) => {
    await hostApiFetch(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await fetchMcp();
  };

  const handleAddMcp = async () => {
    if (!addMcpName.trim() || !addMcpCmd.trim()) return;
    setAddMcpSaving(true);
    try {
      await hostApiFetch('/api/mcp', {
        method: 'POST',
        body: JSON.stringify({
          name: addMcpName.trim(),
          command: addMcpCmd.trim(),
          args: addMcpArgs.trim() ? addMcpArgs.trim().split(/\s+/) : [],
          env: {},
          enabled: true,
          transport: 'stdio',
        }),
      });
      setAddMcpOpen(false);
      setAddMcpName('');
      setAddMcpCmd('');
      setAddMcpArgs('');
      await fetchMcp();
    } finally { setAddMcpSaving(false); }
  };

  const handleQuickTemplate = async (tpl: typeof MCP_QUICK_TEMPLATES[number]) => {
    await hostApiFetch('/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ name: tpl.label, command: tpl.command, args: tpl.args, env: {}, enabled: true, transport: 'stdio' }),
    });
    await fetchMcp();
  };

  return (
    <>
      <SettingsCard
        title="已安装内置技能 (Native Skills)"
        headerRight={
          <button type="button" onClick={() => void fetchSkills()} className="text-[12px] text-[#8e8e93] hover:text-[#000000]">
            ↻ 刷新
          </button>
        }
      >
        {!isGatewayConnected && (
          <div className="my-2 rounded-lg border border-[#fbbf24]/30 bg-[#fffbeb] px-3 py-2.5">
            <span className="text-[13px] text-[#92400e]">⚠ Gateway 未连接。请先连接 Gateway 再管理技能。</span>
          </div>
        )}

        {skillsLoading ? (
          <div className="py-6 text-center text-[13px] text-[#8e8e93]">加载中...</div>
        ) : skills.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#8e8e93]">暂无已安装技能</div>
        ) : (
          skills.map((skill) => (
            <div key={skill.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#000000]">
                  {skill.icon && <span className="mr-1.5">{skill.icon}</span>}
                  {skill.name}
                  {skill.version && <span className="ml-1.5 text-[11px] font-normal text-[#c6c6c8]">v{skill.version}</span>}
                  {skill.isCore && <span className="ml-1.5 rounded-full bg-[#f2f2f7] px-1.5 py-0.5 text-[10px] text-[#8e8e93]">核心</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-[#8e8e93]">{skill.description}</p>
              </div>
              <Switch
                checked={skill.enabled}
                disabled={skill.isCore}
                onCheckedChange={(v) => void handleSkillToggle(skill.id, v)}
              />
            </div>
          ))
        )}

        <div className="py-3 text-center">
          <button type="button" className="text-[13px] text-clawx-ac hover:underline">
            浏览技能市场...
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Model Context Protocol 接入"
        headerRight={
          <div className="flex gap-2">
            <button type="button" onClick={() => void fetchMcp()} className="text-[12px] text-[#8e8e93] hover:text-[#000000]">
              ↻ 刷新
            </button>
            <button
              type="button"
              onClick={() => setAddMcpOpen(true)}
              className="rounded-lg bg-clawx-ac px-3 py-1 text-[12px] font-medium text-white hover:bg-[#0056b3]"
            >
              + 添加服务
            </button>
          </div>
        }
      >
        <div className="py-2">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">快速添加模版 (Quick Templates)</p>
          <div className="flex flex-wrap gap-2">
            {MCP_QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => void handleQuickTemplate(tpl)}
                className="rounded-full border border-black/10 px-3 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
              >
                + {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {mcpLoading ? (
          <div className="py-4 text-center text-[13px] text-[#8e8e93]">加载中...</div>
        ) : mcpServers.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#8e8e93]">暂无 MCP 服务，点击「+ 添加服务」或使用快速模版</div>
        ) : (
          mcpServers.map((svc) => (
            <div key={svc.name} className="border-t border-black/[0.04] py-3">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', svc.enabled ? 'bg-[#10b981]' : 'bg-[#d1d5db]')} />
                  <span className="text-[13px] font-medium text-[#000000]">{svc.name}</span>
                  <span className="rounded-full bg-[#f2f2f7] px-1.5 py-0.5 text-[10px] text-[#8e8e93]">{svc.transport}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleMcpToggle(svc.name)}
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    {svc.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMcpDelete(svc.name)}
                    className="rounded-md border border-[#ef4444]/20 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]"
                  >
                    删除
                  </button>
                </div>
              </div>
              <code className="font-mono text-[11px] text-[#8e8e93]">{svc.command} {svc.args.join(' ')}</code>
            </div>
          ))
        )}
      </SettingsCard>

      {/* Add MCP modal */}
      {addMcpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[400px] rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">添加 MCP 服务</h2>
            <div className="mb-3">
              <p className="mb-1 text-[13px] font-medium text-[#000000]">服务名称</p>
              <input value={addMcpName} onChange={(e) => setAddMcpName(e.target.value)} placeholder="如：My GitHub MCP"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac" />
            </div>
            <div className="mb-3">
              <p className="mb-1 text-[13px] font-medium text-[#000000]">命令 (Command)</p>
              <input value={addMcpCmd} onChange={(e) => setAddMcpCmd(e.target.value)} placeholder="npx"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] font-mono outline-none focus:border-clawx-ac" />
            </div>
            <div className="mb-5">
              <p className="mb-1 text-[13px] font-medium text-[#000000]">参数 (Args，空格分隔)</p>
              <input value={addMcpArgs} onChange={(e) => setAddMcpArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-github"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] font-mono outline-none focus:border-clawx-ac" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAddMcpOpen(false); setAddMcpName(''); setAddMcpCmd(''); setAddMcpArgs(''); }}
                className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]">取消</button>
              <button type="button" onClick={() => void handleAddMcp()} disabled={addMcpSaving || !addMcpName.trim() || !addMcpCmd.trim()}
                className="flex-1 rounded-xl bg-clawx-ac py-2 text-[13px] font-medium text-white hover:bg-[#0056b3] disabled:opacity-50">
                {addMcpSaving ? '添加中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Section: Tool Permissions (09.3) ─── */

function ToolPermissionsSection() {
  const { fileAcl, setFileAcl, terminalAcl, setTerminalAcl, networkAcl, setNetworkAcl } = useSettingsStore();

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238e8e93' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat' as const,
    backgroundPosition: 'right 12px center',
    paddingRight: '32px',
  };

  return (
    <>
      <SettingsCard title="核心沙箱与内置权限">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-clawx-ac" />
            <p className="text-[13px] font-medium text-[#000000]">
              全局风险级别设定 (Global Risk Level)
            </p>
          </div>
          <select
            className="w-[260px] shrink-0 appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#3c3c43] outline-none focus:border-clawx-ac"
            style={selectStyle}
          >
            <option>Standard 防御模式 (读受控区、写必审批)</option>
            <option>Strict 锁定模式 (只读)</option>
            <option>Permissive 宽松模式 (全量访问)</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#000000]">本地文件操作 (File I/O ACL)</p>
            <p className="mt-0.5 text-[12px] text-[#8e8e93]">
              仅允许读写 Workspace 及指定 repo，拦截越权访问
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              className="rounded border border-black/10 px-2 py-1 text-[11px] text-[#3c3c43] hover:bg-[#f2f2f7]"
            >
              ◎ 路径白名单
            </button>
            <Switch checked={fileAcl} onCheckedChange={setFileAcl} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#000000]">终端命令执行 (Terminal ACL)</p>
            <p className="mt-0.5 text-[12px] text-[#8e8e93]">
              拦截 rm -rf、sudo 等高危命令，允许常规构建指令
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              className="rounded border border-black/10 px-2 py-1 text-[11px] text-[#3c3c43] hover:bg-[#f2f2f7]"
            >
              ◎ 编辑黑名单
            </button>
            <Switch checked={terminalAcl} onCheckedChange={setTerminalAcl} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#000000]">
              网络与依赖下载 (Network & Package Managers)
            </p>
            <p className="mt-0.5 text-[12px] text-[#8e8e93]">
              允许 wget、curl、pip、pnpm 进系统的副作用操作
            </p>
          </div>
          <Switch checked={networkAcl} onCheckedChange={setNetworkAcl} />
        </div>
      </SettingsCard>

      <SettingsCard
        title="自定义工具授权 (Custom Tool Grants)"
        headerRight={
          <button
            type="button"
            className="rounded-lg bg-[#111] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#333]"
          >
            + 添加工具许可
          </button>
        }
      >
        <div className="py-2">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">快速授权模版 (Quick Templates)</p>
          <div className="flex flex-wrap gap-2">
            {['Python 解释器', 'Docker Socket', 'Git CLI', 'Node.js 环境'].map((t) => (
              <button
                key={t}
                type="button"
                className="rounded-full border border-black/10 px-3 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-black/10 py-8 text-center text-[13px] text-[#8e8e93]">
          暂无自定义工具授权
        </div>
      </SettingsCard>
    </>
  );
}

/* ─── AutoUpdateSection ─── */

import type { UpdateStatus, UpdateInfo, ProgressInfo } from '@/stores/update';

function AutoUpdateSection({
  currentVersion,
  autoCheckUpdate,
  setAutoCheckUpdate,
  autoDownloadUpdate,
  setAutoDownloadUpdate,
  updateSetAutoDownload,
  updateStatus,
  updateInfo,
  updateProgress,
  updateError,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  initUpdate,
}: {
  currentVersion: string;
  autoCheckUpdate: boolean;
  setAutoCheckUpdate: (v: boolean) => void;
  autoDownloadUpdate: boolean;
  setAutoDownloadUpdate: (v: boolean) => void;
  updateSetAutoDownload: (v: boolean) => void;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateProgress: ProgressInfo | null;
  updateError: string | null;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  initUpdate: () => Promise<void>;
}) {
  useEffect(() => { void initUpdate(); }, [initUpdate]);

  const statusLabel: Record<UpdateStatus, string> = {
    idle: '空闲',
    checking: '检查中...',
    available: '有新版本',
    'not-available': '已是最新',
    downloading: '下载中...',
    downloaded: '已下载，可安装',
    error: '出错',
  };

  return (
    <>
      <SettingsSectionCard title="当前版本" description="">
        <div className="flex items-center justify-between rounded-xl bg-[#f2f2f7] px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-[#000000]">ClawX v{currentVersion}</p>
            <p className="mt-0.5 text-[12px] text-[#8e8e93]">
              状态：{statusLabel[updateStatus]}
              {updateInfo ? ` — 新版本 v${updateInfo.version}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {updateStatus === 'available' && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-[12px]"
                onClick={() => void downloadUpdate()}
              >
                下载更新
              </Button>
            )}
            {updateStatus === 'downloaded' && (
              <Button
                size="sm"
                className="rounded-lg bg-clawx-ac text-[12px] text-white hover:bg-[#0056b3]"
                onClick={installUpdate}
              >
                立即安装
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[12px]"
              onClick={() => void checkForUpdates()}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            >
              {updateStatus === 'checking' ? '检查中...' : '检查更新'}
            </Button>
          </div>
        </div>

        {updateStatus === 'downloading' && updateProgress && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[12px] text-[#8e8e93]">
              <span>下载进度</span>
              <span>{Math.round(updateProgress.percent)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f2f7]">
              <div
                className="h-full rounded-full bg-clawx-ac transition-all"
                style={{ width: `${updateProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {updateError && (
          <p className="mt-2 text-[12px] text-[#ef4444]">{updateError}</p>
        )}

        {updateInfo?.releaseNotes && (
          <div className="mt-3 rounded-xl bg-[#f2f2f7] px-4 py-3">
            <p className="mb-1 text-[12px] font-medium text-[#3c3c43]">更新说明</p>
            <p className="text-[12px] text-[#8e8e93]">{String(updateInfo.releaseNotes)}</p>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard title="自动更新策略" description="">
        <ToggleRow
          label="自动检查更新"
          desc="启动时自动检查是否有新版本可用。"
          checked={autoCheckUpdate}
          onCheckedChange={setAutoCheckUpdate}
        />
        <ToggleRow
          label="自动下载更新"
          desc="发现新版本后自动在后台下载，下载完成后提示安装。"
          checked={autoDownloadUpdate}
          onCheckedChange={(v) => {
            setAutoDownloadUpdate(v);
            void updateSetAutoDownload(v);
          }}
        />
      </SettingsSectionCard>
    </>
  );
}
export default Settings;
