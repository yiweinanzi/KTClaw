import { useEffect, useMemo, useRef, useState } from 'react';
import { hostApiFetch } from '@/lib/host-api';
import { cn } from '@/lib/utils';

type FeishuIntegrationStatus = {
  docsVersion: string;
  openClaw: {
    version: string | null;
    minVersion: string;
    compatible: boolean;
  };
  plugin: {
    bundledVersion: string | null;
    bundledSource: string | null;
    installedVersion: string | null;
    installedPath: string | null;
    recommendedVersion: string;
    installed: boolean;
    needsUpdate: boolean;
  };
  channel: {
    configured: boolean;
    accountIds: string[];
    pluginEnabled: boolean;
  };
  nextAction: 'upgrade-openclaw' | 'install-plugin' | 'update-plugin' | 'configure-channel' | 'ready';
};

type FeishuDoctorSummary = {
  doctor: {
    success: boolean;
    exitCode: number | null;
    stdout?: string;
    stderr?: string;
    error?: string;
  };
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  status: FeishuIntegrationStatus;
};

type FeishuAuthSessionRecord = {
  id: string;
  accountId: string;
  appId: string;
  brand: string;
  state: 'pending' | 'success' | 'failed';
  verificationUriComplete: string;
  qrCodeDataUrl: string;
  userCode: string;
  scopeCount: number;
  createdAt: string;
  expiresAt: string;
  message?: string;
  userOpenId?: string;
  appPermissionUrl?: string;
  missingAppScopes?: string[];
};

type FeishuRobotCreationEntry = {
  url: string;
  qrCodeDataUrl: string;
};

interface FeishuOnboardingWizardProps {
  autoStartAuthorization?: boolean;
  onClose: () => void;
  onLinkExistingRobot: () => void;
}

export function FeishuOnboardingWizard({
  autoStartAuthorization = false,
  onClose,
  onLinkExistingRobot,
}: FeishuOnboardingWizardProps) {
  const [status, setStatus] = useState<FeishuIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [doctoring, setDoctoring] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctorSummary, setDoctorSummary] = useState<FeishuDoctorSummary | null>(null);
  const [authSession, setAuthSession] = useState<FeishuAuthSessionRecord | null>(null);
  const [creationEntry, setCreationEntry] = useState<FeishuRobotCreationEntry | null>(null);
  const autoStartRef = useRef(false);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await hostApiFetch<FeishuIntegrationStatus>('/api/feishu/status');
      setStatus(next);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const primaryAction = useMemo(() => {
    if (!status) return null;
    if (status.nextAction === 'install-plugin') {
      return { label: '安装飞书官方插件', path: '/api/feishu/install' };
    }
    if (status.nextAction === 'update-plugin') {
      return { label: '升级飞书官方插件', path: '/api/feishu/update' };
    }
    return null;
  }, [status]);

  const handleInstallOrUpdate = async () => {
    if (!primaryAction) return;
    setInstalling(true);
    setError(null);
    try {
      await hostApiFetch(primaryAction.path, { method: 'POST' });
      await loadStatus();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setInstalling(false);
    }
  };

  const handleDoctor = async () => {
    setDoctoring(true);
    setError(null);
    try {
      const result = await hostApiFetch<FeishuDoctorSummary>('/api/feishu/doctor', { method: 'POST' });
      setDoctorSummary(result);
      setStatus(result.status);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setDoctoring(false);
    }
  };

  useEffect(() => {
    if (!authSession || authSession.state !== 'pending') return undefined;

    const timer = window.setInterval(async () => {
      try {
        const next = await hostApiFetch<FeishuAuthSessionRecord>(`/api/feishu/auth/status?sessionId=${encodeURIComponent(authSession.id)}`);
        setAuthSession(next);
      } catch (nextError) {
        setError(String(nextError));
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authSession]);

  const handleStartAuthorization = async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const next = await hostApiFetch<FeishuAuthSessionRecord>('/api/feishu/auth/start', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'default' }),
      });
      setAuthSession(next);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setAuthorizing(false);
    }
  };

  useEffect(() => {
    if (
      !autoStartAuthorization
      || autoStartRef.current
      || loading
      || !status
      || !status.channel.configured
      || !status.channel.pluginEnabled
      || authSession
    ) {
      return;
    }
    autoStartRef.current = true;
    void handleStartAuthorization();
  }, [autoStartAuthorization, loading, status, authSession]);

  const handleStartRobotCreation = async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const next = await hostApiFetch<FeishuRobotCreationEntry>('/api/feishu/create/start', {
        method: 'POST',
      });
      setCreationEntry(next);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-3xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-5">
          <div>
            <h2 className="text-[20px] font-semibold text-[#111827]">飞书官方插件接入</h2>
            <p className="mt-1 text-[13px] text-[#6b7280]">
              先完成环境检查、插件安装和诊断，再进入机器人接入流程。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-[13px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
          >
            关闭
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="rounded-2xl border border-black/[0.06] bg-[#f8fafc] px-4 py-6 text-[13px] text-[#6b7280]">
              正在检查飞书接入状态...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#ef4444]/20 bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">
              {error}
            </div>
          ) : status ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <StatusCard
                  title="OpenClaw 版本"
                  subtitle={status.openClaw.version ?? 'unknown'}
                  tone={status.openClaw.compatible ? 'ok' : 'warn'}
                  detail={`最低要求 ${status.openClaw.minVersion}`}
                />
                <StatusCard
                  title="飞书插件版本"
                  subtitle={status.plugin.installedVersion ?? '未安装'}
                  tone={status.plugin.installed ? (status.plugin.needsUpdate ? 'warn' : 'ok') : 'warn'}
                  detail={`推荐 ${status.plugin.recommendedVersion}`}
                />
                <StatusCard
                  title="飞书渠道配置"
                  subtitle={status.channel.configured ? `${status.channel.accountIds.length} 个账号` : '未配置'}
                  tone={status.channel.configured && status.channel.pluginEnabled ? 'ok' : 'neutral'}
                  detail={status.channel.pluginEnabled ? '插件已启用' : '插件未启用'}
                />
              </div>

              {primaryAction ? (
                <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium text-[#1d4ed8]">{primaryAction.label}</p>
                      <p className="mt-1 text-[12px] text-[#3b82f6]">
                        当前会自动使用仓库内置的官方飞书插件包，目标版本 {status.plugin.recommendedVersion}。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleInstallOrUpdate()}
                      disabled={installing}
                      className="rounded-full bg-[#2563eb] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                    >
                      {installing ? '处理中...' : primaryAction.label}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-black/[0.06] bg-[#fafafa] px-4 py-4">
                  <p className="text-[15px] font-medium text-[#111827]">关联已有机器人</p>
                  <p className="mt-1 text-[13px] leading-6 text-[#6b7280]">
                    已有飞书机器人时，继续沿用 App ID / App Secret 配置流接入当前渠道账号。
                  </p>
                  <button
                    type="button"
                    onClick={onLinkExistingRobot}
                    className="mt-4 rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-[#111827] hover:bg-white"
                  >
                    继续关联已有机器人
                  </button>
                </div>

                <div className="rounded-2xl border border-black/[0.06] bg-[#fafafa] px-4 py-4">
                  <p className="text-[15px] font-medium text-[#111827]">新建飞书机器人</p>
                  <p className="mt-1 text-[13px] leading-6 text-[#6b7280]">
                    未配置 App ID / App Secret 时，先扫码进入飞书官方创建页，创建完成后再回到应用继续配置与授权。
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleStartRobotCreation()}
                    disabled={authorizing}
                    className="mt-4 rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-[#111827] hover:bg-white disabled:opacity-50"
                  >
                    {authorizing ? '准备二维码中...' : '扫码创建飞书机器人'}
                  </button>
                </div>
              </div>

              {creationEntry ? (
                <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-medium text-[#111827]">扫码创建飞书机器人</p>
                      <p className="mt-1 text-[12px] text-[#6b7280]">
                        用飞书扫码打开官方创建页，在手机飞书里完成创建后，回到应用继续关联已有机器人。
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
                    <div className="rounded-2xl border border-black/[0.06] bg-[#fafafa] p-3">
                      <img
                        src={creationEntry.qrCodeDataUrl}
                        alt="Feishu robot creation QR code"
                        className="h-[196px] w-[196px] rounded-xl bg-white object-contain"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[#eff6ff] px-3 py-3 text-[12px] text-[#1d4ed8]">
                        扫码后会进入飞书官方 OpenClaw 创建页。创建完成后，继续用“关联已有机器人”把 App ID / App Secret 接回 KTClaw。
                      </div>
                      <a
                        href={creationEntry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-full border border-black/10 px-4 py-2 text-[12px] font-medium text-[#111827] hover:bg-[#f9fafb]"
                      >
                        打开官方创建页
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}

              {authSession ? (
                <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-medium text-[#111827]">飞书扫码授权</p>
                      <p className="mt-1 text-[12px] text-[#6b7280]">
                        当前状态：{authSession.state} · scope {authSession.scopeCount}
                      </p>
                    </div>
                    {authSession.state === 'success' && authSession.userOpenId ? (
                      <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-[12px] font-medium text-[#166534]">
                        授权完成
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
                    <div className="rounded-2xl border border-black/[0.06] bg-[#fafafa] p-3">
                      <img
                        src={authSession.qrCodeDataUrl}
                        alt="Feishu authorization QR code"
                        className="h-[196px] w-[196px] rounded-xl bg-white object-contain"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[#f8fafc] px-3 py-3 text-[12px] text-[#475467]">
                        <p>用飞书扫码后，在手机飞书里确认授权即可。</p>
                        <p className="mt-2 font-mono text-[11px] text-[#6b7280]">user_code: {authSession.userCode}</p>
                      </div>
                      {authSession.message ? (
                        <div className={cn(
                          'rounded-xl px-3 py-3 text-[12px]',
                          authSession.state === 'failed'
                            ? 'bg-[#fef2f2] text-[#b91c1c]'
                            : authSession.state === 'success'
                              ? 'bg-[#f0fdf4] text-[#166534]'
                              : 'bg-[#eff6ff] text-[#1d4ed8]',
                        )}>
                          {authSession.message}
                        </div>
                      ) : null}
                      {authSession.appPermissionUrl ? (
                        <a
                          href={authSession.appPermissionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full border border-black/10 px-4 py-2 text-[12px] font-medium text-[#111827] hover:bg-[#f9fafb]"
                        >
                          打开飞书权限链接
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {status.channel.configured && status.channel.pluginEnabled && !authSession ? (
                <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-medium text-[#111827]">飞书用户授权</p>
                      <p className="mt-1 text-[12px] text-[#6b7280]">
                        飞书渠道已经配置好时，直接在这里生成授权二维码，不需要再去飞书聊天里输入 `/feishu auth`。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleStartAuthorization()}
                      disabled={authorizing}
                      className="rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-[#111827] hover:bg-[#f9fafb] disabled:opacity-50"
                    >
                      {authorizing ? '准备二维码中...' : '开始飞书用户授权'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-medium text-[#111827]">诊断与说明</p>
                    <p className="mt-1 text-[12px] text-[#6b7280]">
                      文档版本 {status.docsVersion}，可用来核对 OpenClaw 与插件版本是否匹配。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDoctor()}
                    disabled={doctoring}
                    className="rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-[#111827] hover:bg-[#f9fafb] disabled:opacity-50"
                  >
                    {doctoring ? '诊断中...' : '运行飞书诊断'}
                  </button>
                </div>

                {doctorSummary ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-black/[0.06] bg-[#fafafa] px-4 py-3">
                    <p className={cn('text-[13px] font-medium', doctorSummary.doctor.success ? 'text-[#059669]' : 'text-[#b91c1c]')}>
                      OpenClaw doctor: {doctorSummary.doctor.success ? '通过' : '失败'}
                    </p>
                    <p className={cn('text-[13px] font-medium', doctorSummary.validation.valid ? 'text-[#059669]' : 'text-[#b91c1c]')}>
                      飞书渠道配置检查: {doctorSummary.validation.valid ? '通过' : '失败'}
                    </p>
                    {doctorSummary.validation.errors.map((item) => (
                      <p key={item} className="text-[12px] text-[#b91c1c]">{item}</p>
                    ))}
                    {doctorSummary.validation.warnings.map((item) => (
                      <p key={item} className="text-[12px] text-[#92400e]">{item}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  subtitle,
  detail,
  tone,
}: {
  title: string;
  subtitle: string;
  detail: string;
  tone: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <div className={cn(
      'rounded-2xl border px-4 py-4',
      tone === 'ok' ? 'border-[#10b981]/20 bg-[#f0fdf4]' :
        tone === 'warn' ? 'border-[#f59e0b]/20 bg-[#fffbeb]' :
          'border-black/[0.06] bg-white',
    )}>
      <p className="text-[12px] font-medium text-[#6b7280]">{title}</p>
      <p className="mt-2 text-[18px] font-semibold text-[#111827]">{subtitle}</p>
      <p className="mt-2 text-[12px] text-[#6b7280]">{detail}</p>
    </div>
  );
}
