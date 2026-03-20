import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SettingsMemoryKnowledgePanel } from '@/components/settings-center/settings-memory-knowledge-panel';
import { SettingsMigrationPanel } from '@/components/settings-center/settings-migration-panel';
import { SettingsMigrationWizard } from '@/components/settings-center/settings-migration-wizard';
import { SettingsMonitoringPanel } from '@/components/settings-center/settings-monitoring-panel';
import { SettingsNav } from '@/components/settings-center/settings-nav';
import { SettingsSectionCard } from '@/components/settings-center/settings-section-card';
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
import { cn } from '@/lib/utils';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
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

    case 'monitoring':
      return <SettingsMonitoringPanel />;

    case 'migration-backup':
      return <SettingsMigrationPanel onLaunchWizard={args.openMigrationWizard} />;

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
                className="flex-1 rounded-xl border border-dashed border-[#c6c6c8] px-3 py-2.5 text-[13px] text-[#8e8e93] transition-colors hover:border-[#8e8e93] hover:text-[#3c3c43]"
              >
                📝 提交 Issue (GitHub)
              </button>
              <button
                type="button"
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
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff]/20"
      />
    </div>
  );
}

/* ─── Section: General (07.1) ─── */

function GeneralSection() {
  const { theme, setTheme, language, setLanguage, launchAtStartup, setLaunchAtStartup } =
    useSettingsStore();

  const [showToolCalls, setShowToolCalls] = useState(false);
  const [emojiAvatar, setEmojiAvatar] = useState(true);
  const [hideAvatarBg, setHideAvatarBg] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [brandName, setBrandName] = useState('KTClaw Control');
  const [brandSubtitle, setBrandSubtitle] = useState('智能编排中枢');
  const [myName, setMyName] = useState('Commander');

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
            className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
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

const STATIC_PROVIDERS = [
  { name: 'OpenAI', connected: true, keySnippet: 'sk-proj-****Fq29', action: 'speed-edit' },
  { name: 'Google Gemini', connected: true, keySnippet: 'AIzaSyB****L8U', action: 'speed-edit' },
  { name: 'Anthropic', connected: true, keySnippet: 'sk-ant-****pQ7x', action: 'speed-edit' },
  { name: 'DeepSeek', connected: false, keySnippet: '未配置 API Key', action: 'add' },
  {
    name: 'Ollama (Local LM)',
    connected: false,
    keySnippet: '未启动本地服务 (127.0.0.1:11434)',
    action: 'setup',
  },
] as const;

function ModelProviderSection({
  gatewayStatus,
  restartGateway,
}: {
  gatewayStatus: { state: string; port?: number };
  restartGateway: () => unknown;
}) {
  const [contextLimit, setContextLimit] = useState(32000);
  const isConnected = gatewayStatus.state === 'running';
  const { gatewayPort, setGatewayPort } = useSettingsStore();
  const [portDraft, setPortDraft] = useState(String(gatewayPort));
  const [savingPort, setSavingPort] = useState(false);

  return (
    <>
      {/* 默认路由与偏好 */}
      <SettingsCard title="默认路由与偏好">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">全局默认模型</p>
          <div className="flex items-center gap-2">
            <select className="flex-1 appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]">
              <option>gpt-4o (OpenAI)</option>
              <option>claude-sonnet-4-6 (Anthropic)</option>
              <option>gemini-2.0-flash (Google)</option>
            </select>
            <span className="shrink-0 rounded-full bg-[#10b981] px-2.5 py-1 text-[11px] font-medium text-white">
              当前选择
            </span>
          </div>
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
            className="w-full accent-[#007aff]"
          />
          <div className="mt-1 text-right text-[12px] text-[#8e8e93]">
            {contextLimit.toLocaleString()} Tokens
          </div>
        </div>
      </SettingsCard>

      {/* 云端服务商配置 */}
      <SettingsCard title="云端服务商配置 (Cloud Providers)">
        {STATIC_PROVIDERS.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  p.connected ? 'bg-[#10b981]' : 'bg-[#d1d5db]',
                )}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#000000]">{p.name}</p>
                <p className="text-[11px] text-[#8e8e93]">{p.keySnippet}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {p.action === 'speed-edit' && (
                <>
                  <button
                    type="button"
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
                  >
                    测速
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
                  >
                    编辑
                  </button>
                </>
              )}
              {p.action === 'add' && (
                <button
                  type="button"
                  className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
                >
                  + 添加
                </button>
              )}
              {p.action === 'setup' && (
                <button
                  type="button"
                  className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7]"
                >
                  设置
                </button>
              )}
            </div>
          </div>
        ))}
      </SettingsCard>

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
                className="w-[100px] rounded-lg border border-black/10 bg-[#f9f9f9] px-3 py-1.5 font-mono text-[12px] text-[#3c3c43] outline-none focus:border-[#007aff] focus:bg-white"
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
  const [autoSpawn, setAutoSpawn] = useState(true);
  const [modelInherit, setModelInherit] = useState(true);
  const [strictIsolation, setStrictIsolation] = useState(true);

  return (
    <>
      {/* 组织运行模板 */}
      <SettingsCard title="组织运行模板">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">当前默认架构方案</p>
          <select className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]">
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

const STATIC_ROUTES = [
  { channel: '飞书全渠道', agent: '+ KTClaw 主脑', agentColor: '#10b981' },
  { channel: 'Discord（Support 群组）', agent: '🐕 小运营顾进', agentColor: '#3b82f6' },
];

function ChannelAdvancedSection() {
  const [groupRate, setGroupRate] = useState('5');

  return (
    <>
      {/* 群聊发言默认策略 */}
      <SettingsCard title="群聊发言默认策略">
        <div className="py-3">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">默认群聊行为模式</p>
          <select className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]">
            <option>@触发（仅被 @ 时回复）</option>
            <option>全量监听（所有消息都响应）</option>
            <option>静默（不主动发言）</option>
          </select>
        </div>
      </SettingsCard>

      {/* 路由分发矩阵 */}
      <SettingsCard title="路由分发矩阵">
        {STATIC_ROUTES.map((r) => (
          <div key={r.channel} className="flex items-center gap-3 py-3">
            <div className="flex-1 rounded-lg border border-black/10 bg-[#f9f9f9] px-3 py-2 text-[13px] font-medium text-[#000000]">
              {r.channel}
            </div>
            <span className="shrink-0 text-[12px] text-[#8e8e93]">→</span>
            <span className="shrink-0 text-[12px] text-[#8e8e93]">分配给</span>
            <div
              className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[12px] font-medium"
              style={{ color: r.agentColor }}
            >
              {r.agent}
            </div>
          </div>
        ))}
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
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
          />
          <p className="mt-1.5 text-[12px] text-[#8e8e93]">超出后进入 5 分钟的静默冷却。</p>
        </div>
      </SettingsCard>
    </>
  );
}

/* ─── Section: Automation Defaults (08.3) ─── */

function AutomationDefaultsSection() {
  const [workerSlots, setWorkerSlots] = useState('4');
  const [maxDailyRuns, setMaxDailyRuns] = useState('200');
  const [exponentialBackoff, setExponentialBackoff] = useState(true);
  const [agentSelfHeal, setAgentSelfHeal] = useState(true);
  const [suspendOnFail, setSuspendOnFail] = useState(true);
  const [mobileAlert, setMobileAlert] = useState(true);

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
            className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
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
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
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

const NATIVE_SKILLS_DATA = [
  { id: 'file_system', name: 'file_system', tag: null as string | null, desc: '本地文件的读写、搜索、目录遍历', enabled: true },
  { id: 'browser_control', name: 'browser_control', tag: '(Playwright)', desc: '控制无头浏览器抓包、截屏与交互点击', enabled: true },
  { id: 'terminal_session', name: 'terminal_session', tag: '(Node PTY)', desc: '长连接跨平台的控制台执行环境', enabled: true },
];

const MCP_QUICK_TEMPLATES = ['File System', 'Brave Search', 'SQLite', 'Web Fetch', 'Puppeteer', 'Memory'];

const MCP_SERVICES_DATA = [
  { tag: 'CB', tagBg: '#111', name: 'MCP GitHub Service', cmd: 'npx -y @modelcontextprotocol/server-github', status: 'active' },
  { tag: 'S3', tagBg: '#3b82f6', name: 'MCP Amazon S3 Bridge', cmd: 'stdmcp_amazonS3 --bucket clawx-assets', status: 'idle' },
];

function SkillsMcpSection() {
  const [activeFilter, setActiveFilter] = useState('全部');
  const [skills, setSkills] = useState(NATIVE_SKILLS_DATA.map((s) => ({ ...s })));

  const FILTER_TABS = [
    { label: '全部', count: 3 },
    { label: '可用', count: 3 },
    { label: '已安装', count: 3 },
    { label: '消耗积分', count: 0 },
  ];

  return (
    <>
      <SettingsCard
        title="已安装内置技能 (Native Skills)"
        headerRight={
          <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#000000]">
            ↻ 刷新
          </button>
        }
      >
        <div className="my-2 rounded-lg border border-[#fbbf24]/30 bg-[#fffbeb] px-3 py-2.5">
          <span className="text-[13px] text-[#92400e]">
            ⚠ Gateway 未连接。请先连接 Gateway 再管理技能。
          </span>
        </div>

        <div className="my-3 flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setActiveFilter(tab.label)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                activeFilter === tab.label
                  ? 'bg-[#007aff] text-white'
                  : 'border border-black/10 text-[#3c3c43] hover:bg-[#f2f2f7]',
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {skills.map((skill) => (
          <div key={skill.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#000000]">
                {skill.name}
                {skill.tag && (
                  <span className="ml-1.5 text-[12px] font-normal text-[#8e8e93]">{skill.tag}</span>
                )}
              </p>
              <p className="mt-0.5 text-[12px] text-[#8e8e93]">{skill.desc}</p>
            </div>
            <Switch
              checked={skill.enabled}
              onCheckedChange={(v) =>
                setSkills((prev) =>
                  prev.map((sk) => (sk.id === skill.id ? { ...sk, enabled: v } : sk)),
                )
              }
            />
          </div>
        ))}

        <div className="py-3 text-center">
          <button type="button" className="text-[13px] text-[#007aff] hover:underline">
            浏览技能市场...
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Model Context Protocol 接入"
        headerRight={
          <div className="flex gap-2">
            <button type="button" className="text-[12px] text-[#8e8e93] hover:text-[#000000]">
              ↻ 刷新
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#007aff] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#0056b3]"
            >
              + 添加服务
            </button>
          </div>
        }
      >
        <div className="py-2">
          <p className="mb-2 text-[13px] font-medium text-[#000000]">快速添加模版 (Quick Templates)</p>
          <div className="flex flex-wrap gap-2">
            {MCP_QUICK_TEMPLATES.map((t) => (
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

        {MCP_SERVICES_DATA.map((svc) => (
          <div key={svc.name} className="border-t border-black/[0.04] py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: svc.tagBg }}
                >
                  {svc.tag}
                </span>
                <span className="text-[13px] font-medium text-[#000000]">{svc.name}</span>
              </div>
              {svc.status === 'active' ? (
                <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#059669]">
                  Active
                </span>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    唤醒
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    配置
                  </button>
                </div>
              )}
            </div>
            <code className="font-mono text-[11px] text-[#8e8e93]">{svc.cmd}</code>
          </div>
        ))}
      </SettingsCard>
    </>
  );
}

/* ─── Section: Tool Permissions (09.3) ─── */

const CUSTOM_GRANTS_DATA = [
  {
    name: 'Custom Python Script',
    tag: 'High Risk',
    tagColor: '#ef4444',
    path: '/usr/local/bin/python3 /opt/scripts/*',
  },
  {
    name: 'Git CLI',
    tag: 'Safe',
    tagColor: '#10b981',
    path: '/usr/bin/git — clone, pull, push, status, log',
  },
];

function ToolPermissionsSection() {
  const [fileAcl, setFileAcl] = useState(true);
  const [terminalAcl, setTerminalAcl] = useState(true);
  const [networkAcl, setNetworkAcl] = useState(true);

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
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#007aff]" />
            <p className="text-[13px] font-medium text-[#000000]">
              全局风险级别设定 (Global Risk Level)
            </p>
          </div>
          <select
            className="w-[260px] shrink-0 appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[12px] text-[#3c3c43] outline-none focus:border-[#007aff]"
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

        {CUSTOM_GRANTS_DATA.map((grant) => (
          <div key={grant.name} className="border-t border-black/[0.04] py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[#000000]">{grant.name}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ color: grant.tagColor, background: grant.tagColor + '1a' }}
                >
                  {grant.tag}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                >
                  范围配置
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[#ef4444]/20 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]"
                >
                  撤销
                </button>
              </div>
            </div>
            <code className="font-mono text-[11px] text-[#8e8e93]">{grant.path}</code>
          </div>
        ))}
      </SettingsCard>
    </>
  );
}


export default Settings;
