import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { SettingsMemoryKnowledgePanel } from '@/components/settings-center/settings-memory-knowledge-panel';
import { SettingsMigrationPanel } from '@/components/settings-center/settings-migration-panel';
import { SettingsMigrationWizard } from '@/components/settings-center/settings-migration-wizard';
import { UpdateSettings } from '@/components/settings/UpdateSettings';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { invokeIpc, toUserMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { useUpdateStore } from '@/stores/update';

export function Settings() {
  const { t } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    launchAtStartup,
    setLaunchAtStartup,
    gatewayAutoStart,
    setGatewayAutoStart,
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
    <div className="-m-6 h-[calc(100vh-2.5rem)] bg-[linear-gradient(180deg,#f3f4f6_0%,#eceff3_100%)] p-6 dark:bg-background">
      <div className="mx-auto flex h-full max-w-[1360px] overflow-hidden rounded-[32px] border border-black/[0.05] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-background">
        <SettingsNav
          groups={SETTINGS_NAV_GROUPS}
          activeItemId={activeSection}
          onChange={setActiveSection}
        />

        <main className="min-w-0 flex-1 overflow-y-auto bg-white px-[60px] py-8 dark:bg-background">
          <div className="mx-auto max-w-[640px]">
            <header className="mb-8">
              <button
                onClick={() => navigate('/')}
                className="mb-4 flex items-center gap-2 text-[13px] text-[#8e8e93] transition-colors hover:text-[#000000]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回工作台
              </button>
              <h1 className="text-[24px] font-semibold text-[#000000] dark:text-foreground">
                {activeMeta.title} <span className="text-[#3c3c43]">{activeMeta.kicker}</span>
              </h1>
              <p className="mt-2 text-[13px] text-[#3c3c43] dark:text-muted-foreground">
                {activeMeta.subtitle}
              </p>
            </header>

            <div className="space-y-5">{renderActiveSection({
              activeSection,
              theme,
              setTheme,
              language,
              setLanguage,
              launchAtStartup,
              setLaunchAtStartup,
              gatewayStatus,
              restartGateway,
              gatewayAutoStart,
              setGatewayAutoStart,
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
              telemetryEnabled,
              setTelemetryEnabled,
              doctorRunning,
              runDoctor,
              doctorSummary,
              openMigrationWizard: () => setMigrationWizardOpen(true),
              t,
            })}</div>
          </div>
        </main>
      </div>

      {migrationWizardOpen ? (
        <SettingsMigrationWizard
          open
          onOpenChange={setMigrationWizardOpen}
        />
      ) : null}
    </div>
  );
}

type RenderSectionArgs = {
  activeSection: SettingsSectionId;
  theme: 'light' | 'dark' | 'system';
  setTheme: (value: 'light' | 'dark' | 'system') => void;
  language: string;
  setLanguage: (value: string) => void;
  launchAtStartup: boolean;
  setLaunchAtStartup: (value: boolean) => void;
  gatewayStatus: { state: string; port?: number };
  restartGateway: () => unknown;
  gatewayAutoStart: boolean;
  setGatewayAutoStart: (value: boolean) => void;
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
      return (
        <>
          <SettingsSectionCard title="外观与语言" description="延续极简浅底的桌面工作台语义，保留核心偏好设置。">
            <div className="space-y-3">
              <Label className="text-[15px] font-medium text-[#111827]">主题模式</Label>
              <div className="flex flex-wrap gap-2">
                <ThemeButton active={args.theme === 'light'} icon={Sun} label="浅色" onClick={() => args.setTheme('light')} />
                <ThemeButton active={args.theme === 'dark'} icon={Moon} label="深色" onClick={() => args.setTheme('dark')} />
                <ThemeButton active={args.theme === 'system'} icon={Monitor} label="跟随系统" onClick={() => args.setTheme('system')} />
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-[15px] font-medium text-[#111827]">界面语言</Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={args.language === lang.code ? 'secondary' : 'outline'}
                    className={cn(
                      'rounded-full border-black/10 bg-white text-[#111827] hover:bg-[#f3f4f6]',
                      args.language === lang.code && 'bg-[#eef2f7]',
                    )}
                    onClick={() => args.setLanguage(lang.code)}
                  >
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="本地客户端" description="管理开机启动等与本机使用体验直接相关的设置。">
            <div className="flex items-center justify-between gap-6">
              <div>
                <Label className="text-[15px] font-medium text-[#111827]">开机自动启动</Label>
                <p className="mt-1 text-[13px] text-[#667085]">保持桌面工作台在系统启动后可用。</p>
              </div>
              <Switch checked={args.launchAtStartup} onCheckedChange={args.setLaunchAtStartup} />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="关于 ClawX">
            <p className="text-[14px] text-[#667085]">
              {args.t('settings:about.version', { version: args.currentVersion })}
            </p>
          </SettingsSectionCard>
        </>
      );

    case 'model-provider':
      return (
        <SettingsSectionCard title="模型路由与 Provider" description="沿用现有 Provider 管理能力，并放入新的高保真白卡片层级。">
          <ProvidersSettings />
        </SettingsSectionCard>
      );

    case 'team-role-strategy':
      return (
        <PlaceholderSection
          cards={[
            {
              title: '团队模板',
              description: '将研究、值守、内容等团队形态预置为静态策略骨架。',
            },
            {
              title: '角色职责边界',
              description: '预留 Owner / Reviewer / Runner 的职责分层与默认权限。',
            },
          ]}
        />
      );

    case 'channel-advanced':
      return (
        <PlaceholderSection
          cards={[
            {
              title: '多通道路由',
              description: '静态展示飞书、Telegram 与本地通知的优先级与兜底关系。',
            },
            {
              title: '重试与熔断策略',
              description: '为消息通道失败重试、限流和临时禁用提供视觉骨架。',
            },
          ]}
        />
      );

    case 'automation-defaults':
      return (
        <PlaceholderSection
          cards={[
            {
              title: 'Cron 默认模版',
              description: '管理日报、巡检、周报等定时任务的默认参数与负责人。',
            },
            {
              title: '自动化审批门槛',
              description: '预留成本、工具权限与人工确认的默认阈值配置。',
            },
          ]}
        />
      );

    case 'memory-knowledge':
      return <SettingsMemoryKnowledgePanel />;

    case 'skills-mcp':
      return (
        <PlaceholderSection
          cards={[
            {
              title: '技能目录',
              description: '统一展示已安装技能、推荐技能和来源状态。',
            },
            {
              title: 'MCP 连接器',
              description: '预留连接器健康度、配置摘要和重连入口。',
            },
          ]}
        />
      );

    case 'tool-permissions':
      return (
        <PlaceholderSection
          cards={[
            {
              title: '执行白名单',
              description: '对 shell、文件系统、浏览器等执行权限做静态分层展示。',
            },
            {
              title: '风险边界',
              description: '为未来的审核链路、审批阈值和审计事件预留面板。',
            },
          ]}
        />
      );

    case 'monitoring':
      return <SettingsMonitoringPanel />;

    case 'migration-backup':
      return <SettingsMigrationPanel onLaunchWizard={args.openMigrationWizard} />;

    case 'feedback-developer':
      return (
        <>
          <SettingsSectionCard title={args.t('settings:updates.title')} description="延续真实的更新设置，并嵌入新的设置中心卡片层级。">
            <UpdateSettings />
            <div className="flex items-center justify-between gap-6">
              <Label>{args.t('settings:updates.autoCheck')}</Label>
              <Switch checked={args.autoCheckUpdate} onCheckedChange={args.setAutoCheckUpdate} />
            </div>
            <div className="flex items-center justify-between gap-6">
              <Label>{args.t('settings:updates.autoDownload')}</Label>
              <Switch
                checked={args.autoDownloadUpdate}
                onCheckedChange={(value) => {
                  args.setAutoDownloadUpdate(value);
                  args.updateSetAutoDownload(value);
                }}
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title={args.t('settings:developer.title')} description="保留开发者模式、Doctor 诊断和遥测开关。">
            <div className="flex items-center justify-between gap-6">
              <Label>{args.t('settings:advanced.devMode')}</Label>
              <Switch checked={args.devModeUnlocked} onCheckedChange={args.setDevModeUnlocked} />
            </div>
            <div className="flex items-center justify-between gap-6">
              <Label>{args.t('settings:advanced.telemetry')}</Label>
              <Switch checked={args.telemetryEnabled} onCheckedChange={args.setTelemetryEnabled} />
            </div>

            {args.devModeUnlocked ? (
              <div className="space-y-4 rounded-2xl bg-[#f8fafc] px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="rounded-full" onClick={() => void args.runDoctor('diagnose')} disabled={args.doctorRunning !== null}>
                    {args.doctorRunning === 'diagnose' ? args.t('common:status.running') : args.t('settings:developer.runDoctor')}
                  </Button>
                  <Button variant="outline" className="rounded-full" onClick={() => void args.runDoctor('fix')} disabled={args.doctorRunning !== null}>
                    {args.doctorRunning === 'fix' ? args.t('common:status.running') : args.t('settings:developer.runDoctorFix')}
                  </Button>
                </div>
                {args.doctorSummary ? (
                  <p className="text-[12px] text-[#667085]">{args.doctorSummary}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-[#667085]">启用开发者模式后，可运行 OpenClaw Doctor 和高级诊断动作。</p>
            )}
          </SettingsSectionCard>
        </>
      );

    default:
      return null;
  }
}

function ThemeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Sun;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'outline'}
      className={cn(
        'rounded-full border-black/10 bg-white text-[#111827] hover:bg-[#f3f4f6]',
        active && 'bg-[#eef2f7]',
      )}
      onClick={onClick}
    >
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

function PlaceholderSection({
  cards,
}: {
  cards: Array<{ title: string; description: string }>;
}) {
  return (
    <>
      {cards.map((card) => (
        <SettingsSectionCard key={card.title} title={card.title} description={card.description}>
          <div className="rounded-2xl border border-dashed border-black/[0.08] bg-[#f8fafc] px-4 py-4 text-[13px] leading-7 text-[#667085]">
            当前先以高保真静态骨架承接设计稿，后续再逐步接入真实数据和交互。
          </div>
        </SettingsSectionCard>
      ))}
    </>
  );
}

export default Settings;
