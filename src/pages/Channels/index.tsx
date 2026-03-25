/**
 * Channels Page — Frame 04
 * IM 频道配置与状态管理
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useChannelsStore } from '@/stores/channels';
import { useSettingsStore } from '@/stores/settings';
import { ChannelConfigModal } from '@/components/channels/ChannelConfigModal';
import { FeishuOnboardingWizard } from '@/components/channels/FeishuOnboardingWizard';
import { hostApiFetch } from '@/lib/host-api';
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
  type ChannelRuntimeCapability,
} from '@/types/channel';

/* ─── Status helpers ─── */

const STATUS_DOT: Record<string, string> = {
  connected:    'bg-[#10b981]',
  connecting:   'bg-[#f59e0b]',
  error:        'bg-[#ef4444]',
  disconnected: 'bg-[#d1d5db]',
};

const STATUS_LABEL: Record<string, string> = {
  connected:    '已连接',
  connecting:   '连接中',
  error:        '连接错误',
  disconnected: '未连接',
};

/* ─── Main component ─── */

export function Channels() {
  const { t } = useTranslation('channels');
  const [activeChannel, setActiveChannel] = useState<ChannelType>('feishu');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<ChannelType>('feishu');
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [feishuWizardOpen, setFeishuWizardOpen] = useState(false);
  const [feishuConfigOpen, setFeishuConfigOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<Record<string, ChannelRuntimeCapability>>({});
  const isComposingRef = useRef(false);
  const defaultModel = useSettingsStore((s) => s.defaultModel);

  const { channels, loading, error, fetchChannels, connectChannel, disconnectChannel, deleteChannel, addChannel } =
    useChannelsStore();

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const channelTypes = useMemo(() => {
    const primary = getPrimaryChannels();
    const configuredExtras = channels
      .map((channel) => channel.type)
      .filter((type): type is ChannelType => !primary.includes(type));

    const orderedTypes = [...primary, ...configuredExtras];
    return [...new Set(orderedTypes)].map((id) => ({
      id,
      label: CHANNEL_NAMES[id],
      icon: CHANNEL_ICONS[id],
    }));
  }, [channels]);

  useEffect(() => {
    let active = true;
    const fetchRuntimeCapabilities = async () => {
      try {
        const response = await hostApiFetch('/api/channels/capabilities') as
          | { capabilities?: ChannelRuntimeCapability[] }
          | undefined;
        const list = Array.isArray(response?.capabilities) ? response.capabilities : [];
        if (!active) return;
        const next: Record<string, ChannelRuntimeCapability> = {};
        for (const capability of list) {
          next[capability.channelId] = capability;
        }
        setRuntimeCapabilities(next);
      } catch {
        if (!active) return;
        setRuntimeCapabilities({});
      }
    };
    void fetchRuntimeCapabilities();
    return () => {
      active = false;
    };
  }, [channels]);

  const filtered = channels.filter((c) => c.type === activeChannel);
  const selected = activeChannelId ? channels.find((c) => c.id === activeChannelId) ?? null : null;
  const selectedRuntimeCapability = selected
    ? runtimeCapabilities[selected.id] ?? runtimeCapabilities[`${selected.type}-${selected.accountId || 'default'}`] ?? null
    : null;
  const meta = CHANNEL_META[activeChannel];

  const handleAdd = async () => {
    if (!addName.trim()) return;
    if (addType === 'feishu') {
      setAddOpen(false);
      setFeishuWizardOpen(true);
      return;
    }
    setAddLoading(true);
    try {
      await addChannel({ type: addType, name: addName.trim() });
      setAddOpen(false);
      setAddName('');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteChannel(id);
    if (activeChannelId === id) setActiveChannelId(null);
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(id)}/test`, { method: 'POST' });
      setTestResult({ id, ok: true, msg: '测试消息已发送' });
    } catch (e) {
      setTestResult({ id, ok: false, msg: String(e) });
    }
    setTimeout(() => setTestResult(null), 4000);
  };

  const handleSend = async () => {
    if (!composerValue.trim() || !selected) return;
    const text = composerValue.trim();
    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(selected.id)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setComposerValue('');
      setTestResult({ id: selected.id, ok: true, msg: `已发送：${text}` });
    } catch (e) {
      setTestResult({ id: selected.id, ok: false, msg: String(e) });
    }
    setTimeout(() => setTestResult(null), 4000);
  };

  return (
    <div className="flex h-full flex-row overflow-hidden bg-[#f2f2f7]">

      {/* Panel 1: Channel type list */}
      <div className="flex w-[164px] shrink-0 flex-col border-r border-black/[0.06] bg-white">
        <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-semibold text-[#000000]">CHANNEL 频道</span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[16px] text-[#3c3c43] hover:bg-[#f2f2f7]"
          >
            +
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {channelTypes.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => { setActiveChannel(ch.id); setActiveChannelId(null); }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] transition-colors',
                activeChannel === ch.id
                  ? 'bg-[#f2f2f7] font-medium text-[#000000]'
                  : 'text-[#3c3c43] hover:bg-[#f2f2f7]',
              )}
            >
              <span className="text-[16px]">{ch.icon}</span>
              <span className="truncate">{ch.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Panel 2: Channel list for selected type */}
      <div className="flex w-[252px] shrink-0 flex-col border-r border-black/[0.06] bg-white">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/[0.06] px-4">
          <span className="text-[14px] font-semibold text-[#000000]">
            {CHANNEL_NAMES[activeChannel]} 配置详情
          </span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[16px] text-[#3c3c43] hover:bg-[#f2f2f7]"
          >
            +
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-[#8e8e93]">
              加载中...
            </div>
          ) : error ? (
            <div className="px-4 py-3 text-[12px] text-[#ef4444]">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-[28px]">{CHANNEL_ICONS[activeChannel]}</span>
              <p className="text-[13px] text-[#8e8e93]">暂无已配置的频道</p>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-1 rounded-lg border border-dashed border-[#c6c6c8] px-3 py-1.5 text-[12px] text-[#8e8e93] hover:border-[#8e8e93] hover:text-[#3c3c43]"
              >
                + 添加
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 px-2 py-2">
              {filtered.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannelId(ch.id)}
                  className={cn(
                    'flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors',
                    activeChannelId === ch.id ? 'bg-[#f0f7ff]' : 'hover:bg-[#f2f2f7]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate pr-1 text-[13px] font-medium text-[#000000]">{ch.name}</span>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[ch.status])} />
                  </div>
                  <span className="mt-0.5 text-[11px] text-[#8e8e93]">{STATUS_LABEL[ch.status]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel 3: Detail + IM preview */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {!selected ? (
          /* No channel selected */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="text-[40px]">{CHANNEL_ICONS[activeChannel]}</span>
            <p className="text-[14px] text-[#8e8e93]">选择左侧频道查看详情</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/[0.06] px-5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-[#000000]">{selected.name}</span>
                <span className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  selected.status === 'connected'
                    ? 'bg-[#dcfce7] text-[#059669]'
                    : selected.status === 'error'
                      ? 'bg-[#fee2e2] text-[#ef4444]'
                      : selected.status === 'connecting'
                        ? 'bg-[#fef9c3] text-[#b45309]'
                        : 'bg-[#f2f2f7] text-[#8e8e93]',
                )}>
                  <span className={cn('h-[6px] w-[6px] rounded-full', STATUS_DOT[selected.status])} />
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === 'connected' ? (
                  <button
                    type="button"
                    onClick={() => void disconnectChannel(selected.id)}
                    className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    断开连接
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connectChannel(selected.id)}
                    className="rounded-md bg-clawx-ac px-2.5 py-1 text-[12px] text-white hover:bg-[#0056b3]"
                  >
                    {selected.status === 'connecting' ? '连接中...' : '连接'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleTest(selected.id)}
                  className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                >
                  发送测试
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(selected.id)}
                  className="rounded-md border border-[#ef4444]/30 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]"
                >
                  删除
                </button>
              </div>
            </div>

            {/* Test result feedback */}
            {testResult?.id === selected.id && (
              <div className={cn(
                'mx-5 mt-2 rounded-lg px-3 py-2 text-[12px]',
                testResult.ok ? 'bg-[#dcfce7] text-[#059669]' : 'bg-[#fee2e2] text-[#ef4444]',
              )}>
                {testResult.ok ? '✅ ' : '❌ '}{testResult.msg}
              </div>
            )}

            {/* Config fields (read-only) */}
            {meta.configFields.length > 0 && (
              <div className="shrink-0 border-b border-black/[0.06] px-5 py-3">
                <p className="mb-2 text-[12px] font-medium text-[#8e8e93]">配置信息</p>
                <div className="flex flex-col gap-1.5">
                  {meta.configFields.map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-4">
                      <span className="text-[12px] text-[#3c3c43]">{t(field.label)}</span>
                      <span className="font-mono text-[12px] text-[#8e8e93]">
                        {field.type === 'password' ? '••••••••' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                {selected.error && (
                  <p className="mt-2 text-[12px] text-[#ef4444]">错误：{selected.error}</p>
                )}
              </div>
            )}

            {selectedRuntimeCapability && (
              <div className="shrink-0 border-b border-black/[0.06] px-5 py-3" data-testid="channel-runtime-capabilities">
                <p className="mb-1 text-[12px] font-medium text-[#8e8e93]">Runtime capabilities</p>
                <p className="text-[12px] text-[#3c3c43]">
                  Actions: {selectedRuntimeCapability.availableActions.join(', ') || 'none'}
                </p>
                <p className="mt-1 text-[12px] text-[#8e8e93]">
                  Schema: {selectedRuntimeCapability.configSchemaSummary.totalFieldCount} fields (required {selectedRuntimeCapability.configSchemaSummary.requiredFieldCount})
                </p>
              </div>
            )}

            {/* Channel activity panel */}
            <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
              <ChannelActivityPanel channel={selected} />
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-black/[0.06] px-4 py-3">
              <div className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#8e8e93] hover:bg-[#f2f2f7]">
                  🎤
                </button>
                <div className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-[#f2f2f7] px-2 py-0.5 text-[12px] text-[#3c3c43]">
                  <span className="h-[6px] w-[6px] rounded-full bg-[#10b981]" />
                  <span className="font-medium">{defaultModel || 'Not configured'}</span>
                  <span className="text-[#8e8e93]">▾</span>
                </div>
                <input
                  value={composerValue}
                  onChange={(e) => setComposerValue(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      const nativeEvent = e.nativeEvent as KeyboardEvent;
                      if (
                        isComposingRef.current
                        || nativeEvent.isComposing
                        || nativeEvent.keyCode === 229
                      ) {
                        return;
                      }
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={`在 ${selected.name} 发送消息...`}
                  className="flex-1 bg-transparent text-[14px] text-[#000000] outline-none placeholder:text-[#8e8e93]"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!composerValue.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10b981] text-white shadow-sm transition-colors hover:bg-[#059669] disabled:opacity-40"
                >
                  ▶
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Channel Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[360px] rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">添加频道</h2>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">频道类型</p>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as ChannelType)}
                className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
              >
                {channelTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>{ct.icon} {ct.label}</option>
                ))}
              </select>
            </div>
            <div className="mb-5">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">频道名称</p>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="例如：研发中心飞书群"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAddOpen(false); setAddName(''); }}
                className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={addLoading || !addName.trim()}
                className="flex-1 rounded-xl bg-clawx-ac py-2 text-[13px] font-medium text-white hover:bg-[#0056b3] disabled:opacity-50"
              >
                {addLoading ? '添加中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {feishuWizardOpen && (
        <FeishuOnboardingWizard
          onClose={() => setFeishuWizardOpen(false)}
          onLinkExistingRobot={() => {
            setFeishuWizardOpen(false);
            setFeishuConfigOpen(true);
          }}
        />
      )}

      {feishuConfigOpen && (
        <ChannelConfigModal
          initialSelectedType="feishu"
          configuredTypes={[...new Set(channels.map((channel) => channel.type))]}
          onClose={() => setFeishuConfigOpen(false)}
          onChannelSaved={async () => {
            await fetchChannels();
            setActiveChannel('feishu');
          }}
        />
      )}
    </div>
  );
}

export default Channels;

/* ─── Channel Activity Panel ─── */

import type { Channel } from '@/types/channel';

function ChannelActivityPanel({ channel }: { channel: Channel }) {
  const isConnected = channel.status === 'connected';
  const isError = channel.status === 'error';

  const lastActivity = channel.lastActivity
    ? new Date(channel.lastActivity).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Status card */}
      <div className={cn(
        'rounded-xl border px-4 py-3',
        isConnected ? 'border-[#10b981]/20 bg-[#f0fdf4]' :
        isError ? 'border-[#ef4444]/20 bg-[#fef2f2]' :
        'border-black/[0.06] bg-[#f9f9f9]',
      )}>
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[channel.status])} />
          <span className={cn('text-[13px] font-medium',
            isConnected ? 'text-[#059669]' : isError ? 'text-[#ef4444]' : 'text-[#8e8e93]',
          )}>
            {STATUS_LABEL[channel.status]}
          </span>
        </div>
        {lastActivity && (
          <p className="mt-1 text-[12px] text-[#8e8e93]">最近活动：{lastActivity}</p>
        )}
        {channel.error && (
          <p className="mt-1 text-[12px] text-[#ef4444]">{channel.error}</p>
        )}
      </div>

      {/* Info rows */}
      <div className="rounded-xl border border-black/[0.06] bg-white">
        {[
          { label: '频道 ID', value: channel.id },
          { label: '类型', value: channel.type.toUpperCase() },
          channel.accountId ? { label: '账号 ID', value: channel.accountId } : null,
        ].filter(Boolean).map((row) => (
          <div key={row!.label} className="flex items-center justify-between border-b border-black/[0.04] px-4 py-2.5 last:border-b-0">
            <span className="text-[12px] text-[#8e8e93]">{row!.label}</span>
            <span className="font-mono text-[12px] text-[#3c3c43]">{row!.value}</span>
          </div>
        ))}
      </div>

      {/* Message placeholder */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#c6c6c8] py-10 text-center">
        {isConnected ? (
          <>
            <span className="text-[28px]">💬</span>
            <p className="text-[13px] text-[#8e8e93]">等待消息中</p>
            <p className="text-[12px] text-[#c6c6c8]">频道已连接，消息将在此显示</p>
          </>
        ) : (
          <>
            <span className="text-[28px] opacity-40">💬</span>
            <p className="text-[13px] text-[#8e8e93]">频道未连接</p>
            <p className="text-[12px] text-[#c6c6c8]">连接后可在此查看消息记录</p>
          </>
        )}
      </div>
    </div>
  );
}
